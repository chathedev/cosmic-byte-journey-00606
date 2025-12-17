import { useEffect, useState } from "react";
import { Loader2, Coffee } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProtocolGenerationWidgetProps {
  isGenerating: boolean;
  progress: number; // 0-100
  onComplete?: () => void;
  isLargeTranscript?: boolean;
}

export const ProtocolGenerationWidget = ({
  isGenerating,
  progress,
  onComplete,
  isLargeTranscript = false,
}: ProtocolGenerationWidgetProps) => {
  const [show, setShow] = useState(false);
  const [showCoffeeHint, setShowCoffeeHint] = useState(false);

  useEffect(() => {
    if (isGenerating) {
      setShow(true);
      // Show coffee hint after 3 seconds for large transcripts
      if (isLargeTranscript) {
        const timer = setTimeout(() => setShowCoffeeHint(true), 3000);
        return () => clearTimeout(timer);
      }
    } else if (progress >= 100 && onComplete) {
      // Auto-open the protocol when complete
      const timer = setTimeout(() => {
        onComplete();
        setShow(false);
        setShowCoffeeHint(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isGenerating, progress, onComplete, isLargeTranscript]);

  if (!show) return null;

  const circumference = 2 * Math.PI * 18; // radius = 18
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="fixed top-4 right-4 z-50 animate-fade-in">
      <div className="bg-gradient-to-br from-card to-card/50 border-2 border-primary/30 rounded-2xl p-4 shadow-2xl shadow-primary/20 flex flex-col gap-3 hover-lift min-w-[280px]">
        <div className="flex items-center gap-3">
          {/* Circular progress */}
          <div className="relative w-12 h-12 flex-shrink-0">
            <svg className="w-12 h-12 transform -rotate-90">
              {/* Background circle */}
              <circle
                cx="24"
                cy="24"
                r="18"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                className="text-muted/30"
              />
              {/* Progress circle */}
              <circle
                cx="24"
                cy="24"
                r="18"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                className="text-primary transition-all duration-500 ease-out drop-shadow-lg"
                strokeLinecap="round"
              />
            </svg>
            {/* Center icon */}
            <div className="absolute inset-0 flex items-center justify-center">
              {isLargeTranscript && showCoffeeHint ? (
                <Coffee className="w-5 h-5 text-amber-500 animate-pulse drop-shadow-lg" />
              ) : (
                <Loader2 className="w-5 h-5 text-primary animate-spin drop-shadow-lg" />
              )}
            </div>
          </div>

          {/* Text */}
          <div className="flex-1">
            <p className="text-sm font-semibold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Genererar protokoll
            </p>
            <p className="text-xs text-muted-foreground font-medium">
              {Math.round(progress)}%
            </p>
          </div>
        </div>

        {/* Coffee break message for large transcripts */}
        {isLargeTranscript && showCoffeeHint && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 animate-fade-in">
            <div className="flex items-start gap-2">
              <Coffee className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div className="text-xs">
                <p className="font-medium text-amber-600 dark:text-amber-400">
                  Perfekt tillfälle för en kaffe! ☕
                </p>
                <p className="text-muted-foreground mt-1">
                  Stora inspelningar tar lite längre tid. Vänta lugnt även om det verkar ha fastnat – det arbetar på!
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
