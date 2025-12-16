import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

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
  const [hidden, setHidden] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  // Track elapsed time during processing
  useEffect(() => {
    if (status === 'processing' && !startTimeRef.current) {
      startTimeRef.current = Date.now();
    }
    
    if (status === 'done' || status === 'failed') {
      startTimeRef.current = null;
      setElapsedSeconds(0);
    }
  }, [status]);

  useEffect(() => {
    if (status !== 'processing' || !startTimeRef.current) return;
    
    const interval = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    if (status === 'done' && !completedRef.current) {
      completedRef.current = true;
      setTimeout(() => onComplete?.(), 500);
      // Hide after 10 seconds
      setTimeout(() => setHidden(true), 10000);
    }
  }, [status, onComplete]);

  if (hidden) return null;

  if (status === 'done') {
    return (
      <span className="text-xs text-green-600 flex items-center gap-1">
        <Check className="w-3 h-3" /> Klar
      </span>
    );
  }

  if (status === 'failed') {
    return (
      <span className="text-xs text-destructive">
        Misslyckades
        {onRetry && (
          <button onClick={onRetry} className="ml-1 underline">
            Försök igen
          </button>
        )}
      </span>
    );
  }

  const getStatusText = () => {
    if (status === 'uploading') {
      return 'Skickar till servern...';
    }
    
    // Processing status with time-based messages
    if (elapsedSeconds < 30) {
      return 'Transkriberar...';
    } else if (elapsedSeconds < 60) {
      return 'Bearbetar mötet...';
    } else if (elapsedSeconds < 120) {
      return 'Tar lite extra tid...';
    } else {
      return `Bearbetar... (${Math.floor(elapsedSeconds / 60)}:${(elapsedSeconds % 60).toString().padStart(2, '0')})`;
    }
  };

  return (
    <span className="text-xs text-muted-foreground">
      {getStatusText()}
    </span>
  );
};
