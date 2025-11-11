import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProtocolGenerationWidgetProps {
  isGenerating: boolean;
  progress: number; // 0-100
  onComplete?: () => void;
}

export const ProtocolGenerationWidget = ({
  isGenerating,
  progress,
  onComplete,
}: ProtocolGenerationWidgetProps) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isGenerating) {
      setShow(true);
    } else if (progress >= 100 && onComplete) {
      // Auto-open the protocol when complete
      const timer = setTimeout(() => {
        onComplete();
        setShow(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isGenerating, progress, onComplete]);

  if (!show) return null;

  const circumference = 2 * Math.PI * 18; // radius = 18
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="fixed top-4 right-4 z-50 animate-fade-in">
      <div className="bg-gradient-to-br from-card to-card/50 border-2 border-primary/30 rounded-full p-3 shadow-2xl shadow-primary/20 flex items-center gap-3 hover-lift">
        {/* Circular progress */}
        <div className="relative w-12 h-12">
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
            <Loader2 className="w-5 h-5 text-primary animate-spin drop-shadow-lg" />
          </div>
        </div>

        {/* Text */}
        <div className="pr-2">
          <p className="text-sm font-semibold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Genererar protokoll
          </p>
          <p className="text-xs text-muted-foreground font-medium animate-pulse">
            {Math.round(progress)}%
          </p>
        </div>
      </div>
    </div>
  );
};
