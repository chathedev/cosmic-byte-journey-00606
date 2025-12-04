// Direct ASR Service - Frontend handles transcription directly
// Flow: 1) Send audio to ASR service 2) Save transcript to backend

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
 * Step 1: Send audio to ASR service and get transcript back
 * Endpoint: https://asr.api.tivly.se/transcribe
 */
export async function transcribeDirectly(
  audioBlob: Blob,
  options: ASROptions = {}
): Promise<ASRResult> {
  const { language = 'sv', onProgress } = options;
  
  const fileSizeMB = audioBlob.size / 1024 / 1024;
  console.log('🎤 ASR Step 1: Sending audio to asr.api.tivly.se', {
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
      console.error('❌ ASR service error:', {
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

    // Handle response - ASR returns { status: 'ok', transcript, processing_seconds, audio_duration }
    const transcript = data.transcript || data.text || '';
    
    if (!transcript) {
      console.error('❌ ASR returned empty transcript:', data);
      return {
        success: false,
        error: 'ASR returned empty transcript'
      };
    }
    
    console.log('✅ ASR Step 1 complete: Got transcript', {
      transcriptLength: transcript.length,
      processingTime: `${processingTime}ms`,
      duration: data.audio_duration || data.duration
    });

    return {
      success: true,
      transcript,
      duration: data.audio_duration || data.duration,
      processing_time: processingTime
    };
  } catch (error: any) {
    console.error('❌ ASR network error:', error);
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
    console.error('❌ No auth token for saving transcript');
    return { success: false, error: 'Authentication required' };
  }

  console.log('📝 ASR Step 2: Saving transcript to api.tivly.se', {
    meetingId,
    transcriptLength: transcript.length
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
        transcript,
        transcriptionStatus: 'done',
        duration: options?.duration,
        processing_time: options?.processing_time,
        language: options?.language || 'sv',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Backend save error:', response.status, errorText);
      return {
        success: false,
        error: `Save failed: ${response.status}`
      };
    }

    const data = await response.json();
    console.log('✅ ASR Step 2 complete: Transcript saved to backend');

    return {
      success: true,
      transcript: data.transcript || transcript,
      path: data.path,
      jsonPath: data.jsonPath,
      duration: data.duration,
      processing_time: data.processing_time
    };
  } catch (error: any) {
    console.error('❌ Backend save network error:', error);
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
    onTranscriptReady?: (transcript: string) => void;
  }
): Promise<ASRResult> {
  const { onTranscriptReady, meetingTitle, ...asrOptions } = options;
  
  console.log('🚀 ========== TRANSCRIPTION FLOW START ==========');
  console.log('📋 Meeting ID:', meetingId);
  console.log('🎯 Step 1: ASR at asr.api.tivly.se');
  console.log('🎯 Step 2: Save at api.tivly.se');
  
  // Step 1: Transcribe via ASR service
  const asrResult = await transcribeDirectly(audioBlob, asrOptions);
  
  if (!asrResult.success || !asrResult.transcript) {
    console.error('❌ FLOW FAILED at Step 1: ASR transcription failed');
    return asrResult;
  }
  
  console.log('✅ Step 1 SUCCESS: Got transcript from ASR');
  console.log('📝 Transcript preview:', asrResult.transcript.substring(0, 100) + '...');
  
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
    console.log('✅ Step 2 SUCCESS: Transcript saved to backend');
    console.log('🚀 ========== TRANSCRIPTION FLOW COMPLETE ==========');
  } else {
    console.error('❌ FLOW FAILED at Step 2: Could not save transcript:', saveResult.error);
  }
  
  return {
    ...asrResult,
    path: saveResult.path,
    jsonPath: saveResult.jsonPath,
  };
}
