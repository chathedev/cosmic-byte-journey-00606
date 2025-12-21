// Unified ASR upload helper - uses fetch (not XHR) to avoid HTTP/2 protocol errors
// Per backend spec: POST /asr/transcribe with multipart/form-data

const ASR_ENDPOINT = 'https://api.tivly.se/asr/transcribe';

export interface AsrUploadOptions {
  file: File;
  language?: string;
  title?: string;
  traceId?: string;
  onProgress?: (percent: number) => void;
}

export interface AsrUploadResult {
  success: boolean;
  meetingId?: string;
  status?: string;
  stage?: string;
  error?: string;
}

/**
 * Upload audio file to ASR backend using fetch (avoids XHR HTTP/2 issues)
 * Returns the server-generated meetingId for polling
 */
export async function uploadToAsr(options: AsrUploadOptions): Promise<AsrUploadResult> {
  const { file, language = 'sv', title, traceId } = options;

  const token = localStorage.getItem('authToken');
  if (!token) {
    return { success: false, error: 'Ingen autentisering (token saknas)' };
  }

  // Build minimal FormData per spec
  const formData = new FormData();
  formData.append('audio', file, file.name);
  if (language) formData.append('language', language);
  if (title) formData.append('title', title);
  if (traceId) formData.append('traceId', traceId);

  const logPrefix = `[ASR:${traceId || 'no-trace'}]`;

  console.log(`${logPrefix} Uploading ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB) to ${ASR_ENDPOINT}`);

  // Signal progress start
  options.onProgress?.(5);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30 * 60 * 1000); // 30 min timeout

    const response = await fetch(ASR_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        // Do NOT set Content-Type - browser sets it with boundary for FormData
      },
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    options.onProgress?.(95);

    const text = await response.text();
    console.log(`${logPrefix} Response ${response.status}:`, text.slice(0, 500));

    if (!response.ok) {
      let errorMsg = `Uppladdning misslyckades (${response.status})`;
      try {
        const parsed = JSON.parse(text);
        errorMsg = parsed.error || parsed.message || errorMsg;
      } catch {
        // Not JSON
      }
      return { success: false, error: errorMsg };
    }

    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return { success: false, error: 'Ogiltigt svar från servern' };
    }

    options.onProgress?.(100);

    const meetingId = data.meetingId || data.meeting_id || data.id;
    if (!meetingId) {
      console.error(`${logPrefix} No meetingId in response:`, data);
      return { success: false, error: 'Inget meetingId returnerades' };
    }

    console.log(`${logPrefix} Upload complete - meetingId: ${meetingId}`);

    return {
      success: true,
      meetingId,
      status: data.status,
      stage: data.stage,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'Uppladdningen tog för lång tid (timeout)' };
    }
    console.error(`${logPrefix} Fetch error:`, err);
    return { success: false, error: err.message || 'Nätverksfel vid uppladdning' };
  }
}
