import { useEffect, useState } from "react";
import { X, Mic, Users, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export const OnboardingModal = () => {
  const [isVisible, setIsVisible] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    
    const hasSeenOnboarding = localStorage.getItem(`onboarding_seen_${user.uid}`);
    if (!hasSeenOnboarding) {
      setTimeout(() => setIsVisible(true), 500);
    }
  }, [user]);

  const handleClose = () => {
    setIsVisible(false);
    if (user) {
      localStorage.setItem(`onboarding_seen_${user.uid}`, "true");
    }
  };

  if (!isVisible) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{
        background: "rgba(0, 0, 0, 0.4)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)"
      }}
    >
      <div className="relative max-w-lg w-full bg-card/95 backdrop-blur-xl border border-primary/20 rounded-2xl shadow-2xl animate-scale-in overflow-hidden">
        {/* Decorative gradient */}
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-primary/10 to-transparent" />
        
        <button
          onClick={handleClose}
          className="absolute top-5 right-5 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-background/80 hover:bg-background border border-border hover:border-primary/50 transition-all duration-200 hover:scale-110"
          aria-label="Stäng"
        >
          <X className="w-4 h-4 text-foreground" />
        </button>

        <div className="relative p-10 space-y-8">
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
              <div className="relative w-20 h-20 bg-gradient-to-br from-primary/20 to-primary/10 rounded-full flex items-center justify-center border border-primary/30">
                <Mic className="w-10 h-10 text-primary" />
              </div>
            </div>
          </div>

          <div className="text-center space-y-3">
            <div className="flex items-center justify-center gap-2">
              <h2 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                Välkommen till Tivly
              </h2>
              <Sparkles className="w-6 h-6 text-primary animate-pulse" />
            </div>
            <p className="text-lg text-muted-foreground">
              Din smarta assistent för mötesdokumentation
            </p>
          </div>

          <div className="space-y-4">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 to-primary/10 rounded-xl blur opacity-30 group-hover:opacity-50 transition duration-300" />
              <div className="relative flex items-start gap-4 p-5 bg-background/50 backdrop-blur rounded-xl border border-primary/20">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-foreground">
                    För fysiska möten
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Tivly är byggd för möten där du är närvarande personligen. 
                    Den fungerar inte med Teams, Zoom eller andra videomötesverktyg.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 text-sm">
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-primary/5 border border-primary/10">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <p className="text-foreground">Använd din mikrofon för att fånga samtalet</p>
              </div>
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-primary/5 border border-primary/10">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <p className="text-foreground">Allt transkriberas lokalt i din webbläsare</p>
              </div>
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-primary/5 border border-primary/10">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <p className="text-foreground">Fungerar bäst i Chrome och Edge</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
