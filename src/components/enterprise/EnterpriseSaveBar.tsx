import { Check, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  status: 'idle' | 'saving' | 'saved' | 'error';
}

export function EnterpriseSaveBar({ status }: Props) {
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
