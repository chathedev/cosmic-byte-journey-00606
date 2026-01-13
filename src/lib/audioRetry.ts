// Audio Retry - Handles re-transcription from server-side audio backup
// Uses the saved audio backup to re-submit for transcription

import { debugLog, debugError } from './debugLogger';

const BACKEND_API_URL = 'https://api.tivly.se';

interface RetryResult {
  success: boolean;
  meetingId?: string;
  error?: string;
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
      const errorMessage = errorData.error || errorData.message || `Retry failed: ${response.status}`;
      debugError('❌ Retry request failed:', errorMessage);
      return { success: false, error: errorMessage };
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
