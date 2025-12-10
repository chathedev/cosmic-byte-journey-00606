import { useState, useEffect, useRef } from "react";
import { Loader2, CheckCircle2, XCircle, Mic, Upload, Clock } from "lucide-react";
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
  const [progress, setProgress] = useState(0);
  const [showCompleteAnimation, setShowCompleteAnimation] = useState(false);
  const completedRef = useRef(false);

  // Simulate progress based on status
  useEffect(() => {
    if (status === 'uploading') {
      setProgress(25);
    } else if (status === 'processing') {
      // Animate progress from 30 to 90 over time
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) return 90;
          return prev + Math.random() * 5;
        });
      }, 2000);
      setProgress(30);
      return () => clearInterval(interval);
    } else if (status === 'done' && !completedRef.current) {
      completedRef.current = true;
      setProgress(100);
      setShowCompleteAnimation(true);
      
      // Notify completion after animation
      const timer = setTimeout(() => {
        onComplete?.();
      }, 1500);
      return () => clearTimeout(timer);
    } else if (status === 'failed') {
      setProgress(0);
    }
  }, [status, onComplete]);

  const getStatusConfig = () => {
    switch (status) {
      case 'uploading':
        return {
          icon: Upload,
          label: 'Laddar upp...',
          sublabel: 'Förbereder ljud för transkribering',
          color: 'text-blue-500',
          bgColor: 'bg-blue-500/10',
          borderColor: 'border-blue-500/30',
        };
      case 'processing':
        return {
          icon: Mic,
          label: 'Transkriberar...',
          sublabel: 'AI analyserar ditt möte',
          color: 'text-primary',
          bgColor: 'bg-primary/10',
          borderColor: 'border-primary/30',
        };
      case 'done':
        return {
          icon: CheckCircle2,
          label: 'Klart!',
          sublabel: 'Din transkribering är redo',
          color: 'text-green-500',
          bgColor: 'bg-green-500/10',
          borderColor: 'border-green-500/30',
        };
      case 'failed':
        return {
          icon: XCircle,
          label: 'Misslyckades',
          sublabel: 'Något gick fel',
          color: 'text-destructive',
          bgColor: 'bg-destructive/10',
          borderColor: 'border-destructive/30',
        };
      default:
        return {
          icon: Clock,
          label: 'Väntar...',
          sublabel: '',
          color: 'text-muted-foreground',
          bgColor: 'bg-muted/10',
          borderColor: 'border-muted/30',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;
  const circumference = 2 * Math.PI * 20;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: -10 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all duration-300",
          config.bgColor,
          config.borderColor,
          showCompleteAnimation && "ring-2 ring-green-500/50"
        )}
      >
        {/* Circular Progress */}
        <div className="relative w-12 h-12 flex-shrink-0">
          <svg className="w-12 h-12 transform -rotate-90">
            {/* Background circle */}
            <circle
              cx="24"
              cy="24"
              r="20"
              stroke="currentColor"
              strokeWidth="3"
              fill="none"
              className="text-muted/20"
            />
            {/* Progress circle */}
            <circle
              cx="24"
              cy="24"
              r="20"
              stroke="currentColor"
              strokeWidth="3"
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className={cn("transition-all duration-500 ease-out", config.color)}
              strokeLinecap="round"
            />
          </svg>
          {/* Center icon */}
          <div className="absolute inset-0 flex items-center justify-center">
            {status === 'done' ? (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 15 }}
              >
                <CheckCircle2 className={cn("w-6 h-6", config.color)} />
              </motion.div>
            ) : status === 'failed' ? (
              <XCircle className={cn("w-6 h-6", config.color)} />
            ) : (
              <Loader2 className={cn("w-5 h-5 animate-spin", config.color)} />
            )}
          </div>
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className={cn("text-sm font-semibold", config.color)}>
            {config.label}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {meetingTitle || config.sublabel}
          </p>
          {status === 'processing' && (
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              {Math.round(progress)}% bearbetat
            </p>
          )}
        </div>

        {/* Retry button for failed */}
        {status === 'failed' && onRetry && (
          <button
            onClick={onRetry}
            className="text-xs text-primary hover:underline font-medium px-2 py-1"
          >
            Försök igen
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
