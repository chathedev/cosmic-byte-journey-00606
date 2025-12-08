// ASR Service - Uses backend /asr/transcribe endpoint (Vertex AI Speech v2)
// Flow: 1) Send audio to backend 2) Backend calls Vertex AI 3) Save transcript 4) Send email notification

import { debugLog, debugError } from './debugLogger';
import { sendTranscriptionCompleteEmail, sendFirstMeetingFeedbackEmail, isFirstMeetingEmailNeeded } from './emailNotification';
import { convertToMp3, needsConversion } from './audioConverter';

const BACKEND_API_URL = 'https://api.tivly.se';

export interface ASRResult {
  success: boolean;
  transcript?: string;
  duration?: number;
  processing_time?: number;
  path?: string;
  jsonPath?: string;
  error?: string;
  engine?: string;
}

export interface ASROptions {
  language?: string;
  onProgress?: (stage: 'uploading' | 'processing' | 'complete', percent: number) => void;
}

/**
 * Parse ASR response from Vertex AI backend
 * Success: { status: "ok", transcript: "...", metadata: { engine: "vertex-v2" } }
 * Error: { error: "error_code", details: "Human readable error message" }
 */
function parseTranscriptResponse(data: any): { transcript: string; engine?: string; error?: string } {
  // Handle string response
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return parseTranscriptResponse(parsed);
    } catch {
      return { transcript: data };
    }
  }
  
  // Check for error response
  if (data?.error) {
    return { 
      transcript: '', 
      error: data.details || data.error 
    };
  }
  
  // Vertex AI backend format: { status: "ok", transcript: "...", metadata: { engine: "vertex-v2" } }
  if (data?.status === 'ok' && typeof data?.transcript === 'string') {
    return {
      transcript: data.transcript,
      engine: data.metadata?.engine || 'vertex-v2'
    };
  }
  
  // Direct transcript field (fallback)
  if (data?.transcript) {
    return { transcript: data.transcript, engine: data.metadata?.engine };
  }
  
  // Legacy text field
  if (data?.text) {
    return { transcript: data.text };
  }
  
  return { transcript: '' };
}

/**
 * Step 1: Send audio to backend /asr/transcribe endpoint
 * Backend proxies to Deepgram and returns transcript
 */
export async function transcribeDirectly(
  audioBlob: Blob,
  options: ASROptions = {}
): Promise<ASRResult> {
  const { language = 'sv', onProgress } = options;
  
  const fileSizeMB = audioBlob.size / 1024 / 1024;
  
  // Detailed logging for debugging audio issues
  console.log('🎤 ASR Step 1: Preparing audio for backend /asr/transcribe');
  console.log('  - Input blob size:', audioBlob.size, 'bytes', `(${fileSizeMB.toFixed(2)}MB)`);
  console.log('  - Input blob type:', audioBlob.type);
  console.log('  - Language:', language);
  
  // Validate blob is not empty
  if (audioBlob.size < 100) {
    console.error('❌ CRITICAL: Audio blob is empty or nearly empty!');
    return { success: false, error: 'Audio blob is empty - recording failed' };
  }
  
  if (audioBlob.size < 50000) {
    console.warn('⚠️ WARNING: Audio blob is very small, may not contain real audio');
  }

  // Validate file size (250MB limit)
  if (fileSizeMB > 250) {
    return { success: false, error: 'File size exceeds 250MB limit' };
  }

  onProgress?.('uploading', 10);

  // ALWAYS convert to WAV for backend compatibility
  let processedBlob = audioBlob;
  console.log('🔄 Converting audio to WAV format...');
  try {
    processedBlob = await convertToMp3(audioBlob); // convertToMp3 now converts to WAV
    console.log('✅ WAV conversion complete');
    console.log('  - Converted blob size:', processedBlob.size, 'bytes');
    console.log('  - Converted blob type:', processedBlob.type);
  } catch (conversionError: any) {
    console.error('❌ Audio conversion failed:', conversionError);
    return { success: false, error: `Audio conversion failed: ${conversionError.message}` };
  }
  
  // Validate converted blob
  if (processedBlob.size < 1000) {
    console.error('❌ Converted blob is too small:', processedBlob.size, 'bytes');
    return { success: false, error: 'Audio conversion resulted in empty file' };
  }

  onProgress?.('uploading', 30);

  // Build FormData with 'audio' field - always use .wav extension
  const formData = new FormData();
  formData.append('audio', processedBlob, 'meeting.wav');
  
  console.log('📦 FormData prepared:');
  console.log('  - Field name: "audio"');
  console.log('  - File name: meeting.wav');
  console.log('  - Blob size being sent:', processedBlob.size, 'bytes');

  try {
    onProgress?.('uploading', 50);
    
    const startTime = Date.now();
    
    // Use backend /asr/transcribe endpoint (not direct ASR)
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

    onProgress?.('processing', 70);

    if (!response.ok) {
      const errorText = await response.text();
      debugError('❌ Backend ASR error:', {
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

    // Parse transcript from Vertex AI backend response
    const { transcript, engine, error: parseError } = parseTranscriptResponse(data);
    
    if (parseError) {
      debugError('❌ Backend returned error:', parseError);
      return {
        success: false,
        error: parseError
      };
    }
    
    if (!transcript) {
      debugError('❌ Backend returned empty transcript:', data);
      return {
        success: false,
        error: 'No speech detected in audio'
      };
    }
    
    debugLog('✅ ASR Step 1 complete: Got transcript from Vertex AI backend', {
      transcriptLength: transcript.length,
      processingTime: `${processingTime}ms`,
      engine: engine || 'vertex-v2'
    });

    return {
      success: true,
      transcript,
      processing_time: processingTime,
      engine: engine || 'vertex-v2'
    };
  } catch (error: any) {
    debugError('❌ Backend ASR network error:', error);
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

  // Ensure transcript is clean text
  const { transcript: cleanTranscript } = parseTranscriptResponse(transcript);

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
 * Complete flow: Transcribe audio via backend, then save to meeting
 * 
 * Flow:
 * 1. Send audio to api.tivly.se/asr/transcribe → backend calls Deepgram → get transcript
 * 2. Save transcript to api.tivly.se/meetings/:id → update meeting
 * 3. Send email notifications
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
  debugLog('📁 File size:', `${(audioBlob.size / 1024 / 1024).toFixed(2)}MB`);
  
  // Step 1: Transcribe via backend /asr/transcribe
  const asrResult = await transcribeDirectly(audioBlob, asrOptions);
  
  if (!asrResult.success || !asrResult.transcript) {
    debugError('❌ FLOW FAILED at Step 1: ASR transcription failed');
    return asrResult;
  }
  
  debugLog('✅ Step 1 SUCCESS: Got transcript from backend');
  
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
