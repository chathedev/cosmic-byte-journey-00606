import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Users, Check, AlertCircle, Clock, Zap } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface QueueMetadata {
  queuePosition?: number;
  queueDepth?: number;
  activeCount?: number;
  maxConcurrent?: number;
}

interface QueueProgressWidgetProps {
  status: 'uploading' | 'queued' | 'processing' | 'done' | 'failed';
  stage?: 'uploading' | 'queued' | 'transcribing' | 'sis_processing' | 'done' | 'error';
  uploadProgress?: number;
  queueMetadata?: QueueMetadata;
  fileSize?: number; // in bytes
  onRetry?: () => void;
  className?: string;
}

// Estimate upload duration based on file size (assuming ~1MB/s average)
const estimateUploadDuration = (fileSize: number): number => {
  const fileSizeMB = fileSize / (1024 * 1024);
  // Small files: 2-5s, Medium: 10-30s, Large: 30-120s
  if (fileSizeMB < 5) return 3000;
  if (fileSizeMB < 20) return 10000;
  if (fileSizeMB < 50) return 30000;
  if (fileSizeMB < 100) return 60000;
  return 120000;
};

export const QueueProgressWidget = ({
  status,
  stage,
  uploadProgress = 0,
  queueMetadata,
  fileSize = 0,
  onRetry,
  className,
}: QueueProgressWidgetProps) => {
  const [displayProgress, setDisplayProgress] = useState(0);
  const [animatedPosition, setAnimatedPosition] = useState(queueMetadata?.queuePosition || 0);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  
  const { queuePosition = 0, queueDepth = 0, activeCount = 0, maxConcurrent = 3 } = queueMetadata || {};
  
  // Smooth progress animation based on file size and status
  useEffect(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    
    if (status === 'done') {
      setDisplayProgress(100);
      return;
    }
    
    if (status === 'failed') {
      return;
    }
    
    // For uploading, use actual upload progress with smooth interpolation
    if (status === 'uploading' || stage === 'uploading') {
      const targetProgress = Math.min(uploadProgress, 95); // Cap at 95% during upload
      
      // Smooth transition to target
      progressIntervalRef.current = setInterval(() => {
        setDisplayProgress(prev => {
          const diff = targetProgress - prev;
          if (Math.abs(diff) < 0.5) return targetProgress;
          // Smooth easing: faster catch-up for larger gaps
          return prev + diff * 0.15;
        });
      }, 100);
      
      return () => {
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      };
    }
    
    // For queued status, show position-based progress
    if (status === 'queued' || stage === 'queued') {
      // Progress based on queue position: closer to front = higher progress
      const queueProgress = queueDepth > 0 
        ? Math.max(0, Math.min(30, 30 - (queuePosition / queueDepth) * 30))
        : 15;
      
      progressIntervalRef.current = setInterval(() => {
        setDisplayProgress(prev => {
          const diff = queueProgress - prev;
          if (Math.abs(diff) < 0.5) return queueProgress;
          return prev + diff * 0.1;
        });
      }, 200);
      
      return () => {
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      };
    }
    
    // For processing/transcribing, animate progress 30-80%
    if (status === 'processing' || stage === 'transcribing') {
      let targetProgress = 50;
      
      progressIntervalRef.current = setInterval(() => {
        setDisplayProgress(prev => {
          // Slowly increment during processing, never exceeding 85%
          if (prev < 85) {
            return prev + Math.random() * 0.5;
          }
          return prev;
        });
      }, 500);
      
      return () => {
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      };
    }
    
    // For SIS processing, animate 80-95%
    if (stage === 'sis_processing') {
      progressIntervalRef.current = setInterval(() => {
        setDisplayProgress(prev => {
          if (prev < 95) {
            return prev + Math.random() * 0.3;
          }
          return prev;
        });
      }, 500);
      
      return () => {
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      };
    }
    
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [status, stage, uploadProgress, queuePosition, queueDepth, fileSize]);
  
  // Animate queue position changes
  useEffect(() => {
    if (queuePosition !== animatedPosition) {
      const interval = setInterval(() => {
        setAnimatedPosition(prev => {
          if (prev === queuePosition) return prev;
          if (prev > queuePosition) return prev - 1;
          return prev + 1;
        });
      }, 150);
      return () => clearInterval(interval);
    }
  }, [queuePosition, animatedPosition]);
  
  // Get status info for display
  const getStatusInfo = () => {
    if (status === 'done' || stage === 'done') {
      return {
        title: 'Klar!',
        subtitle: 'Transkribering slutförd',
        icon: Check,
        color: 'text-green-500',
      };
    }
    
    if (status === 'failed' || stage === 'error') {
      return {
        title: 'Misslyckades',
        subtitle: 'Något gick fel',
        icon: AlertCircle,
        color: 'text-destructive',
      };
    }
    
    if (status === 'uploading' || stage === 'uploading') {
      const fileSizeMB = fileSize / (1024 * 1024);
      const sizeText = fileSizeMB > 1 ? `${fileSizeMB.toFixed(1)} MB` : `${(fileSize / 1024).toFixed(0)} KB`;
      return {
        title: 'Laddar upp...',
        subtitle: `Skickar ljudfil (${sizeText})`,
        icon: Loader2,
        color: 'text-primary',
        spin: true,
      };
    }
    
    if (status === 'queued' || stage === 'queued') {
      const positionText = queuePosition > 0 ? `Plats ${animatedPosition} i kön` : 'Väntar på plats...';
      return {
        title: positionText,
        subtitle: queueDepth > 5 ? 'Många i kö – det kan ta längre tid' : 'Väntar på transkribering',
        icon: Users,
        color: 'text-amber-500',
      };
    }
    
    if (stage === 'sis_processing') {
      return {
        title: 'Identifierar talare...',
        subtitle: 'Analyserar röster med Lyra',
        icon: Zap,
        color: 'text-purple-500',
        spin: true,
      };
    }
    
    if (status === 'processing' || stage === 'transcribing') {
      return {
        title: 'Transkriberar...',
        subtitle: 'Konverterar ljud till text',
        icon: Loader2,
        color: 'text-primary',
        spin: true,
      };
    }
    
    return {
      title: 'Förbereder...',
      subtitle: 'Startar bearbetning',
      icon: Clock,
      color: 'text-muted-foreground',
    };
  };
  
  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;
  
  if (status === 'done' && displayProgress >= 100) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn("flex items-center gap-2 text-green-600", className)}
      >
        <Check className="w-5 h-5" />
        <span className="font-medium">Transkribering klar</span>
      </motion.div>
    );
  }
  
  return (
    <div className={cn("space-y-4", className)}>
      {/* Status header */}
      <div className="flex items-center gap-3">
        <div className={cn("p-2 rounded-full bg-background/50", statusInfo.color)}>
          <StatusIcon className={cn("w-5 h-5", statusInfo.spin && "animate-spin")} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-foreground">{statusInfo.title}</h4>
          <p className="text-sm text-muted-foreground truncate">{statusInfo.subtitle}</p>
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="space-y-2">
        <Progress value={displayProgress} className="h-2" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{Math.round(displayProgress)}%</span>
          
          {/* Queue info */}
          {(status === 'queued' || stage === 'queued') && queueDepth > 0 && (
            <AnimatePresence mode="wait">
              <motion.span
                key={queueDepth}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="flex items-center gap-1"
              >
                <Users className="w-3 h-3" />
                {queueDepth} i kön • {activeCount}/{maxConcurrent} aktiva
              </motion.span>
            </AnimatePresence>
          )}
          
          {/* Processing info */}
          {(status === 'processing' || stage === 'transcribing') && (
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3" />
              Bearbetar audio
            </span>
          )}
          
          {/* SIS info */}
          {stage === 'sis_processing' && (
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              Talaridentifiering
            </span>
          )}
        </div>
      </div>
      
      {/* Retry button for failed */}
      {status === 'failed' && onRetry && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={onRetry}
          className="w-full py-2 px-4 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors text-sm font-medium"
        >
          Försök igen
        </motion.button>
      )}
      
      {/* Large queue warning */}
      {(status === 'queued' || stage === 'queued') && queueDepth > 10 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 text-amber-600 text-sm"
        >
          <Clock className="w-4 h-4 flex-shrink-0" />
          <span>Många väntar – beräknad väntetid kan vara längre än vanligt</span>
        </motion.div>
      )}
    </div>
  );
};
