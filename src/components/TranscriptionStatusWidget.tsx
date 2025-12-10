import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

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
      setTimeout(() => onComplete?.(), 500);
    }
  }, [status, onComplete]);

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

  return (
    <span className="text-xs text-muted-foreground">
      {status === 'uploading' ? 'Laddar upp...' : 'Transkriberar...'}
    </span>
  );
};
