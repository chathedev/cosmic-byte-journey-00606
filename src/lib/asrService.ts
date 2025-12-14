// ASR Service - Async polling flow for transcription
// Flow: 1) Upload file to backend → 2) Poll status by meetingId → 3) Get transcript when complete
// Accepts: MP3, WAV, M4A - backend handles all conversion
// 
// API Response Format (when status: "done"):
// - transcript: string - Full transcript text
// - transcriptSegments: Array<{ speakerId, text, start, end }> - Speaker diarization segments
// - sisStatus: 'queued' | 'processing' | 'done' | 'no_samples' | 'error' | 'disabled' | 'missing_owner'
// - sisMatches: Array<SISMatch> - Speaker identification matches
// - sisMatch: SISMatch - Best match (shortcut to sisMatches[0])
// - sisSpeakers: Array<SISSpeaker> - Speaker payload with matches array
// Accepts: MP3, WAV, M4A - backend handles all conversion

import { debugLog, debugError } from './debugLogger';

const BACKEND_API_URL = 'https://api.tivly.se';
const POLL_INTERVAL_MS = 3000; // Poll every 3 seconds
const MAX_POLL_ATTEMPTS = 600; // Max 30 minutes of polling

// SpeechBrain SIS Speaker Match
export interface SISMatch {
  meetingId: string;
  meetingOwnerEmail: string;
  sampleOwnerEmail: string;
  score: number;
  confidencePercent: number;
  speakerLabel?: string;
  speakerName?: string; // Alias name from voice learning
  segments?: Array<{ start: number; end: number }>;
  durationSeconds?: number | null;
  text?: string | null;
  matchedWords?: number | null;
  totalSampleWords?: number | null;
  updatedAt: string;
}

// SIS Speaker Match Entry (used in sisSpeakers.matches array)
export interface SISSpeakerMatch {
  sampleOwnerEmail: string;
  similarity: number;
}

// SpeechBrain Speaker Identification
// Per docs: sisSpeakers[n] carries bestMatchEmail plus the similarity percent
// that shows up as the "secure 70%" badge. The backend resolves labels
// using both sisMatches and sisSpeakers.bestMatchEmail when speakerLabel is missing.
export interface SISSpeaker {
  label: string;
  segments: Array<{ start: number; end: number }>;
  durationSeconds?: number | null;
  // Per docs: bestMatchEmail links this speaker to an enterprise member
  bestMatchEmail?: string;
  // Per docs: similarity percent for the "secure X%" confidence badge
  similarity?: number;
  // Per docs: speakerName is decorated by backend from stored aliases
  speakerName?: string;
  matches?: SISSpeakerMatch[];
}

// SIS Status types
export type SISStatusType = 
  | 'queued' 
  | 'processing' 
  | 'done' 
  | 'no_samples' 
  | 'error' 
  | 'disabled' 
  | 'missing_owner';

export interface SISStatus {
  status: SISStatusType;
  sisSpeakers?: SISSpeaker[];
  sisMatches?: SISMatch[];
  sisMatch?: SISMatch;
  sisError?: string;
  transcript?: string;
}

export interface ASRResult {
  success: boolean;
  transcript?: string;
  transcriptSegments?: TranscriptSegment[];
  duration?: number;
  processing_time?: number;
  error?: string;
  meetingId?: string;
  sisStatus?: SISStatusType;
  sisMatches?: SISMatch[];
  sisMatch?: SISMatch;
  sisSpeakers?: SISSpeaker[];
}

export interface TranscriptWord {
  text: string;
  start: number;
  end: number;
  confidence?: number;
  speaker?: string;
}

export interface TranscriptSegment {
  speakerId?: string;  // ElevenLabs uses speakerId
  speaker?: string;    // Keep for backwards compatibility
  text: string;
  start: number;
  end: number;
  confidence?: number;
  words?: TranscriptWord[];
}

// SIS Learning entry for voice training feedback
export interface SISLearningEntry {
  email: string;
  similarity: number;
  matchedSegments?: number;
  updated?: boolean;
}

export interface ASRStatus {
  status: 'queued' | 'processing' | 'completed' | 'done' | 'error' | 'failed';
  progress?: number;
  transcript?: string;
  transcriptSegments?: TranscriptSegment[];
  error?: string;
  duration?: number;
  sisStatus?: SISStatusType;
  sisMatches?: SISMatch[];
  sisMatch?: SISMatch;
  sisSpeakers?: SISSpeaker[];
  speakerNames?: Record<string, string>; // Pre-loaded speaker aliases from backend
  sisLearning?: SISLearningEntry[]; // Voice learning results
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
    
