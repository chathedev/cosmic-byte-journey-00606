// ASR Service - Async polling flow for transcription
// Flow: 1) Submit MP3 to backend → get jobId 2) Poll status 3) Get transcript when complete
// NOTE: MP3 only - no conversion in browser for maximum speed

import { debugLog, debugError } from './debugLogger';
import { sendTranscriptionCompleteEmail, sendFirstMeetingFeedbackEmail, isFirstMeetingEmailNeeded } from './emailNotification';

const BACKEND_API_URL = 'https://api.tivly.se';
const POLL_INTERVAL_MS = 3000; // Poll every 3 seconds
const MAX_POLL_ATTEMPTS = 600; // Max 30 minutes of polling

export interface ASRResult {
  success: boolean;
  transcript?: string;
  duration?: number;
  processing_time?: number;
  path?: string;
  jsonPath?: string;
  error?: string;
  engine?: string;
  jobId?: string;
  meetingId?: string;
}

export interface ASRJobStatus {
  status: 'queued' | 'processing' | 'completed' | 'error' | 'failed';
  progress?: number;
  transcript?: string;
  error?: string;
  engine?: string;
  duration?: number;
  processing_time?: number;
}

export interface ASROptions {
  language?: string;
  onProgress?: (stage: 'uploading' | 'queued' | 'processing' | 'complete', percent: number) => void;
  onStatusChange?: (status: ASRJobStatus) => void;
}

/**
 * Submit audio file for async transcription
 * Returns jobId for polling
 */
export async function submitASRJob(
  audioBlob: Blob,
  meetingId: string,
  options: ASROptions = {}
): Promise<{ success: boolean; jobId?: string; meetingId?: string; error?: string }> {
  const { language = 'sv', onProgress } = options;
  
  const fileSizeMB = audioBlob.size / 1024 / 1024;
  
  console.log('🎤 ASR: Submitting MP3 for async transcription');
  console.log('  - Blob size:', audioBlob.size, 'bytes', `(${fileSizeMB.toFixed(2)}MB)`);
  console.log('  - Meeting ID:', meetingId);
  console.log('  - Language:', language);
  
  // Validate blob is not empty
  if (audioBlob.size < 100) {
    console.error('❌ CRITICAL: Audio blob is empty!');
    return { success: false, error: 'Audio blob is empty - recording failed' };
  }

  // Validate file size (500MB limit for MP3)
  if (fileSizeMB > 500) {
    return { success: false, error: `Filen är för stor (${fileSizeMB.toFixed(0)}MB). Max 500MB.` };
  }

  onProgress?.('uploading', 10);

  // Build FormData - MP3 direct
  const formData = new FormData();
  formData.append('audio', audioBlob, 'meeting.mp3');
  formData.append('meetingId', meetingId);
  formData.append('language', language);
  formData.append('async', 'true'); // Request async processing

  try {
    onProgress?.('uploading', 50);
    
    const token = localStorage.getItem('authToken');
    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`${BACKEND_API_URL}/asr/transcribe`, {
      method: 'POST',
      headers,
      body: formData,
    });

    onProgress?.('uploading', 90);

    if (!response.ok) {
      const errorText = await response.text();
      debugError('❌ ASR submit error:', {
        status: response.status,
        error: errorText
      });
      
      if (response.status === 413) {
        return { 
          success: false, 
          error: `Inspelningen är för lång. Försök med en kortare inspelning eller kontakta support.` 
        };
      }
      
      return {
        success: false,
        error: `ASR submit failed: ${response.status} - ${errorText}`
      };
    }

    const data = await response.json();
    
    onProgress?.('queued', 100);
    
    // Expected response: { status: "queued", meetingId, jobId }
    if (data.status === 'queued' && data.jobId) {
      debugLog('✅ ASR job submitted:', { jobId: data.jobId, meetingId: data.meetingId });
      return {
        success: true,
        jobId: data.jobId,
        meetingId: data.meetingId || meetingId
      };
    }
    
    // Legacy sync response - handle for backwards compatibility
    if (data.status === 'ok' && data.transcript) {
      debugLog('✅ ASR completed synchronously (legacy)');
      return {
        success: true,
        jobId: 'sync-complete',
        meetingId
      };
    }
    
    return {
      success: false,
      error: data.error || 'Unexpected response from ASR service'
    };
    
  } catch (error: any) {
    debugError('❌ ASR submit network error:', error);
    return {
      success: false,
      error: error.message || 'Network error during upload'
    };
  }
}

