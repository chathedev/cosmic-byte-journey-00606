// Background uploader - handles file upload without blocking UI
// Uploads happen in background while user is redirected to library

import { debugLog, debugError } from './debugLogger';

const BACKEND_API_URL = 'https://api.tivly.se';

interface PendingUpload {
  meetingId: string;
  file: File;
  language: string;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  progress: number;
  error?: string;
  retryCount: number;
  startedAt: number; // Timestamp when upload started
  lastProgressAt: number; // Timestamp when we last saw progress bytes change
}

// In-memory store for pending uploads
const pendingUploads = new Map<string, PendingUpload>();

// Listeners for upload status changes
const listeners = new Set<(meetingId: string, status: PendingUpload) => void>();

export function subscribeToUpload(callback: (meetingId: string, status: PendingUpload) => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notifyListeners(meetingId: string, status: PendingUpload) {
  listeners.forEach(cb => cb(meetingId, status));
}

export function getUploadStatus(meetingId: string): PendingUpload | undefined {
  const upload = pendingUploads.get(meetingId);
  if (!upload) return undefined;
  
  // Detect stalled uploads
  const now = Date.now();
  const stalledMs = now - upload.lastProgressAt;
  const isStale = upload.status === 'uploading' && upload.progress < 100 && stalledMs > 120000; // 2 minutes
  if (isStale) {
    return { ...upload, status: 'error', error: 'Uppladdningen verkar ha fastnat. Försök igen.' };
  }

  return upload;
}

export function isUploadStale(meetingId: string): boolean {
  const upload = pendingUploads.get(meetingId);
  if (!upload) return true;

  const now = Date.now();
  // Stale if no progress for 2 minutes while uploading
  return upload.status === 'uploading' && upload.progress < 100 && (now - upload.lastProgressAt > 120000);
}

export function getAllPendingUploads(): PendingUpload[] {
  return Array.from(pendingUploads.values());
}

/**
 * Start background upload - returns immediately, upload happens in background
 */
export function startBackgroundUpload(
  file: File,
  meetingId: string,
  language: string = 'sv'
): void {
  const now = Date.now();
  const upload: PendingUpload = {
    meetingId,
    file,
    language,
    status: 'pending',
    progress: 0,
    retryCount: 0,
    startedAt: now,
    lastProgressAt: now,
  };
  
  pendingUploads.set(meetingId, upload);
  notifyListeners(meetingId, upload);
  
  // Start upload immediately (non-blocking)
  executeUpload(meetingId);
}

async function executeUpload(meetingId: string): Promise<void> {
  const upload = pendingUploads.get(meetingId);
  if (!upload) return;

  // Hard limits to avoid “stuck pending” forever
  const STALL_MS = 120000; // 2 minutes without progress → fail
  const MAX_TOTAL_MS = 30 * 60 * 1000; // 30 minutes total cap

  upload.status = 'uploading';
  upload.progress = 0;
  upload.startedAt = Date.now();
  upload.lastProgressAt = upload.startedAt;
  notifyListeners(meetingId, upload);

  const traceId = `${meetingId}-${upload.startedAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  debugLog('🚀 Background upload starting:', { meetingId, traceId, size: upload.file.size, type: upload.file.type });

  const formData = new FormData();
  formData.append('audio', upload.file, upload.file.name);
  formData.append('meetingId', meetingId);
  formData.append('language', upload.language);

  const token = localStorage.getItem('authToken');

  try {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let lastLoaded = 0;

      // Match fetch({ credentials: 'include' }) behavior
      xhr.withCredentials = true;

      const watchdog = window.setInterval(() => {
        const now = Date.now();
        const stalledFor = now - upload.lastProgressAt;
        const totalFor = now - upload.startedAt;

        if (totalFor > MAX_TOTAL_MS) {
          debugError('⏱️ Background upload exceeded max total time:', { meetingId, traceId, totalFor });
          try { xhr.abort(); } catch {}
          window.clearInterval(watchdog);
          reject(new Error('Upload timed out'));
          return;
        }

        if (upload.progress < 100 && stalledFor > STALL_MS) {
          debugError('🧱 Background upload stalled:', { meetingId, traceId, stalledFor, progress: upload.progress });
          try { xhr.abort(); } catch {}
          window.clearInterval(watchdog);
          reject(new Error('Uppladdningen verkar ha fastnat. Försök igen.'));
        }
      }, 5000);

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          // Only treat as progress if bytes move forward
          if (e.loaded > lastLoaded) {
            lastLoaded = e.loaded;
            upload.lastProgressAt = Date.now();
          }

          const percent = Math.round((e.loaded / e.total) * 95);
          upload.progress = Math.max(upload.progress, percent);
          notifyListeners(meetingId, upload);
        }
      });

      xhr.addEventListener('load', () => {
        window.clearInterval(watchdog);

        debugLog('📦 Background upload response:', {
          meetingId,
          traceId,
          status: xhr.status,
          responseTextPreview: (xhr.responseText || '').slice(0, 300),
        });

        if (xhr.status >= 200 && xhr.status < 300) {
          upload.status = 'complete';
          upload.progress = 100;
          upload.lastProgressAt = Date.now();
          notifyListeners(meetingId, upload);
          debugLog('✅ Background upload complete:', { meetingId, traceId });
          resolve();
        } else {
          let errorMsg = 'Upload failed';
          try {
            const errorData = JSON.parse(xhr.responseText);
            errorMsg = errorData.error || errorData.message || errorMsg;
          } catch {
            // ignore
          }
          reject(new Error(errorMsg));
        }
      });

      xhr.addEventListener('error', () => {
        window.clearInterval(watchdog);
        reject(new Error('Network error'));
      });

      xhr.addEventListener('timeout', () => {
        window.clearInterval(watchdog);
        reject(new Error('Upload timed out'));
      });

      xhr.addEventListener('abort', () => {
        window.clearInterval(watchdog);
      });

      xhr.open('POST', `${BACKEND_API_URL}/asr/transcribe`);
      xhr.timeout = MAX_TOTAL_MS;

      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.send(formData);
    });
  } catch (error: any) {
    debugError('❌ Background upload failed:', { meetingId, traceId, error: error?.message || String(error) });

    upload.retryCount++;

    // Retry up to 3 times with exponential backoff
    if (upload.retryCount < 3) {
      debugLog(`🔄 Retrying upload (attempt ${upload.retryCount + 1})...`, { meetingId, traceId });
      upload.status = 'pending';
      upload.progress = 0;
      upload.startedAt = Date.now();
      upload.lastProgressAt = upload.startedAt;
      notifyListeners(meetingId, upload);

      // Wait before retry (2s, 4s, 8s)
      await new Promise(r => setTimeout(r, Math.pow(2, upload.retryCount) * 1000));
      return executeUpload(meetingId);
    }

    upload.status = 'error';
    upload.error = error.message || 'Upload failed after retries';
    notifyListeners(meetingId, upload);

    // Note: Don't try to PUT to /meetings/{id} - meeting may not exist yet
    // The backend handles error states via /asr/status endpoint
    console.error('Upload failed for meeting:', meetingId);
  }
}

/**
 * Retry a failed upload
 */
export function retryUpload(meetingId: string): void {
  const upload = pendingUploads.get(meetingId);
  if (upload && upload.status === 'error') {
    upload.retryCount = 0;
    upload.error = undefined;
    executeUpload(meetingId);
  }
}

/**
 * Cancel and remove a pending upload
 */
export function cancelUpload(meetingId: string): void {
  pendingUploads.delete(meetingId);
}
