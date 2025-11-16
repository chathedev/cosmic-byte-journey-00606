import { Loader2, FileText, Brain, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

interface AnalyzingScreenProps {
  isVisible: boolean;
}

export const AnalyzingScreen = ({ isVisible }: AnalyzingScreenProps) => {
  const [step, setStep] = useState(0);

  const steps = [
    { icon: FileText, text: "Bearbetar transkription..." },
    { icon: Brain, text: "Analyserar innehåll..." },
    { icon: Sparkles, text: "Förbereder protokoll..." },
  ];

  useEffect(() => {
    if (!isVisible) {
      setStep(0);
      return;
    }

    const interval = setInterval(() => {
      setStep((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
    }, 1200);

    return () => clearInterval(interval);
  }, [isVisible]);

  if (!isVisible) return null;

  const CurrentIcon = steps[step].icon;

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="max-w-md w-full mx-4 text-center space-y-8">
        {/* Animated Icon */}
        <div className="relative flex items-center justify-center">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-32 h-32 bg-primary/20 rounded-full animate-ping" />
          </div>
          <div className="relative bg-primary/10 backdrop-blur-sm rounded-full p-8 border-2 border-primary/30">
            <Loader2 className="w-16 h-16 text-primary animate-spin" />
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-4">
          {steps.map((s, idx) => {
            const StepIcon = s.icon;
            const isActive = idx === step;
            const isCompleted = idx < step;

            return (
              <div
                key={idx}
                className={`flex items-center gap-3 p-4 rounded-lg border transition-all duration-500 ${
                  isActive
                    ? "bg-primary/10 border-primary/50 scale-105"
                    : isCompleted
                    ? "bg-muted/50 border-border opacity-60"
                    : "bg-background border-border/30 opacity-40"
                }`}
              >
                <div
                  className={`p-2 rounded-full ${
                    isActive ? "bg-primary/20" : "bg-muted"
                  }`}
                >
                  <StepIcon
                    className={`w-5 h-5 ${
                      isActive ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                </div>
                <p
                  className={`text-sm font-medium ${
                    isActive ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {s.text}
                </p>
              </div>
            );
          })}
        </div>

        {/* Message */}
        <p className="text-sm text-muted-foreground">
          Detta tar bara några sekunder...
        </p>
      </div>
    </div>
  );
};
