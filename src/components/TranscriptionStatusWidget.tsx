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
    switch (status) {
      case 'uploading':
        return 'Skickar till servern...';
      case 'processing':
        return 'Transkriberar ljud...';
      default:
        return 'Bearbetar...';
    }
  };

  return (
    <span className="text-xs text-muted-foreground">
      {getStatusText()}
    </span>
  );
};
