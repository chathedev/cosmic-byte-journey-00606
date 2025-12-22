// Background uploader - handles file upload without blocking UI
// Uploads happen in background while user is redirected to library

import { debugLog, debugError } from './debugLogger';
import { uploadToAsr } from './asrUpload';

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

// Alias map: frontend-created ID → backend-returned ID (if different)
// This allows polling to find the correct meeting when IDs differ
const meetingIdAliases = new Map<string, string>();

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
 * Get backend meeting ID for a frontend-created meeting ID.
 * If backend returned a different ID, this returns that ID.
 * Otherwise returns the original ID.
 */
export function resolveBackendMeetingId(frontendMeetingId: string): string {
  return meetingIdAliases.get(frontendMeetingId) || frontendMeetingId;
}

/**
 * Check if a meeting ID has an alias (backend created a different ID)
 */
export function hasBackendAlias(frontendMeetingId: string): boolean {
  return meetingIdAliases.has(frontendMeetingId);
}

/**
 * Get the frontend meeting ID from a backend ID (reverse lookup)
 */
export function getFrontendMeetingId(backendMeetingId: string): string | undefined {
  for (const [frontendId, backendId] of meetingIdAliases.entries()) {
    if (backendId === backendMeetingId) return frontendId;
  }
  return undefined;
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

  upload.status = 'uploading';
  upload.progress = 0;
  upload.startedAt = Date.now();
  upload.lastProgressAt = upload.startedAt;
  notifyListeners(meetingId, upload);

  const traceId = `${meetingId}-${upload.startedAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  debugLog('🚀 Background upload starting:', { meetingId, traceId, size: upload.file.size, type: upload.file.type });

  try {
    const result = await uploadToAsr({
      file: upload.file,
      meetingId,
      language: upload.language,
      traceId,
      onProgress: (percent) => {
        upload.progress = percent;
        upload.lastProgressAt = Date.now();
        notifyListeners(meetingId, upload);
      },
    });

    if (!result.success) {
      throw new Error(result.error || 'Upload failed');
    }

    // CRITICAL: Check if backend returned a different meeting ID
    const returnedMeetingId = result.meetingId;
    if (returnedMeetingId && returnedMeetingId !== meetingId) {
      debugLog('⚠️ Backend returned different meetingId - storing alias:', {
        frontendId: meetingId,
        backendId: returnedMeetingId,
      });
      meetingIdAliases.set(meetingId, returnedMeetingId);
      
      // Persist alias to sessionStorage for page reloads
      try {
        const aliases = JSON.parse(sessionStorage.getItem('meeting_id_aliases') || '{}');
        aliases[meetingId] = returnedMeetingId;
        sessionStorage.setItem('meeting_id_aliases', JSON.stringify(aliases));
      } catch (e) {
        console.warn('Could not persist meeting alias:', e);
      }
    }

    upload.status = 'complete';
    upload.progress = 100;
    upload.lastProgressAt = Date.now();
    notifyListeners(meetingId, upload);
    debugLog('✅ Background upload complete:', { meetingId, traceId, backendMeetingId: returnedMeetingId });

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

/**
 * Load persisted aliases from sessionStorage (call on app init)
 */
export function loadPersistedAliases(): void {
  try {
    const aliases = JSON.parse(sessionStorage.getItem('meeting_id_aliases') || '{}');
    for (const [frontendId, backendId] of Object.entries(aliases)) {
      if (typeof backendId === 'string') {
        meetingIdAliases.set(frontendId, backendId);
      }
    }
    if (Object.keys(aliases).length > 0) {
      debugLog('📋 Loaded meeting ID aliases from session:', aliases);
    }
  } catch (e) {
    console.warn('Could not load meeting aliases:', e);
  }
}

// Load aliases on module init
loadPersistedAliases();
