// useRecordingBackup - Hook for auto-saving audio chunks during recording
// Provides recovery mechanism if browser/app crashes or closes unexpectedly

import { useRef, useCallback, useEffect, useState } from "react";

interface BackupState {
  meetingId: string;
  chunks: Blob[];
  totalBytes: number;
  lastSaveTime: number;
  mimeType: string;
}

interface UseRecordingBackupOptions {
  meetingId: string;
  enabled?: boolean;
  saveInterval?: number; // milliseconds
  onBackupSaved?: (chunkCount: number, totalBytes: number) => void;
}

// IndexedDB storage for reliable persistence
const DB_NAME = "tivly_recording_backup";
const DB_VERSION = 1;
const STORE_NAME = "recording_chunks";

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

async function saveChunksToIndexedDB(meetingId: string, data: BackupState): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put({ id: meetingId, ...data });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn("[RecordingBackup] IndexedDB save failed:", error);
  }
}

async function loadChunksFromIndexedDB(meetingId: string): Promise<BackupState | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(meetingId);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn("[RecordingBackup] IndexedDB load failed:", error);
    return null;
  }
}

async function deleteChunksFromIndexedDB(meetingId: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(meetingId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn("[RecordingBackup] IndexedDB delete failed:", error);
  }
}

async function getAllBackups(): Promise<BackupState[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn("[RecordingBackup] IndexedDB getAll failed:", error);
    return [];
  }
}

export function useRecordingBackup({
  meetingId,
  enabled = true,
  saveInterval = 30000, // Save every 30 seconds
  onBackupSaved,
}: UseRecordingBackupOptions) {
  const chunksRef = useRef<Blob[]>([]);
  const totalBytesRef = useRef(0);
  const mimeTypeRef = useRef("audio/webm");
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [chunksSaved, setChunksSaved] = useState(0);
  const [isBackupEnabled, setIsBackupEnabled] = useState(false);

  // Check if IndexedDB is available
  useEffect(() => {
    const checkIndexedDB = async () => {
      try {
        await openDB();
        setIsBackupEnabled(true);
        console.log("[RecordingBackup] IndexedDB available, backup enabled");
      } catch {
        setIsBackupEnabled(false);
        console.warn("[RecordingBackup] IndexedDB not available, backup disabled");
      }
    };
    checkIndexedDB();
  }, []);

  // Add a chunk to the backup
  const addChunk = useCallback(
    (chunk: Blob, mimeType?: string) => {
      if (!enabled || !isBackupEnabled) return;

      chunksRef.current.push(chunk);
      totalBytesRef.current += chunk.size;
      if (mimeType) {
        mimeTypeRef.current = mimeType;
      }

      console.log(
        `[RecordingBackup] Chunk added: ${chunk.size} bytes (total: ${chunksRef.current.length} chunks, ${totalBytesRef.current} bytes)`
      );
    },
    [enabled, isBackupEnabled]
  );

  // Force save all chunks to IndexedDB
  const saveBackup = useCallback(async () => {
    if (!enabled || !isBackupEnabled || chunksRef.current.length === 0) return;

    try {
      const state: BackupState = {
        meetingId,
        chunks: chunksRef.current,
        totalBytes: totalBytesRef.current,
        lastSaveTime: Date.now(),
        mimeType: mimeTypeRef.current,
      };

      await saveChunksToIndexedDB(meetingId, state);
      setChunksSaved(chunksRef.current.length);
      onBackupSaved?.(chunksRef.current.length, totalBytesRef.current);

      console.log(
        `[RecordingBackup] Backup saved: ${chunksRef.current.length} chunks, ${totalBytesRef.current} bytes`
      );
    } catch (error) {
      console.error("[RecordingBackup] Failed to save backup:", error);
    }
  }, [meetingId, enabled, isBackupEnabled, onBackupSaved]);

  // Start auto-save timer
  const startAutoSave = useCallback(() => {
    if (saveTimerRef.current) return;

    saveTimerRef.current = setInterval(() => {
      saveBackup();
    }, saveInterval);

    console.log(`[RecordingBackup] Auto-save started (every ${saveInterval / 1000}s)`);
  }, [saveBackup, saveInterval]);

  // Stop auto-save timer
  const stopAutoSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearInterval(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  // Clear backup data
  const clearBackup = useCallback(async () => {
    chunksRef.current = [];
    totalBytesRef.current = 0;
    setChunksSaved(0);
    stopAutoSave();

    if (isBackupEnabled) {
      await deleteChunksFromIndexedDB(meetingId);
      console.log("[RecordingBackup] Backup cleared");
    }
  }, [meetingId, isBackupEnabled, stopAutoSave]);

  // Recover backup from IndexedDB
  const recoverBackup = useCallback(async (): Promise<Blob | null> => {
    if (!isBackupEnabled) return null;

    try {
      const state = await loadChunksFromIndexedDB(meetingId);
      if (!state || state.chunks.length === 0) {
        console.log("[RecordingBackup] No backup found");
        return null;
      }

      const blob = new Blob(state.chunks, { type: state.mimeType });
      console.log(
        `[RecordingBackup] Backup recovered: ${state.chunks.length} chunks, ${blob.size} bytes`
      );
      return blob;
    } catch (error) {
      console.error("[RecordingBackup] Recovery failed:", error);
      return null;
    }
  }, [meetingId, isBackupEnabled]);

  // Get current blob from chunks
  const getCurrentBlob = useCallback((): Blob => {
    return new Blob(chunksRef.current, { type: mimeTypeRef.current });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAutoSave();
    };
  }, [stopAutoSave]);

  return {
    addChunk,
    saveBackup,
    clearBackup,
    recoverBackup,
    getCurrentBlob,
    startAutoSave,
    stopAutoSave,
    chunksSaved,
    isBackupEnabled,
    totalBytes: totalBytesRef.current,
  };
}

// Utility to check for any pending backups on app load
export async function checkPendingBackups(): Promise<BackupState[]> {
  try {
    return await getAllBackups();
  } catch {
    return [];
  }
}

// Utility to recover a specific backup
export async function recoverBackupById(meetingId: string): Promise<Blob | null> {
  try {
    const state = await loadChunksFromIndexedDB(meetingId);
    if (!state || state.chunks.length === 0) return null;
    return new Blob(state.chunks, { type: state.mimeType });
  } catch {
    return null;
  }
}

// Utility to delete a backup
export async function deleteBackupById(meetingId: string): Promise<void> {
  await deleteChunksFromIndexedDB(meetingId);
}
