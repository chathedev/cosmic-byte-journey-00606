import { useState, useCallback } from 'react';

export type ManualSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseManualSaveOptions {
  onSave: () => Promise<void>;
  onDiscard?: () => void;
}

export function useManualSave({ onSave, onDiscard }: UseManualSaveOptions) {
  const [status, setStatus] = useState<ManualSaveStatus>('idle');

  const save = useCallback(async () => {
    if (status === 'saving') return;
    setStatus('saving');
    try {
      await onSave();
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2500);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 4000);
    }
  }, [onSave, status]);

  const discard = useCallback(() => {
    onDiscard?.();
    setStatus('idle');
  }, [onDiscard]);

  return { status, save, discard, isSaving: status === 'saving' };
}
