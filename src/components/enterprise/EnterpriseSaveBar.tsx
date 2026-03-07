import { Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  isDirty: boolean;
  saving: boolean;
  canEdit: boolean;
  onSave: () => void;
}

export function EnterpriseSaveBar({ isDirty, saving, canEdit, onSave }: Props) {
  return (
    <AnimatePresence>
      {canEdit && isDirty && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="sticky top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-2.5 mb-4 bg-primary/5 border-b border-primary/20 backdrop-blur-sm flex items-center justify-between gap-3"
        >
          <p className="text-xs text-primary font-medium">Du har osparade ändringar</p>
          <Button size="sm" onClick={onSave} disabled={saving} className="gap-1.5 h-8 text-xs">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Sparar…' : 'Spara'}
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
