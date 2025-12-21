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

  const logPrefix = `[ASR:${traceId || 'no-trace'}]`;

  // Validate file is a proper File/Blob with content
  if (!(file instanceof Blob)) {
    console.error(`${logPrefix} CRITICAL: file is not a Blob/File instance`);
    return { success: false, error: 'Ogiltig fil (inte en Blob/File)' };
  }

  if (file.size < 100) {
    console.error(`${logPrefix} CRITICAL: file.size is ${file.size} bytes - too small`);
    return { success: false, error: 'Filen verkar vara tom' };
  }

  console.log(`${logPrefix} File validation passed:`, {
    name: file.name,
    size: file.size,
    type: file.type,
    isBlob: file instanceof Blob,
    isFile: file instanceof File,
  });

  // Read file into ArrayBuffer to ensure we have the actual bytes
  // This prevents issues where the file handle might be stale
  let fileBlob: Blob;
  try {
    const arrayBuffer = await file.arrayBuffer();
    console.log(`${logPrefix} Read ${arrayBuffer.byteLength} bytes into ArrayBuffer`);
    
    if (arrayBuffer.byteLength !== file.size) {
      console.warn(`${logPrefix} WARNING: ArrayBuffer size (${arrayBuffer.byteLength}) differs from file.size (${file.size})`);
    }
    
    if (arrayBuffer.byteLength < 100) {
      return { success: false, error: 'Kunde inte läsa filinnehåll' };
    }

    // Create a fresh Blob from the ArrayBuffer
    fileBlob = new Blob([arrayBuffer], { type: file.type || 'audio/mpeg' });
    console.log(`${logPrefix} Created fresh Blob: ${fileBlob.size} bytes, type: ${fileBlob.type}`);
  } catch (readErr: any) {
    console.error(`${logPrefix} Failed to read file:`, readErr);
    return { success: false, error: 'Kunde inte läsa filen: ' + (readErr?.message || 'okänt fel') };
  }

  // Build FormData fresh - never reuse
  const formData = new FormData();
  formData.append('audio', fileBlob, file.name);
  if (language) formData.append('language', language);
  if (title) formData.append('title', title);
  if (traceId) formData.append('traceId', traceId);

  // Debug: verify FormData contains the file
  const formDataEntries = Array.from(formData.entries());
  console.log(`${logPrefix} FormData entries:`, formDataEntries.map(([k, v]) => 
    v instanceof Blob ? `${k}: Blob(${v.size} bytes, ${v.type})` : `${k}: ${v}`
  ));

  console.log(`${logPrefix} Uploading ${file.name} (${(fileBlob.size / 1024 / 1024).toFixed(2)}MB) to ${ASR_ENDPOINT}`);
  console.log(`${logPrefix} Auth header:`, authMode === 'omit' ? 'OMITTED' : token ? `Bearer (len=${token.length})` : 'MISSING');

  // Signal progress start
  options.onProgress?.(5);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30 * 60 * 1000); // 30 min timeout

    // Build headers - do NOT set Content-Type, browser sets it with boundary
    const headers: HeadersInit = {};
    if (authMode !== 'omit' && token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    options.onProgress?.(10);

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

    return { success: false, error: err?.message || 'Nätverksfel vid uppladdning' };
  }
}
