import { Check, Loader2, AlertCircle, Save, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  status: SaveStatus;
  /** Whether there are unsaved changes */
  isDirty?: boolean;
  /** Trigger manual save */
  onSave?: () => void;
  /** Discard changes */
  onDiscard?: () => void;
  /** Disable the save button */
  disabled?: boolean;
}

export function EnterpriseSaveBar({ status, isDirty, onSave, onDiscard, disabled }: Props) {
  // Legacy mode: just show status indicator (no save button)
  if (!onSave) {
    if (status === 'idle') return null;
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className="flex items-center gap-1.5 text-xs mb-2"
        >
          {status === 'saving' && (
            <>
              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">Sparar…</span>
            </>
          )}
          {status === 'saved' && (
            <>
              <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
              <span className="text-green-600 dark:text-green-400">Sparat</span>
            </>
          )}
          {status === 'error' && (
            <>
              <AlertCircle className="w-3 h-3 text-destructive" />
              <span className="text-destructive">Kunde inte spara</span>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    );
  }

  // Enhanced mode: sticky save bar with button
  const isSaving = status === 'saving';
  const isSaved = status === 'saved';
  const isError = status === 'error';
  const showBar = isDirty || isSaving || isSaved || isError;

  return (
    <AnimatePresence>
      {showBar && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="sticky top-0 z-30 -mx-5 -mt-5 mb-4 px-5 py-3 bg-background/80 backdrop-blur-xl border-b border-border flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2 min-w-0">
            {isSaving && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground font-medium">Sparar ändringar…</span>
              </motion.div>
            )}
            {isSaved && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-green-600 dark:text-green-400" />
                </div>
                <span className="text-xs text-green-600 dark:text-green-400 font-medium">Ändringar sparade</span>
              </motion.div>
            )}
            {isError && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                <span className="text-xs text-destructive font-medium">Kunde inte spara — försök igen</span>
              </motion.div>
            )}
            {isDirty && !isSaving && !isSaved && !isError && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-xs text-muted-foreground">Osparade ändringar</span>
              </motion.div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onDiscard && isDirty && !isSaving && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5 text-muted-foreground"
                onClick={onDiscard}
                disabled={isSaving}
              >
                <RotateCcw className="w-3 h-3" />
                Ångra
              </Button>
            )}
            <Button
              size="sm"
              className="h-7 text-xs gap-1.5 min-w-[80px]"
              onClick={onSave}
              disabled={disabled || isSaving || (!isDirty && !isError)}
            >
              {isSaving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Save className="w-3 h-3" />
              )}
              {isSaving ? 'Sparar…' : isError ? 'Försök igen' : 'Spara'}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
