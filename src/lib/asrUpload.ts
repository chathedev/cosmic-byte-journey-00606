// Unified ASR upload helper - uses fetch (not XHR) to avoid HTTP/2 protocol errors
// Per backend spec: POST /asr/transcribe with multipart/form-data

const ASR_ENDPOINT = 'https://api.tivly.se/asr/transcribe';

export interface AsrUploadOptions {
  file: File;
  language?: string;
  title?: string;
  traceId?: string;
  /**
   * Upload progress is not available with fetch+FormData.
   * This callback is best-effort (milestones).
   */
  onProgress?: (percent: number) => void;
  /**
   * Controls Authorization header behavior.
   * - required (default): fail fast if token missing/blank
   * - auto: include header only when token exists
   * - omit: never include header (useful to confirm backend returns missing_token)
   */
  authMode?: 'required' | 'auto' | 'omit';
}

export interface AsrUploadResult {
  success: boolean;
  meetingId?: string;
  status?: string;
  stage?: string;
  error?: string;
}

async function probeAsrWithoutAuth(traceId?: string): Promise<{ ok: boolean; status?: number; text?: string }>
{
  const logPrefix = `[ASR:${traceId || 'no-trace'}]`;
  try {
    // A minimal POST without Authorization and without a file.
    // If this returns 400 audio_required / 401 missing_token, we know the request reached backend.
    const res = await fetch(ASR_ENDPOINT, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      body: new FormData(),
    });
    const text = await res.text().catch(() => '');
    console.log(`${logPrefix} Probe (no auth) status ${res.status}:`, text.slice(0, 200));
    return { ok: true, status: res.status, text };
  } catch (e: any) {
    console.warn(`${logPrefix} Probe (no auth) failed:`, e);
    return { ok: false };
  }
}

/**
 * Upload audio file to ASR backend using fetch.
 * Returns the server-generated meetingId for polling.
 */
export async function uploadToAsr(options: AsrUploadOptions): Promise<AsrUploadResult> {
  const { file, language = 'sv', title, traceId, authMode = 'required' } = options;

  const rawToken = localStorage.getItem('authToken');
  const token = rawToken?.trim();

  if (authMode === 'required' && (!token || token.length < 10)) {
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
  console.log(`${logPrefix} Auth header:`, authMode === 'omit' ? 'OMITTED' : token ? `Bearer (len=${token.length})` : 'MISSING');

  // Signal progress start (milestone)
  options.onProgress?.(5);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30 * 60 * 1000); // 30 min timeout

    const headers: HeadersInit = {};
    if (authMode !== 'omit' && token) {
      headers['Authorization'] = `Bearer ${token}`;
      // Do NOT set Content-Type - browser sets it with boundary for FormData
    }

    const response = await fetch(ASR_ENDPOINT, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',
      headers,
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
    if (err?.name === 'AbortError') {
      return { success: false, error: 'Uppladdningen tog för lång tid (timeout)' };
    }

    console.error(`${logPrefix} Fetch error:`, err);

    // If auth upload failed, try a minimal no-auth probe to distinguish "network" vs "preflight/auth-header".
    if (authMode !== 'omit') {
      const probe = await probeAsrWithoutAuth(traceId);
      if (probe.ok) {
        return {
          success: false,
          error:
            'Uppladdningen stoppades i webbläsaren innan POST gick igenom med Authorization. ' +
            'Probe utan Authorization nådde backend (se console). Detta tyder på CORS/preflight för Authorization-header.',
        };
      }
    }

    return { success: false, error: err?.message || 'Nätverksfel vid uppladdning' };
  }
}