/**
 * Poll ASR job status
 */
export async function pollASRStatus(jobId: string): Promise<ASRJobStatus> {
  const token = localStorage.getItem('authToken');
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  try {
    const response = await fetch(`${BACKEND_API_URL}/asr/status?jobId=${encodeURIComponent(jobId)}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      debugError('❌ ASR status poll error:', response.status, errorText);
      return {
        status: 'error',
        error: `Status check failed: ${response.status}`
      };
    }

    const data = await response.json();
    return {
      status: data.status || 'queued',
      progress: data.progress,
      transcript: data.transcript,
      error: data.error,
      engine: data.engine,
      duration: data.duration,
      processing_time: data.processing_time
    };
  } catch (error: any) {
    debugError('❌ ASR status poll network error:', error);
    return {
      status: 'error',
      error: error.message || 'Network error during status check'
    };
  }
}

/**
 * Wait for ASR job to complete with polling
 */
export async function waitForASRCompletion(
  jobId: string,
  options: ASROptions = {}
): Promise<ASRResult> {
  const { onProgress, onStatusChange } = options;
  
  let attempts = 0;
  
  while (attempts < MAX_POLL_ATTEMPTS) {
    attempts++;
    
    const status = await pollASRStatus(jobId);
    onStatusChange?.(status);
    
    switch (status.status) {
      case 'queued':
        onProgress?.('queued', 10);
        debugLog('🔄 ASR status: queued');
        break;
        
      case 'processing':
        const progress = status.progress || Math.min(20 + attempts * 2, 90);
        onProgress?.('processing', progress);
        debugLog('🔄 ASR status: processing', progress + '%');
        break;
        
      case 'completed':
        onProgress?.('complete', 100);
        debugLog('✅ ASR completed!');
        return {
          success: true,
          transcript: status.transcript,
          engine: status.engine,
          duration: status.duration,
          processing_time: status.processing_time
        };
        
      case 'error':
      case 'failed':
        debugError('❌ ASR failed:', status.error);
        return {
          success: false,
          error: status.error || 'Transcription failed'
        };
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  
  return {
    success: false,
    error: 'Transcription timed out'
  };
}

/**
 * Save transcript to backend via PUT /meetings/:id
 */
export async function saveTranscriptToBackend(
  meetingId: string,
  transcript: string,
  options?: {
    duration?: number;
    processing_time?: number;
    language?: string;
    meetingTitle?: string;
  }
): Promise<ASRResult> {
  const token = localStorage.getItem('authToken');
  if (!token) {
    debugError('❌ No auth token for saving transcript');
    return { success: false, error: 'Authentication required' };
  }

  debugLog('📝 Saving transcript to backend', {
    meetingId,
    transcriptLength: transcript.length
  });

  try {
    const response = await fetch(`${BACKEND_API_URL}/meetings/${meetingId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transcript,
        transcriptionStatus: 'done',
        duration: options?.duration,
        processing_time: options?.processing_time,
        language: options?.language || 'sv',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      debugError('❌ Backend save error:', response.status, errorText);
      return {
        success: false,
        error: `Save failed: ${response.status}`
      };
    }

    const data = await response.json();
    debugLog('✅ Transcript saved to backend');

    return {
      success: true,
      transcript,
      path: data.path,
      jsonPath: data.jsonPath,
      duration: data.duration,
      processing_time: data.processing_time
    };
  } catch (error: any) {
    debugError('❌ Backend save network error:', error);
    return {
      success: false,
      error: error.message || 'Network error during save'
    };
  }
}

// Alias for backwards compatibility
export const persistTranscript = saveTranscriptToBackend;

/**
 * Store jobId in meeting metadata for resume on page reload
 */
export async function storeJobIdInMeeting(meetingId: string, jobId: string): Promise<void> {
  const token = localStorage.getItem('authToken');
  if (!token) return;
  
  try {
    await fetch(`${BACKEND_API_URL}/meetings/${meetingId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jobId,
        transcriptionStatus: 'processing'
      }),
    });
    debugLog('✅ Stored jobId in meeting:', { meetingId, jobId });
  } catch (error) {
    debugError('❌ Failed to store jobId:', error);
  }
}

/**
 * Complete async flow: Submit audio, poll for completion, save result
 */
export async function transcribeAsync(
  audioBlob: Blob,
  meetingId: string,
  options: ASROptions & { 
    meetingTitle?: string;
    userEmail?: string;
    userName?: string;
    authToken?: string;
    onTranscriptReady?: (transcript: string) => void;
  }
): Promise<ASRResult> {
  const { onTranscriptReady, meetingTitle, userEmail, userName, authToken, ...asrOptions } = options;
  
  debugLog('🚀 ========== ASYNC TRANSCRIPTION FLOW START ==========');
  debugLog('📋 Meeting ID:', meetingId);
  debugLog('📁 File size:', `${(audioBlob.size / 1024 / 1024).toFixed(2)}MB`);
  
  // Step 1: Submit job
  const submitResult = await submitASRJob(audioBlob, meetingId, asrOptions);
  
  if (!submitResult.success || !submitResult.jobId) {
    debugError('❌ FLOW FAILED at Step 1: Job submission failed');
    return { success: false, error: submitResult.error };
  }
  
  const jobId = submitResult.jobId;
  debugLog('✅ Step 1 SUCCESS: Job submitted', { jobId });
  
  // Store jobId in meeting for resume capability
  await storeJobIdInMeeting(meetingId, jobId);
  
  // Step 2: Poll for completion
  const pollResult = await waitForASRCompletion(jobId, asrOptions);
  
  if (!pollResult.success || !pollResult.transcript) {
    debugError('❌ FLOW FAILED at Step 2: Transcription failed');
    // Update meeting status to failed
    await updateMeetingStatus(meetingId, 'failed', pollResult.error);
    return pollResult;
  }
  
  debugLog('✅ Step 2 SUCCESS: Got transcript');
  
  // Notify UI that transcript is ready
  onTranscriptReady?.(pollResult.transcript);
  
  // Step 3: Save transcript to backend (may already be saved by backend)
  const saveResult = await saveTranscriptToBackend(meetingId, pollResult.transcript, {
    duration: pollResult.duration,
    processing_time: pollResult.processing_time,
    language: asrOptions.language,
    meetingTitle,
  });
  
  if (saveResult.success) {
    debugLog('✅ Step 3 SUCCESS: Transcript saved');
    
    // Step 4: Send email notification
    if (userEmail && authToken) {
      debugLog('📧 Step 4: Sending email notification');
      sendTranscriptionCompleteEmail({
        userEmail,
        userName,
        meetingTitle: meetingTitle || 'Ditt möte',
        meetingId,
        authToken,
      }).then(emailSent => {
        debugLog(emailSent ? '✅ Email sent' : '⚠️ Email failed');
      });
      
      // First meeting feedback email
      if (isFirstMeetingEmailNeeded()) {
        sendFirstMeetingFeedbackEmail({
          userEmail,
          userName,
          authToken,
        });
      }
    }
    
    debugLog('🚀 ========== ASYNC TRANSCRIPTION FLOW COMPLETE ==========');
  } else {
    debugError('❌ FLOW FAILED at Step 3: Could not save transcript:', saveResult.error);
  }
  
  return {
    ...pollResult,
    jobId,
    meetingId,
    path: saveResult.path,
    jsonPath: saveResult.jsonPath,
  };
}

/**
 * Update meeting transcription status
 */
async function updateMeetingStatus(meetingId: string, status: string, error?: string): Promise<void> {
  const token = localStorage.getItem('authToken');
  if (!token) return;
  
  try {
    await fetch(`${BACKEND_API_URL}/meetings/${meetingId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transcriptionStatus: status,
        transcriptionError: error
      }),
    });
  } catch (e) {
    debugError('Failed to update meeting status:', e);
  }
}

// Legacy exports for backwards compatibility
export const transcribeDirectly = submitASRJob;
export const transcribeAndSave = transcribeAsync;
