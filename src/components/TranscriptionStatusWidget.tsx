import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import type { ASRStage } from "@/lib/asrService";

interface TranscriptionStatusWidgetProps {
  meetingId: string;
  status: 'uploading' | 'processing' | 'done' | 'failed';
  stage?: ASRStage;
  meetingTitle?: string;
  onComplete?: () => void;
  onRetry?: () => void;
}

export const TranscriptionStatusWidget = ({
  status,
  stage,
  onComplete,
  onRetry,
}: TranscriptionStatusWidgetProps) => {
  const completedRef = useRef(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (status === 'done' && !completedRef.current) {
      completedRef.current = true;
      setTimeout(() => onComplete?.(), 500);
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

  // Simple status with email notification hint and time estimate
  const getStatusText = () => {
    if (stage === 'uploading' || status === 'uploading') return 'Laddar upp...';
    return 'Bearbetar (upp till 10 min) – mejl skickas när klart';
  };

  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
      <span className="text-xs">{getStatusText()}</span>
    </div>
  );
};
