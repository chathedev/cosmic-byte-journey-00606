// Minimal ASR upload - single fetch with fresh FormData
// Per backend spec: POST /asr/transcribe with multipart/form-data
// Fallback: raw body upload if multipart fails with HTTP/2 protocol errors

const ASR_ENDPOINT = 'https://api.tivly.se/asr/transcribe';

export interface AsrUploadOptions {
  file: File;
  language?: string;
  title?: string;
  traceId?: string;
  onProgress?: (percent: number) => void;
  authMode?: 'required' | 'auto' | 'omit';
}

export interface AsrUploadResult {
  success: boolean;
  meetingId?: string;
  status?: string;
  stage?: string;
  error?: string;
}

/**
 * Upload audio file to ASR backend.
 * Tries multipart/form-data first; falls back to raw body on HTTP/2 errors.
 */
export async function uploadToAsr(options: AsrUploadOptions): Promise<AsrUploadResult> {
  const { file, language = 'sv', title, traceId, authMode = 'required' } = options;

  const token = localStorage.getItem('authToken')?.trim();

  if (authMode === 'required' && (!token || token.length < 10)) {
    return { success: false, error: 'Ingen autentisering (token saknas)' };
  }

  if (!file || file.size < 100) {
    return { success: false, error: 'Filen verkar vara tom' };
  }

  console.log(`[ASR] Uploading ${file.name} (${file.size} bytes)`);

  // Try multipart first
  const multipartResult = await attemptMultipartUpload(file, token, language, title, traceId, authMode, options.onProgress);
  
  if (multipartResult.success) {
    return multipartResult;
  }

  // If it looks like a network/protocol error, try raw body fallback
  const errorLower = (multipartResult.error || '').toLowerCase();
  const isProtocolError = errorLower.includes('failed to fetch') || 
                          errorLower.includes('network') ||
                          errorLower.includes('protocol');

  if (isProtocolError) {
    console.log('[ASR] Multipart failed with protocol error, trying raw body fallback...');
    return attemptRawBodyUpload(file, token, language, title, traceId, authMode, options.onProgress);
  }

  return multipartResult;
}

/**
 * Standard multipart/form-data upload
 */
async function attemptMultipartUpload(
  file: File,
  token: string | null,
  language: string,
  title: string | undefined,
  traceId: string | undefined,
  authMode: 'required' | 'auto' | 'omit',
  onProgress?: (percent: number) => void
): Promise<AsrUploadResult> {
  const formData = new FormData();
  formData.append('audio', file, file.name);
  if (language) formData.append('language', language);
  if (title) formData.append('title', title);
  if (traceId) formData.append('traceId', traceId);

  onProgress?.(10);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30 * 60 * 1000);

    const response = await fetch(ASR_ENDPOINT, {
      method: 'POST',
      headers: token && authMode !== 'omit' ? { 'Authorization': `Bearer ${token}` } : {},
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    onProgress?.(90);

    return await parseResponse(response, onProgress);
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { success: false, error: 'Uppladdningen tog för lång tid (timeout)' };
    }
    console.error('[ASR] Multipart fetch error:', err);
    return { success: false, error: err?.message || 'Nätverksfel vid uppladdning' };
  }
}

/**
 * Raw body fallback for HTTP/2 protocol errors.
 * Sends the file as request body with metadata in headers.
 */
async function attemptRawBodyUpload(
  file: File,
  token: string | null,
  language: string,
  title: string | undefined,
  traceId: string | undefined,
  authMode: 'required' | 'auto' | 'omit',
  onProgress?: (percent: number) => void
): Promise<AsrUploadResult> {
  onProgress?.(10);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30 * 60 * 1000);

    const headers: Record<string, string> = {
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name),
    };
    
    if (language) headers['X-Language'] = language;
    if (title) headers['X-Title'] = encodeURIComponent(title);
    if (traceId) headers['X-Trace-Id'] = traceId;
    if (token && authMode !== 'omit') headers['Authorization'] = `Bearer ${token}`;

    console.log('[ASR] Raw body upload starting...');

    const response = await fetch(ASR_ENDPOINT, {
      method: 'POST',
      headers,
      body: file,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    onProgress?.(90);

    return await parseResponse(response, onProgress);
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { success: false, error: 'Uppladdningen tog för lång tid (timeout)' };
    }
    console.error('[ASR] Raw body fetch error:', err);
    return { success: false, error: err?.message || 'Nätverksfel vid uppladdning' };
  }
}

/**
 * Parse response from either upload method
 */
async function parseResponse(
  response: Response,
  onProgress?: (percent: number) => void
): Promise<AsrUploadResult> {
  const text = await response.text();
  console.log(`[ASR] Response ${response.status}:`, text.slice(0, 300));

  if (!response.ok) {
    let errorMsg = `Uppladdning misslyckades (${response.status})`;
    try {
      const parsed = JSON.parse(text);
      errorMsg = parsed.error || parsed.message || errorMsg;
    } catch { /* not JSON */ }
    return { success: false, error: errorMsg };
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return { success: false, error: 'Ogiltigt svar från servern' };
  }

  onProgress?.(100);

  const meetingId = data.meetingId || data.meeting_id || data.id;
  if (!meetingId) {
    return { success: false, error: 'Inget meetingId returnerades' };
  }

  console.log(`[ASR] Upload complete - meetingId: ${meetingId}`);
  return { success: true, meetingId, status: data.status, stage: data.stage };
}
