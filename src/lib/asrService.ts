// ASR Service - Async polling flow for transcription
// Flow: 1) Upload file to backend → 2) Poll status by meetingId → 3) Get transcript when complete
// Accepts: MP3, WAV, M4A - backend handles all conversion

import { debugLog, debugError } from './debugLogger';

const BACKEND_API_URL = 'https://api.tivly.se';
const POLL_INTERVAL_MS = 3000; // Poll every 3 seconds
const MAX_POLL_ATTEMPTS = 600; // Max 30 minutes of polling

export interface ASRResult {
  success: boolean;
  transcript?: string;
  duration?: number;
  processing_time?: number;
  error?: string;
  meetingId?: string;
}

export interface ASRStatus {
  status: 'queued' | 'processing' | 'completed' | 'error' | 'failed';
  progress?: number;
  transcript?: string;
  error?: string;
  duration?: number;
}

export interface UploadProgress {
  stage: 'uploading' | 'processing' | 'complete' | 'error';
  percent: number;
}

/**
 * Upload audio file for async transcription
 * Returns meetingId for polling
 */
export async function uploadAudioForTranscription(
  file: File,
  meetingId: string,
  options: {
    language?: string;
    onUploadProgress?: (percent: number) => void;
  } = {}
): Promise<{ success: boolean; meetingId?: string; error?: string }> {
  const { language = 'sv', onUploadProgress } = options;
  
  const fileSizeMB = file.size / 1024 / 1024;
  
  console.log('🎤 ASR: Uploading audio for transcription');
  console.log('  - File:', file.name, `(${fileSizeMB.toFixed(2)}MB)`);
  console.log('  - Type:', file.type);
  console.log('  - Meeting ID:', meetingId);
  console.log('  - Language:', language);
  
  // Validate file is not empty
  if (file.size < 100) {
    console.error('❌ CRITICAL: Audio file is empty!');
    return { success: false, error: 'Filen är tom' };
  }

  // Validate file size (100MB limit)
  if (fileSizeMB > 100) {
    return { success: false, error: `Filen är för stor (${fileSizeMB.toFixed(0)}MB). Max 100MB.` };
  }

  onUploadProgress?.(10);

  // Build FormData
  const formData = new FormData();
  formData.append('audio', file);
  formData.append('meetingId', meetingId);
  formData.append('language', language);

  try {
    const token = localStorage.getItem('authToken');
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    // Use XMLHttpRequest for upload progress tracking
    const result = await new Promise<{ success: boolean; meetingId?: string; error?: string }>((resolve) => {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 90); // 0-90% for upload
          onUploadProgress?.(percent);
        }
      });
      
      xhr.addEventListener('load', () => {
        onUploadProgress?.(100);
        
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            
            // Expected response: { status: "queued", meetingId }
            if (data.status === 'queued' || data.status === 'processing') {
              debugLog('✅ ASR: Upload successful, processing started');
              resolve({
                success: true,
                meetingId: data.meetingId || meetingId
              });
            } else if (data.error) {
              resolve({ success: false, error: data.error });
            } else {
              resolve({ success: true, meetingId: meetingId });
            }
          } catch {
            resolve({ success: false, error: 'Invalid response from server' });
          }
        } else if (xhr.status === 413) {
          resolve({ 
            success: false, 
            error: 'Filen är för stor. Max 100MB.' 
          });
        } else {
          let errorMsg = 'Upload failed';
          try {
            const errorData = JSON.parse(xhr.responseText);
            errorMsg = errorData.error || errorData.message || errorMsg;
          } catch { /* ignore */ }
          resolve({ success: false, error: errorMsg });
        }
      });
      
      xhr.addEventListener('error', () => {
        resolve({ success: false, error: 'Network error during upload' });
      });
      
      xhr.addEventListener('timeout', () => {
        resolve({ success: false, error: 'Upload timed out' });
      });
      
      xhr.open('POST', `${BACKEND_API_URL}/asr/transcribe`);
      xhr.timeout = 600000; // 10 minute timeout for large files
      
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      
      xhr.send(formData);
    });
    
    return result;
    
  } catch (error: any) {
    debugError('❌ ASR upload error:', error);
    return {
      success: false,
      error: error.message || 'Upload failed'
    };
  }
}

/**
 * Poll ASR status by meetingId
 * Handles 404 gracefully (job not registered yet)
 */
