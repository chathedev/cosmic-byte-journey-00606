// Recording-specific ASR upload - for live recordings where meeting is already created
// Per backend spec: POST /asr/recording-upload with multipart/form-data
// Requires existing meetingId - will 404 if meeting doesn't exist

const ASR_RECORDING_ENDPOINT = 'https://api.tivly.se/asr/recording-upload';

export interface RecordingUploadOptions {
  file: File;
  /** Required: the pre-created meeting ID */
  meetingId: string;
  language?: string;
  onProgress?: (percent: number) => void;
}

export interface RecordingUploadResult {
  success: boolean;
  meetingId?: string;
  status?: string;
  stage?: string;
  error?: string;
}

/**
 * Upload audio from a live recording to ASR backend.
 * Requires the meeting to already exist (created via POST /meetings first).
 */
export async function uploadRecordingToAsr(options: RecordingUploadOptions): Promise<RecordingUploadResult> {
  const { file, meetingId, language = 'sv' } = options;

  const token = localStorage.getItem('authToken')?.trim();

  if (!token || token.length < 10) {
    return { success: false, error: 'Ingen autentisering (token saknas)' };
  }

  if (!meetingId) {
    return { success: false, error: 'meetingId saknas - mötet måste skapas först' };
  }

  if (!file || file.size < 100) {
    return { success: false, error: 'Filen verkar vara tom' };
  }

  console.log(`[ASR Recording] Uploading ${file.name} (${file.size} bytes) for meeting:`, meetingId);

  // Try multipart first
  const multipartResult = await attemptMultipartUpload(
    file,
    token,
    language,
    meetingId,
    options.onProgress
  );

  if (multipartResult.success) {
    return multipartResult;
  }

  // If it looks like a network/protocol error, try raw body fallback
  const errorLower = (multipartResult.error || '').toLowerCase();
  const isProtocolError =
    errorLower.includes('failed to fetch') ||
    errorLower.includes('network') ||
    errorLower.includes('protocol');

  if (isProtocolError) {
    console.log('[ASR Recording] Multipart failed with protocol error, trying raw body fallback...');
    return attemptRawBodyUpload(
      file,
      token,
      language,
      meetingId,
      options.onProgress
    );
  }

  return multipartResult;
}

/**
 * Standard multipart/form-data upload
 */
async function attemptMultipartUpload(
  file: File,
  token: string,
  language: string,
  meetingId: string,
  onProgress?: (percent: number) => void
): Promise<RecordingUploadResult> {
  const formData = new FormData();
  formData.append('audio', file, file.name);
  formData.append('audioFile', file, file.name); // Also send as audioFile for compatibility
  // Send both keys for backend compatibility
  formData.append('meetingId', meetingId);
  formData.append('meeting_id', meetingId);
  if (language) formData.append('language', language);

  onProgress?.(10);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30 * 60 * 1000);

    const response = await fetch(ASR_RECORDING_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Meeting-Id': meetingId,
      },
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    onProgress?.(90);

    return await parseResponse(response, meetingId, onProgress);
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { success: false, error: 'Uppladdningen tog för lång tid (timeout)' };
    }
    console.error('[ASR Recording] Multipart fetch error:', err);
    return { success: false, error: err?.message || 'Nätverksfel vid uppladdning' };
  }
}

/**
 * Raw body fallback for HTTP/2 protocol errors.
 * Sends the file as request body with metadata in headers.
 */
async function attemptRawBodyUpload(
  file: File,
  token: string,
  language: string,
  meetingId: string,
  onProgress?: (percent: number) => void
): Promise<RecordingUploadResult> {
  onProgress?.(10);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30 * 60 * 1000);

    const headers: Record<string, string> = {
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name),
      'X-Meeting-Id': meetingId,
      'X-MeetingId': meetingId,
      'Authorization': `Bearer ${token}`,
    };

    if (language) headers['X-Language'] = language;

    console.log('[ASR Recording] Raw body upload starting...', { meetingId });

    const response = await fetch(ASR_RECORDING_ENDPOINT, {
      method: 'POST',
      headers,
      body: file,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    onProgress?.(90);

    return await parseResponse(response, meetingId, onProgress);
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { success: false, error: 'Uppladdningen tog för lång tid (timeout)' };
    }
    console.error('[ASR Recording] Raw body fetch error:', err);
    return { success: false, error: err?.message || 'Nätverksfel vid uppladdning' };
  }
}

/**
 * Parse response from either upload method
 */
async function parseResponse(
  response: Response,
  originalMeetingId: string,
  onProgress?: (percent: number) => void
): Promise<RecordingUploadResult> {
  const text = await response.text();
  console.log(`[ASR Recording] Response ${response.status}:`, text.slice(0, 300));

  if (!response.ok) {
    let errorMsg = `Uppladdning misslyckades (${response.status})`;
    
    // Handle 404 specifically - meeting doesn't exist
    if (response.status === 404) {
      errorMsg = 'Mötet hittades inte - det måste skapas först';
    } else {
      try {
        const parsed = JSON.parse(text);
        const rawError = parsed.error || parsed.message;
        if (rawError) {
          errorMsg = typeof rawError === 'string' ? rawError : (rawError.message || JSON.stringify(rawError));
        }
      } catch { /* not JSON */ }
    }
    return { success: false, error: errorMsg };
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return { success: false, error: 'Ogiltigt svar från servern' };
  }

  onProgress?.(100);

  const meetingId = data.meetingId || data.meeting_id || data.id || originalMeetingId;
  console.log(`[ASR Recording] Upload complete - meetingId: ${meetingId}`);
  
  return { success: true, meetingId, status: data.status, stage: data.stage };
}
