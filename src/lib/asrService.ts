// Direct ASR Service - Frontend handles transcription directly
// No backend middleman = faster, more reliable

const ASR_ENDPOINT = 'https://transcribe.api.tivly.se/transcribe';

export interface ASRResult {
  success: boolean;
  transcript?: string;
  duration?: number;
  processing_time?: number;
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
 * Transcribe and save to meeting in one flow
 * Frontend handles ASR, then updates backend with result
 */
export async function transcribeAndSave(
  audioBlob: Blob,
  meetingId: string,
  options: ASROptions & { 
    onTranscriptReady?: (transcript: string) => void;
    apiClient: any;
  }
): Promise<ASRResult> {
  const { apiClient, onTranscriptReady, ...asrOptions } = options;
  
  console.log('🚀 Direct ASR flow: Transcribing meeting', meetingId);
  
  // Step 1: Transcribe directly
  const result = await transcribeDirectly(audioBlob, asrOptions);
  
  if (!result.success || !result.transcript) {
    console.error('❌ Transcription failed, updating meeting status');
    // Update meeting with failed status
    try {
      await apiClient.updateMeeting(meetingId, {
        transcriptionStatus: 'failed',
        transcript: ''
      });
    } catch (e) {
      console.error('Failed to update meeting status:', e);
    }
    return result;
  }
  
  // Step 2: Update meeting with transcript
  console.log('📝 Saving transcript to meeting:', meetingId);
  
  try {
    await apiClient.updateMeeting(meetingId, {
      transcript: result.transcript,
      transcriptionStatus: 'done'
    });
    
    console.log('✅ Meeting updated with transcript');
    onTranscriptReady?.(result.transcript);
    
    return result;
  } catch (error: any) {
    console.error('❌ Failed to save transcript:', error);
    return {
      ...result,
      error: 'Transcript generated but failed to save: ' + error.message
    };
  }
}
