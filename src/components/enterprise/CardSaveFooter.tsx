import { Check, Loader2, AlertCircle, Save, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { ManualSaveStatus } from '@/hooks/useManualSave';

interface Props {
  status: ManualSaveStatus;
  isDirty: boolean;
  onSave: () => void;
  onDiscard?: () => void;
  disabled?: boolean;
}

export function CardSaveFooter({ status, isDirty, onSave, onDiscard, disabled }: Props) {
  const isSaving = status === 'saving';
  const isSaved = status === 'saved';
  const isError = status === 'error';
  const show = isDirty || isSaving || isSaved || isError;

  if (!show) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="overflow-hidden"
        >
          <Separator className="mb-3" />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {isSaving && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin text-primary" />
                  Sparar…
                </span>
              )}
              {isSaved && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium"
                >
                  <Check className="w-3 h-3" />
                  Sparat
                </motion.span>
              )}
              {isError && (
                <span className="flex items-center gap-1.5 text-xs text-destructive font-medium">
                  <AlertCircle className="w-3 h-3" />
                  Misslyckades
                </span>
              )}
              {isDirty && !isSaving && !isSaved && !isError && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Osparade ändringar
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {onDiscard && isDirty && !isSaving && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1 text-muted-foreground"
                  onClick={onDiscard}
                >
                  <RotateCcw className="w-3 h-3" />
                  Ångra
                </Button>
              )}
              <Button
                size="sm"
                className="h-7 text-xs gap-1 min-w-[72px]"
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
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
