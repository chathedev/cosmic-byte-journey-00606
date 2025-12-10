import { useState, useEffect, useRef } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
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
  meetingId,
  status,
  meetingTitle,
  onComplete,
  onRetry,
}: TranscriptionStatusWidgetProps) => {
  const [dots, setDots] = useState(1);
  const completedRef = useRef(false);

  // Animate dots for processing
  useEffect(() => {
    if (status === 'processing' || status === 'uploading') {
      const interval = setInterval(() => {
        setDots(prev => (prev % 3) + 1);
      }, 500);
      return () => clearInterval(interval);
    }
  }, [status]);

  // Notify completion
  useEffect(() => {
    if (status === 'done' && !completedRef.current) {
      completedRef.current = true;
      const timer = setTimeout(() => {
        onComplete?.();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [status, onComplete]);

  const getStatusConfig = () => {
    switch (status) {
      case 'uploading':
        return {
          label: `Laddar upp${'.'.repeat(dots)}`,
          color: 'text-blue-500',
          bgColor: 'bg-blue-500/5',
        };
      case 'processing':
        return {
          label: `Transkriberar${'.'.repeat(dots)}`,
          color: 'text-primary',
          bgColor: 'bg-primary/5',
        };
      case 'done':
        return {
          label: 'Klar',
          color: 'text-green-500',
          bgColor: 'bg-green-500/5',
        };
      case 'failed':
        return {
          label: 'Misslyckades',
          color: 'text-destructive',
          bgColor: 'bg-destructive/5',
        };
      default:
        return {
          label: 'Väntar...',
          color: 'text-muted-foreground',
          bgColor: 'bg-muted/5',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={status}
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 5 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium",
          config.bgColor
        )}
      >
        {status === 'done' ? (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
          >
            <CheckCircle2 className={cn("w-3.5 h-3.5", config.color)} />
          </motion.div>
        ) : status === 'failed' ? (
          <XCircle className={cn("w-3.5 h-3.5", config.color)} />
        ) : (
          <Loader2 className={cn("w-3.5 h-3.5 animate-spin", config.color)} />
        )}
        
        <span className={config.color}>{config.label}</span>
        
        {status === 'failed' && onRetry && (
          <button
            onClick={onRetry}
            className="ml-1 text-primary hover:underline"
          >
            Försök igen
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
