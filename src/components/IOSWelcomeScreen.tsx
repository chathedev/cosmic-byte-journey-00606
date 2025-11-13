import { useState } from "react";
import { Mic, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import tivlyLogo from "@/assets/tivly-logo.png";

interface IOSWelcomeScreenProps {
  onComplete: () => void;
}

export const IOSWelcomeScreen = ({ onComplete }: IOSWelcomeScreenProps) => {
  const [step, setStep] = useState<0 | 1>(0);
  const [requesting, setRequesting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const hapticLight = async () => {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {
      // Haptics not available (web browser)
    }
  };

  const hapticMedium = async () => {
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch (e) {
      // Haptics not available
    }
  };

  const proceedOnce = () => {
    if (completed) return;
    setCompleted(true);
    onComplete();
  };
  const requestMicrophonePermission = async () => {
    setRequesting(true);
    setPermissionDenied(false);
    
    try {
      await hapticMedium();
    } catch (e) {
      // Haptics may not be available
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      // Permission granted - clean up and proceed
      stream.getTracks().forEach((track) => track.stop());
      
      try {
        await Haptics.notification({ type: NotificationType.Success });
      } catch {}
      
      // Wait a moment for the success haptic, then proceed
      setTimeout(() => {
        proceedOnce();
      }, 200);
      
    } catch (error: any) {
      console.error("Microphone permission denied:", error);
      
      // Permission denied
      try {
        await Haptics.notification({ type: NotificationType.Error });
      } catch {}
      
      setPermissionDenied(true);
      setRequesting(false);
    }
  };

  return (
    <div 
      className="min-h-screen bg-gradient-to-br from-primary/20 via-background to-accent/20 flex items-center justify-center p-4 sm:p-6 safe-area-inset"
    >
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-border/50 bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden">
          <div className="p-6 sm:p-8 space-y-6">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/30 flex items-center justify-center shadow-lg">
                <img src={tivlyLogo} alt="Tivly" className="w-10 h-10 object-contain" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
                Välkommen till Tivly
              </h1>
              <p className="text-sm text-muted-foreground text-center max-w-xs leading-relaxed">
                Snabb, enkel och säker mötesinspelning med AI-genererade protokoll
              </p>
            </div>

            {step === 0 && (
              <div className="space-y-4">
                <div className="space-y-3 p-5 rounded-2xl border border-border/60 bg-muted/30">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
                        <Mic className="w-4 h-4 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">Spela in möten</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Högkvalitativa inspelningar direkt från din enhet
                        </p>
                      </div>
                    </div>
                    <div className="h-px bg-border/50" />
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">AI-protokoll</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Automatiskt genererade och formaterade protokoll
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <Button
                      onClick={async () => {
                        try {
                          await hapticLight();
                        } catch (e) {
                          // Haptics not available
                        }
                        setStep(1);
                      }} 
                      size="lg" 
                      className="w-full rounded-xl h-14 active:scale-95 transition-all duration-200 touch-manipulation text-base font-semibold shadow-lg"
                    >
                      Kom igång
                    </Button>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-5">
                  <div className={`p-5 rounded-2xl border backdrop-blur-sm ${
                      permissionDenied 
                        ? 'border-destructive/60 bg-destructive/10' 
                        : 'border-border/60 bg-muted/30'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 shrink-0 rounded-xl border shadow-lg flex items-center justify-center ${
                          permissionDenied
                            ? 'bg-destructive/20 border-destructive/30'
                            : 'bg-gradient-to-br from-primary/20 to-primary/10 border-primary/30'
                        }`}
                      >
                        <Mic className={`w-6 h-6 ${permissionDenied ? 'text-destructive' : 'text-primary'}`} />
                      </div>
                      <div className="flex-1 text-left space-y-1.5">
                        <p className={`text-base font-semibold ${permissionDenied ? 'text-destructive' : 'text-foreground'}`}>
                          {permissionDenied ? 'Åtkomst nekad' : 'Mikrofonåtkomst'}
                        </p>
                        <p className={`text-sm leading-relaxed ${permissionDenied ? 'text-destructive/90' : 'text-muted-foreground'}`}>
                          {permissionDenied 
                            ? 'Vi behöver tillgång till mikrofonen för att kunna spela in möten. Vänligen aktivera mikrofonåtkomst i webbläsarens inställningar.'
                            : 'Vi behöver tillgång till mikrofonen för att kunna spela in dina möten med högsta kvalitet'
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <Button
                      onClick={requestMicrophonePermission} 
                      size="lg" 
                      disabled={requesting}
                      variant={permissionDenied ? "destructive" : "default"}
                      className="w-full rounded-xl h-14 active:scale-95 transition-all duration-200 touch-manipulation text-base font-semibold shadow-lg disabled:opacity-50"
                    >
                      {requesting ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Väntar på tillåtelse...
                        </>
                      ) : permissionDenied ? (
                        <>
                          <Mic className="mr-2 h-5 w-5" />
                          Försök igen
                        </>
                      ) : (
                        <>
                          <Mic className="mr-2 h-5 w-5" />
                          Tillåt mikrofon
                        </>
                      )}
                    </Button>
                  </div>
                  
                  {!permissionDenied && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                        <div className="w-1 h-1 bg-muted-foreground/40 rounded-full" />
                        <span>Säker och privat</span>
                        <div className="w-1 h-1 bg-muted-foreground/40 rounded-full" />
                      </div>
                      <p className="text-xs text-muted-foreground text-center leading-relaxed px-4">
                        Du kan när som helst ändra detta i enhetens inställningar
                      </p>
                    </div>
                  )}
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
};