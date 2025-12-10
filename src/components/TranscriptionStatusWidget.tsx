import { useEffect, useRef } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface TranscriptionStatusWidgetProps {
  meetingId: string;
  status: 'uploading' | 'processing' | 'done' | 'failed';
  meetingTitle?: string;
  onComplete?: () => void;
  onRetry?: () => void;
}

export const TranscriptionStatusWidget = ({
  status,
  onComplete,
  onRetry,
}: TranscriptionStatusWidgetProps) => {
  const completedRef = useRef(false);

  useEffect(() => {
    if (status === 'done' && !completedRef.current) {
      completedRef.current = true;
      const timer = setTimeout(() => {
        onComplete?.();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [status, onComplete]);

  const getLabel = () => {
    switch (status) {
      case 'uploading':
        return 'Laddar upp...';
      case 'processing':
        return 'Transkriberar...';
      case 'done':
        return 'Klar';
      case 'failed':
        return 'Misslyckades';
      default:
        return 'Väntar...';
    }
  };

  const isActive = status === 'uploading' || status === 'processing';

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={status}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex items-center gap-2 text-sm"
      >
        {status === 'done' ? (
          <CheckCircle2 className="w-4 h-4 text-green-500" />
        ) : status === 'failed' ? (
          <XCircle className="w-4 h-4 text-destructive" />
        ) : (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
        )}
        
        <span className={cn(
          "font-medium",
          status === 'done' && "text-green-500",
          status === 'failed' && "text-destructive",
          isActive && "text-muted-foreground"
        )}>
          {getLabel()}
        </span>
        
        {status === 'failed' && onRetry && (
          <button
            onClick={onRetry}
            className="text-xs text-primary hover:underline ml-1"
          >
            Försök igen
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
