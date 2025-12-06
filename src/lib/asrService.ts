// Direct ASR Service - Frontend handles transcription directly
// Flow: 1) Send audio to ASR service 2) Save transcript to backend 3) Send email notification

import { debugLog, debugError } from './debugLogger';
import { sendTranscriptionCompleteEmail, sendFirstMeetingFeedbackEmail, isFirstMeetingEmailNeeded } from './emailNotification';

const ASR_ENDPOINT = 'https://asr.api.tivly.se/transcribe';
const BACKEND_API_URL = 'https://api.tivly.se';

export interface ASRResult {
  success: boolean;
  transcript?: string;
  duration?: number;
  processing_time?: number;
  path?: string;
  jsonPath?: string;
  error?: string;
}

export interface ASROptions {
  language?: string;
  onProgress?: (stage: 'uploading' | 'processing' | 'complete', percent: number) => void;
}

/**
 * Parse ASR response - extract text from JSON if needed
 */
function parseTranscriptResponse(data: any): string {
  // If data is a string that looks like JSON, parse it
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      if (parsed.text) return parsed.text;
      if (parsed.transcript) return parsed.transcript;
      return data;
    } catch {
      return data;
    }
  }
  
  // If data has text or transcript field, use that
  if (data?.text) return data.text;
  if (data?.transcript) return data.transcript;
  
  // Return as-is if it's already a string
  if (typeof data === 'string') return data;
  
  // Last resort: stringify if it's an object
  return '';
}

/**
 * Step 1: Send audio to ASR service and get transcript back
 * Endpoint: https://asr.api.tivly.se/transcribe
 */
export async function transcribeDirectly(
  audioBlob: Blob,
  options: ASROptions = {}
): Promise<ASRResult> {
  const { language = 'sv', onProgress } = options;
  
  const fileSizeMB = audioBlob.size / 1024 / 1024;
  debugLog('🎤 ASR Step 1: Sending audio to asr.api.tivly.se', {
    fileSize: `${fileSizeMB.toFixed(2)}MB`,
    fileType: audioBlob.type,
    language
  });

  // Validate file size (250MB limit)
  if (fileSizeMB > 250) {
    return { success: false, error: 'File size exceeds 250MB limit' };
  }

  onProgress?.('uploading', 10);

  // Build FormData with 'audio' field (required by ASR service)
  const formData = new FormData();
  const fileName = audioBlob.type.includes('webm') ? 'audio.webm' : 
                   audioBlob.type.includes('mp4') ? 'audio.m4a' : 'audio.wav';
  formData.append('audio', audioBlob, fileName);
  formData.append('language', language);

  try {
    onProgress?.('uploading', 30);
    
    const startTime = Date.now();
    
    const response = await fetch(ASR_ENDPOINT, {
      method: 'POST',
      body: formData,
    });

    onProgress?.('processing', 60);

    if (!response.ok) {
      const errorText = await response.text();
      debugError('❌ ASR service error:', {
        status: response.status,
        error: errorText
      });
      return {
        success: false,
        error: `ASR failed: ${response.status} - ${errorText}`
      };
    }

    const data = await response.json();
    const processingTime = Date.now() - startTime;
    
    onProgress?.('complete', 100);

    // Parse transcript - extract text from JSON response
    const transcript = parseTranscriptResponse(data);
    
    if (!transcript) {
      debugError('❌ ASR returned empty transcript:', data);
      return {
        success: false,
        error: 'ASR returned empty transcript'
      };
    }
    
    debugLog('✅ ASR Step 1 complete: Got transcript', {
      transcriptLength: transcript.length,
      processingTime: `${processingTime}ms`,
      duration: data.duration
    });

    return {
      success: true,
      transcript,
      duration: data.duration,
      processing_time: processingTime
    };
  } catch (error: any) {
    debugError('❌ ASR network error:', error);
    return {
      success: false,
      error: error.message || 'Network error during transcription'
    };
  }
}

/**
 * Step 2: Save transcript to backend via PUT /meetings/:id
 * This updates the meeting with the transcript
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

  // Ensure transcript is clean text, not JSON
  const cleanTranscript = parseTranscriptResponse(transcript);

  debugLog('📝 ASR Step 2: Saving transcript to api.tivly.se', {
    meetingId,
    transcriptLength: cleanTranscript.length
  });

  try {
    // Update the meeting with the transcript
    const response = await fetch(`${BACKEND_API_URL}/meetings/${meetingId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transcript: cleanTranscript,
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
    debugLog('✅ ASR Step 2 complete: Transcript saved to backend');

    return {
      success: true,
      transcript: cleanTranscript,
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

// Keep old function name for backwards compatibility
export const persistTranscript = saveTranscriptToBackend;

/**
 * Complete flow: Transcribe audio via ASR, then save to backend
 * 
 * Flow:
 * 1. Send audio to asr.api.tivly.se/transcribe → get transcript
 * 2. Save transcript to api.tivly.se/meetings/:id → update meeting
 */
export async function transcribeAndSave(
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
  
  debugLog('🚀 ========== TRANSCRIPTION FLOW START ==========');
  debugLog('📋 Meeting ID:', meetingId);
  
  // Step 1: Transcribe via ASR service
  const asrResult = await transcribeDirectly(audioBlob, asrOptions);
  
  if (!asrResult.success || !asrResult.transcript) {
    debugError('❌ FLOW FAILED at Step 1: ASR transcription failed');
    return asrResult;
  }
  
  debugLog('✅ Step 1 SUCCESS: Got transcript from ASR');
  
  // Notify that transcript is ready (for UI updates)
  onTranscriptReady?.(asrResult.transcript);
  
  // Step 2: Save transcript to backend
  const saveResult = await saveTranscriptToBackend(meetingId, asrResult.transcript, {
    duration: asrResult.duration,
    processing_time: asrResult.processing_time,
    language: asrOptions.language,
    meetingTitle,
  });
  
  if (saveResult.success) {
    debugLog('✅ Step 2 SUCCESS: Transcript saved to backend');
    
    // Step 3: Send email notification
    if (userEmail && authToken) {
      debugLog('📧 Step 3: Sending email notification to', userEmail);
      sendTranscriptionCompleteEmail({
        userEmail,
        userName,
        meetingTitle: meetingTitle || 'Ditt möte',
        meetingId,
        authToken,
      }).then(emailSent => {
        if (emailSent) {
          debugLog('✅ Step 3 SUCCESS: Email notification sent');
        } else {
          debugError('⚠️ Step 3: Email notification failed (non-blocking)');
        }
      });
      
      // Step 4: Send first meeting feedback email (if this is their first meeting)
      if (isFirstMeetingEmailNeeded()) {
        debugLog('📧 Step 4: Sending first meeting feedback email');
        sendFirstMeetingFeedbackEmail({
          userEmail,
          userName,
          authToken,
        }).then(feedbackSent => {
          if (feedbackSent) {
            debugLog('✅ Step 4 SUCCESS: First meeting feedback email sent');
          } else {
            debugLog('ℹ️ Step 4: Feedback email not sent (already sent or failed)');
          }
        });
      }
    }
    
    debugLog('🚀 ========== TRANSCRIPTION FLOW COMPLETE ==========');
  } else {
    debugError('❌ FLOW FAILED at Step 2: Could not save transcript:', saveResult.error);
  }
  
  return {
    ...asrResult,
    path: saveResult.path,
    jsonPath: saveResult.jsonPath,
  };
}
