import { useEffect, useRef, useState, useCallback } from 'react';

type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseAutoSaveOptions {
  isDirty: boolean;
  canEdit: boolean;
  onSave: () => Promise<void>;
  debounceMs?: number;
}

export function useAutoSave({ isDirty, canEdit, onSave, debounceMs = 800 }: UseAutoSaveOptions) {
  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);

  const save = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setStatus('saving');
    try {
      await onSave();
      setStatus('saved');
      savedTimerRef.current = setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
      savedTimerRef.current = setTimeout(() => setStatus('idle'), 3000);
    } finally {
      savingRef.current = false;
    }
  }, [onSave]);

  useEffect(() => {
    if (!isDirty || !canEdit) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);

    timerRef.current = setTimeout(() => {
      save();
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isDirty, canEdit, save, debounceMs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  return { status, saving: status === 'saving' };
}
