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
  // Chunk-level progress for long meetings
  chunkIndex?: number;
  totalChunks?: number;
  stage?: string;
}

interface QueueProgressWidgetProps {
  status: 'uploading' | 'queued' | 'processing' | 'done' | 'failed';
  stage?: 'uploading' | 'queued' | 'transcribing' | 'sis_processing' | 'done' | 'error';
  uploadProgress?: number;
  backendProgress?: number; // Actual progress from backend (0-100)
  queueMetadata?: QueueMetadata;
  fileSize?: number; // in bytes
  onRetry?: () => void;
  className?: string;
}


export const QueueProgressWidget = ({
  status,
  stage,
  uploadProgress = 0,
  backendProgress,
  queueMetadata,
  fileSize = 0,
  onRetry,
  className,
}: QueueProgressWidgetProps) => {
  const [displayProgress, setDisplayProgress] = useState(0);
  const [animatedPosition, setAnimatedPosition] = useState(queueMetadata?.queuePosition || 0);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const { queuePosition = 0, queueDepth = 0, activeCount = 0, maxConcurrent = 3 } = queueMetadata || {};
  
  // Fast, smooth progress animation
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
    
    // Calculate target progress based on backend data and stage
    const getTargetProgress = (currentProgress: number): number => {
      // Check stage for done/error since status is narrowed
      if (stage === 'done') return 100;
      if (stage === 'error') return currentProgress;
      
      // Use backend progress if available and meaningful
      if (typeof backendProgress === 'number' && backendProgress > 0) {
        // Backend provides 0-100, use it directly but cap at 98 until truly done
        return Math.min(backendProgress, 98);
      }
      
      // Uploading: use uploadProgress (0-100) mapped to 0-30% of total
      if (status === 'uploading' || stage === 'uploading') {
        return Math.min(uploadProgress * 0.30, 30);
      }
      
      // Queued: show 30-40% based on position
      if (status === 'queued' || stage === 'queued') {
        if (queueDepth > 0 && queuePosition > 0) {
          const queueProgressPercent = 1 - (queuePosition / queueDepth);
          return 30 + queueProgressPercent * 10; // 30-40%
        }
        return 32; // Default when queued
      }
      
      // Transcribing: 40-85% with gradual increase
      if (status === 'processing' || stage === 'transcribing') {
        // Gradually increase from current to 85%
        if (currentProgress < 85) {
          return Math.min(currentProgress + 0.8, 85);
        }
        return currentProgress;
      }
      
      // SIS processing: 85-98%
      if (stage === 'sis_processing') {
        if (currentProgress < 98) {
          return Math.min(currentProgress + 0.6, 98);
        }
        return currentProgress;
      }
      
      return currentProgress;
    };
    
    // Fast smooth animation - update every 50ms for responsive feel
    progressIntervalRef.current = setInterval(() => {
      setDisplayProgress(prev => {
        const target = getTargetProgress(prev);
        const diff = target - prev;
        
        // Fast catch-up: larger gaps = faster movement
        if (Math.abs(diff) < 0.3) return target;
        
        // Responsive easing: 20% of difference per tick for smooth animation
        const speed = Math.max(0.3, Math.abs(diff) * 0.20);
        return prev + (diff > 0 ? speed : -speed * 0.3);
      });
    }, 50); // 50ms for smooth, responsive updates
    
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [status, stage, uploadProgress, backendProgress, queuePosition, queueDepth]);
  
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
          
          {/* Processing info - show chunk progress for long meetings */}
          {(status === 'processing' || stage === 'transcribing') && (
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3" />
              {queueMetadata?.totalChunks && queueMetadata.totalChunks > 1 ? (
                `Del ${queueMetadata.chunkIndex || 1}/${queueMetadata.totalChunks}`
              ) : (
                'Bearbetar audio'
              )}
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