    // Log SIS status and matches if available
    if (data.sisStatus) {
      debugLog('🔍 SIS status:', data.sisStatus);
    }
    if (data.sisSpeakers && data.sisSpeakers.length > 0) {
      debugLog('🗣️ SIS speakers found:', data.sisSpeakers.length);
      data.sisSpeakers.forEach((speaker: SISSpeaker) => {
        const duration = speaker.durationSeconds != null ? `${speaker.durationSeconds.toFixed(1)}s` : 'N/A';
        const matchInfo = speaker.bestMatchEmail ? ` → ${speaker.bestMatchEmail} (${((speaker.similarity || 0) * 100).toFixed(0)}%)` : '';
        const matchCount = speaker.matches?.length ? ` [${speaker.matches.length} sample(s)]` : '';
        debugLog(`   - ${speaker.label}: ${duration}${matchInfo}${matchCount}`);
      });
    }
    if (data.sisMatches && data.sisMatches.length > 0) {
      debugLog('🎯 SIS matches found:', data.sisMatches.length, 'match(es)');
      data.sisMatches.forEach((match: SISMatch) => {
        const wordsInfo = match.matchedWords != null ? `(${match.matchedWords} words)` : '';
        debugLog(`   - ${match.sampleOwnerEmail}: ${match.confidencePercent}% ${wordsInfo}${match.speakerLabel ? ` [${match.speakerLabel}]` : ''}`);
      });
    }
    
    return {
      status: data.status || 'queued',
      progress: data.progress,
      transcript: data.transcript,
      transcriptSegments: data.transcriptSegments,
      error: data.error,
      duration: data.duration,
      sisStatus: data.sisStatus,
      sisMatches: data.sisMatches || [],
      sisMatch: data.sisMatch,
      sisSpeakers: data.sisSpeakers || [],
      speakerNames: data.speakerNames || {},
      sisLearning: data.sisLearning || [],
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
      case 'done':
        debugLog('✅ ASR completed!');
        if (status.sisStatus) {
          debugLog(`🔍 SIS status: ${status.sisStatus}`);
        }
        if (status.sisMatch) {
          debugLog(`🎯 Best SIS match: ${status.sisMatch.sampleOwnerEmail} (${status.sisMatch.confidencePercent}%)${status.sisMatch.speakerLabel ? ` [${status.sisMatch.speakerLabel}]` : ''}`);
        }
        return {
          success: true,
          transcript: status.transcript,
          transcriptSegments: status.transcriptSegments,
          duration: status.duration,
          meetingId,
          sisStatus: status.sisStatus,
          sisMatches: status.sisMatches,
          sisMatch: status.sisMatch,
          sisSpeakers: status.sisSpeakers,
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

/**
 * Poll SIS status independently by meetingId
 * Use this for monitoring SpeechBrain speaker identification separately from transcript
 */
export async function pollSISStatus(meetingId: string): Promise<SISStatus> {
  const token = localStorage.getItem('authToken');
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  try {
    const response = await fetch(`${BACKEND_API_URL}/asr/sis-status?meetingId=${encodeURIComponent(meetingId)}`, {
      method: 'GET',
      headers,
    });

    // 404 = job not registered yet
    if (response.status === 404) {
      debugLog('🔍 SIS status: 404 - job not found');
      return { status: 'queued' };
    }

    if (!response.ok) {
      debugLog('🔍 SIS status check failed:', response.status);
      return { status: 'queued' };
    }

    const data = await response.json();
    debugLog('🔍 SIS status:', data.status);
    
    // Log speakers if available
    if (data.sisSpeakers && data.sisSpeakers.length > 0) {
      debugLog('🗣️ SIS speakers:', data.sisSpeakers.length);
      data.sisSpeakers.forEach((speaker: SISSpeaker) => {
        debugLog(`   - ${speaker.label}: ${speaker.durationSeconds?.toFixed(1)}s${speaker.bestMatchEmail ? ` → ${speaker.bestMatchEmail}` : ''}`);
      });
    }
    
    // Log matches if available
    if (data.sisMatches && data.sisMatches.length > 0) {
      debugLog('🎯 SIS matches:', data.sisMatches.length);
      data.sisMatches.forEach((match: SISMatch) => {
        const details = [
          `${match.confidencePercent}%`,
          match.speakerLabel ? `[${match.speakerLabel}]` : '',
          match.durationSeconds ? `${match.durationSeconds.toFixed(1)}s` : ''
        ].filter(Boolean).join(' ');
        debugLog(`   - ${match.sampleOwnerEmail}: ${details}`);
      });
    }
    
    return {
      status: data.status || 'queued',
      sisSpeakers: data.sisSpeakers || [],
      sisMatches: data.sisMatches || [],
      sisMatch: data.sisMatch,
      sisError: data.sisError,
      transcript: data.transcript,
    };
  } catch (error: any) {
    debugLog('🔍 SIS status network error');
    return { status: 'queued' };
  }
}

// Legacy exports for backwards compatibility
export const submitASRJob = uploadAudioForTranscription;
export const transcribeDirectly = uploadAudioForTranscription;
export const storeJobIdInMeeting = async (meetingId: string, jobId: string) => {
  // No longer needed - backend tracks by meetingId
  debugLog('storeJobIdInMeeting is deprecated, backend uses meetingId');
};
