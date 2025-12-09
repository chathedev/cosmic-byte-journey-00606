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
  return pendingUploads.get(meetingId);
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
  const upload: PendingUpload = {
    meetingId,
    file,
    language,
    status: 'pending',
    progress: 0,
    retryCount: 0,
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
  upload.progress = 5;
  notifyListeners(meetingId, upload);
  
  debugLog('🚀 Background upload starting:', meetingId);
  
  const formData = new FormData();
  formData.append('audio', upload.file);
  formData.append('meetingId', meetingId);
  formData.append('language', upload.language);
  
  const token = localStorage.getItem('authToken');
  
  try {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 95);
          upload.progress = percent;
          notifyListeners(meetingId, upload);
        }
      });
      
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          upload.status = 'complete';
          upload.progress = 100;
          notifyListeners(meetingId, upload);
          debugLog('✅ Background upload complete:', meetingId);
          resolve();
        } else {
          let errorMsg = 'Upload failed';
          try {
            const errorData = JSON.parse(xhr.responseText);
            errorMsg = errorData.error || errorData.message || errorMsg;
          } catch { /* ignore */ }
          reject(new Error(errorMsg));
        }
      });
      
      xhr.addEventListener('error', () => {
        reject(new Error('Network error'));
      });
      
      xhr.addEventListener('timeout', () => {
        reject(new Error('Upload timed out'));
      });
      
      xhr.open('POST', `${BACKEND_API_URL}/asr/transcribe`);
      xhr.timeout = 0; // No timeout - let it run as long as needed
      
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
      
      xhr.send(formData);
    });
  } catch (error: any) {
    debugError('❌ Background upload failed:', error);
    
    upload.retryCount++;
    
    // Retry up to 3 times with exponential backoff
    if (upload.retryCount < 3) {
      debugLog(`🔄 Retrying upload (attempt ${upload.retryCount + 1})...`);
      upload.status = 'pending';
      upload.progress = 0;
      notifyListeners(meetingId, upload);
      
      // Wait before retry (2s, 4s, 8s)
      await new Promise(r => setTimeout(r, Math.pow(2, upload.retryCount) * 1000));
      return executeUpload(meetingId);
    }
    
    upload.status = 'error';
    upload.error = error.message || 'Upload failed after retries';
    notifyListeners(meetingId, upload);
    
    // Update meeting status in backend
    try {
      await fetch(`${BACKEND_API_URL}/meetings/${meetingId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transcriptionStatus: 'failed' }),
      });
    } catch { /* ignore */ }
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
