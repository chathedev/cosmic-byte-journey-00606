// Audio Retry - Handles re-transcription from server-side audio backup
// Uses the saved audio backup to re-submit for transcription

import { debugLog, debugError } from './debugLogger';

const BACKEND_API_URL = 'https://api.tivly.se';

interface RetryResult {
  success: boolean;
  meetingId?: string;
  error?: string;
  errorCode?: string;
}

/**
 * Retry transcription using the server-side audio backup
 * This triggers the backend to re-process the saved audio file
 */
export async function retryTranscriptionFromBackup(
  meetingId: string,
  downloadPath?: string
): Promise<RetryResult> {
  const token = localStorage.getItem('authToken');
  
  debugLog('🔄 Retrying transcription from backup:', { meetingId, downloadPath });
  
  try {
    const response = await fetch(`${BACKEND_API_URL}/asr/retry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        meetingId,
        useBackup: true,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorCode = errorData.error;
      const errorMsg = errorData.message;
      
      debugError('❌ Retry request failed:', { errorCode, errorMsg, status: response.status });
      
      // Handle specific backend error codes with user-friendly messages
      if (errorCode === 'audio_encryption_metadata_missing') {
        return { 
          success: false, 
          error: 'Ljudfilen kunde inte dekrypteras. Ladda upp originalfilen igen för att transkribera på nytt.',
          errorCode: 'audio_encryption_metadata_missing'
        };
      }
      
      if (errorCode === 'audio_not_found' || errorCode === 'backup_not_found') {
        return { 
          success: false, 
          error: 'Ljudinspelningen hittades inte på servern. Ladda upp originalfilen igen.',
          errorCode
        };
      }
      
      // Generic error fallback
      let errorMessage = errorMsg || `Återförsök misslyckades (${response.status})`;
      return { success: false, error: errorMessage, errorCode };
    }
    
    const data = await response.json();
    debugLog('✅ Retry request successful:', data);
    
    return {
      success: true,
      meetingId: data.meetingId || meetingId,
    };
  } catch (error: any) {
    debugError('❌ Retry request error:', error);
    return {
      success: false,
      error: error?.message || 'Nätverksfel vid återförsök',
    };
  }
}

/**
 * Check if a meeting has an audio backup available
 */
export async function checkAudioBackupAvailable(meetingId: string): Promise<boolean> {
  const token = localStorage.getItem('authToken');
  
  try {
    const response = await fetch(`${BACKEND_API_URL}/asr/status?meetingId=${meetingId}`, {
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
    });
    
    if (!response.ok) return false;
    
    const data = await response.json();
    return data.audioBackup?.available === true;
  } catch {
    return false;
  }
}

/**
 * Get audio backup download URL for a meeting
 */
export async function getAudioBackupUrl(meetingId: string): Promise<string | null> {
  const token = localStorage.getItem('authToken');
  
  try {
    const response = await fetch(`${BACKEND_API_URL}/asr/status?meetingId=${meetingId}`, {
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    return data.audioDownloadPath || data.audioBackup?.downloadPath || null;
  } catch {
    return null;
  }
}