export async function pollASRStatus(meetingId: string): Promise<ASRStatus> {
  const token = localStorage.getItem('authToken');
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  try {
    const response = await fetch(`${BACKEND_API_URL}/asr/status?meetingId=${encodeURIComponent(meetingId)}`, {
      method: 'GET',
      headers,
    });

    // 404 = job not registered yet, treat as queued
    if (response.status === 404) {
      debugLog('📊 ASR status: 404 - treating as queued');
      return {
        status: 'queued',
        progress: 0,
      };
    }

    // 202 = accepted, processing
    if (response.status === 202) {
      const data = await response.json().catch(() => ({}));
      return {
        status: data.status || 'processing',
        progress: data.progress || 0,
      };
    }

    // Other non-OK status - keep polling as queued
    if (!response.ok) {
      debugLog('📊 ASR status check:', response.status, '- treating as queued');
      return {
        status: 'queued',
        progress: 0,
      };
    }

    const data = await response.json();
    debugLog('📊 ASR status:', data.status, data.progress ? `${data.progress}%` : '');
    
    return {
      status: data.status || 'queued',
      progress: data.progress,
      transcript: data.transcript,
      error: data.error,
      duration: data.duration,
    };
  } catch (error: any) {
    // Network error - keep polling as queued
    debugLog('📊 ASR status network error - treating as queued');
    return {
      status: 'queued',
      progress: 0,
    };
  }
}

/**
 * Wait for ASR completion with polling
 */
export async function waitForASRCompletion(
  meetingId: string,
  options: {
    onProgress?: (status: ASRStatus) => void;
    signal?: AbortSignal;
  } = {}
): Promise<ASRResult> {
  const { onProgress, signal } = options;
  
  let attempts = 0;
  
  while (attempts < MAX_POLL_ATTEMPTS) {
    if (signal?.aborted) {
      return { success: false, error: 'Cancelled' };
    }
    
    attempts++;
    
    const status = await pollASRStatus(meetingId);
    onProgress?.(status);
    
    switch (status.status) {
      case 'queued':
        debugLog('🔄 ASR status: queued');
        break;
        
      case 'processing':
        debugLog('🔄 ASR status: processing', status.progress ? `${status.progress}%` : '');
        break;
        
      case 'completed':
        debugLog('✅ ASR completed!');
        return {
          success: true,
          transcript: status.transcript,
          duration: status.duration,
          meetingId
        };
        
      case 'error':
      case 'failed':
        debugError('❌ ASR failed:', status.error);
        return {
          success: false,
          error: status.error || 'Transcription failed',
          meetingId
        };
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  
  return {
    success: false,
    error: 'Transcription timed out',
    meetingId
  };
}

/**
 * Complete transcription flow: Upload + Poll + Return transcript
 * Used by recording flow for background transcription
 */
export async function transcribeAndSave(
  audioBlob: Blob,
  meetingId: string,
  options: {
    language?: string;
    meetingTitle?: string;
    userEmail?: string;
    userName?: string;
    authToken?: string;
    onProgress?: (stage: 'uploading' | 'queued' | 'processing' | 'complete', percent: number) => void;
    onTranscriptReady?: (transcript: string) => void;
  } = {}
): Promise<ASRResult> {
  const { onProgress, onTranscriptReady, language = 'sv' } = options;
  
  debugLog('🚀 ========== TRANSCRIPTION FLOW START ==========');
  debugLog('📋 Meeting ID:', meetingId);
  debugLog('📁 File size:', `${(audioBlob.size / 1024 / 1024).toFixed(2)}MB`);
  
  // Convert Blob to File if needed
  const file = audioBlob instanceof File 
    ? audioBlob 
    : new File([audioBlob], 'recording.mp3', { type: audioBlob.type || 'audio/mpeg' });
  
  // Step 1: Upload audio
  onProgress?.('uploading', 10);
  
  const uploadResult = await uploadAudioForTranscription(file, meetingId, {
    language,
    onUploadProgress: (percent) => {
      onProgress?.('uploading', Math.min(percent, 40));
    }
  });
  
  if (!uploadResult.success) {
    debugError('❌ Upload failed:', uploadResult.error);
    return { success: false, error: uploadResult.error, meetingId };
  }
  
  debugLog('✅ Upload successful, polling for completion...');
  onProgress?.('queued', 50);
  
  // Step 2: Poll for completion
  const pollResult = await waitForASRCompletion(meetingId, {
    onProgress: (status) => {
      if (status.status === 'queued') {
        onProgress?.('queued', 50);
      } else if (status.status === 'processing') {
        onProgress?.('processing', 50 + (status.progress || 0) * 0.4);
      }
    }
  });
  
  if (!pollResult.success || !pollResult.transcript) {
    debugError('❌ Transcription failed:', pollResult.error);
    return { success: false, error: pollResult.error || 'Transcription failed', meetingId };
  }
  
  debugLog('✅ Transcription complete!');
  onProgress?.('complete', 100);
  
  // Notify callback
  onTranscriptReady?.(pollResult.transcript);
  
  debugLog('🚀 ========== TRANSCRIPTION FLOW COMPLETE ==========');
  
  return {
    success: true,
    transcript: pollResult.transcript,
    duration: pollResult.duration,
    meetingId
  };
}

// Legacy exports for backwards compatibility
export const submitASRJob = uploadAudioForTranscription;
export const transcribeDirectly = uploadAudioForTranscription;
export const storeJobIdInMeeting = async (meetingId: string, jobId: string) => {
  // No longer needed - backend tracks by meetingId
  debugLog('storeJobIdInMeeting is deprecated, backend uses meetingId');
};
