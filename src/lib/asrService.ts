// Direct ASR Service - Frontend handles transcription directly
// Client ASR + POST transcript to backend = fast path per spec

const ASR_ENDPOINT = 'https://transcribe.api.tivly.se/transcribe';
const API_BASE_URL = 'https://api.tivly.se';

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
 * Transcribe audio directly via ASR service (no backend proxy)
 * Much faster and more reliable than going through the backend
 */
export async function transcribeDirectly(
  audioBlob: Blob,
  options: ASROptions = {}
): Promise<ASRResult> {
  const { language = 'sv', onProgress } = options;
  
  const fileSizeMB = audioBlob.size / 1024 / 1024;
  console.log('🎤 Direct ASR: Starting transcription', {
    fileSize: `${fileSizeMB.toFixed(2)}MB`,
    fileType: audioBlob.type,
    language
  });

  // Validate file size (250MB limit)
  if (fileSizeMB > 250) {
    return { success: false, error: 'File size exceeds 250MB limit' };
  }

  onProgress?.('uploading', 10);

  const formData = new FormData();
  const fileName = audioBlob.type.includes('webm') ? 'audio.webm' : 
                   audioBlob.type.includes('mp4') ? 'audio.m4a' : 'audio.wav';
  formData.append('file', audioBlob, fileName);
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
      console.error('❌ Direct ASR failed:', {
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

    // Handle both response formats
    const transcript = data.transcript || data.text || '';
    
    console.log('✅ Direct ASR complete:', {
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
    console.error('❌ Direct ASR error:', error);
    return {
      success: false,
      error: error.message || 'Network error during transcription'
    };
  }
}

/**
 * Persist transcript to backend via POST /transcribe
 * Per spec: meetingId + transcript is the fast path
 */
export async function persistTranscript(
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
    return { success: false, error: 'Authentication required' };
  }

  console.log('📝 Persisting transcript to backend:', meetingId);

  try {
    const response = await fetch(`${API_BASE_URL}/transcribe`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        meetingId,
        transcript,
        duration: options?.duration,
        processing_time: options?.processing_time,
        language: options?.language || 'sv',
        meetingTitle: options?.meetingTitle,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Persist transcript failed:', response.status, errorText);
      return {
        success: false,
        error: `Persist failed: ${response.status}`
      };
    }

    const data = await response.json();
    console.log('✅ Transcript persisted:', data);

    return {
      success: true,
      transcript: data.transcript,
      path: data.path,
      jsonPath: data.jsonPath,
      duration: data.duration,
      processing_time: data.processing_time
    };
  } catch (error: any) {
    console.error('❌ Persist error:', error);
    return {
      success: false,
      error: error.message || 'Network error during persist'
    };
  }
}

/**
 * Transcribe and persist in one flow (per spec)
 * 1. Run ASR client-side
 * 2. POST /transcribe with meetingId + transcript
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
  
  console.log('🚀 Client ASR flow: Transcribing meeting', meetingId);
  
  // Step 1: Transcribe directly via ASR service
  const asrResult = await transcribeDirectly(audioBlob, asrOptions);
  
  if (!asrResult.success || !asrResult.transcript) {
    console.error('❌ ASR failed for meeting:', meetingId);
    // Persist failure status
    await persistTranscript(meetingId, '', {
      language: asrOptions.language,
      meetingTitle,
    }).catch(e => console.error('Failed to persist failure:', e));
    return asrResult;
  }
  
  // Step 2: POST /transcribe with transcript (fast path per spec)
  const persistResult = await persistTranscript(meetingId, asrResult.transcript, {
    duration: asrResult.duration,
    processing_time: asrResult.processing_time,
    language: asrOptions.language,
    meetingTitle,
  });
  
  if (persistResult.success) {
    console.log('✅ Transcript persisted successfully');
    onTranscriptReady?.(asrResult.transcript);
  } else {
    console.error('❌ Failed to persist transcript:', persistResult.error);
  }
  
  return {
    ...asrResult,
    path: persistResult.path,
    jsonPath: persistResult.jsonPath,
  };
}
