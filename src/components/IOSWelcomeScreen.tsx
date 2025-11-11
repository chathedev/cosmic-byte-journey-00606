import { useState } from "react";
import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import tivlyLogo from "@/assets/tivly-logo.png";

interface IOSWelcomeScreenProps {
  onComplete: () => void;
}

export const IOSWelcomeScreen = ({ onComplete }: IOSWelcomeScreenProps) => {
  const [step, setStep] = useState<0 | 1>(0);

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

  const requestMicrophonePermission = async () => {
    await hapticMedium();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      await Haptics.notification({ type: NotificationType.Success });
      onComplete();
    } catch (error) {
      console.error("Microphone permission denied:", error);
      await Haptics.notification({ type: NotificationType.Error });
      alert("Mikrofonåtkomst krävs för att spela in möten.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/30 via-accent/20 to-primary/50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="rounded-3xl border border-border/40 bg-background/80 backdrop-blur-2xl shadow-2xl">
          <div className="p-8 space-y-6">
            <div className="flex flex-col items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <img src={tivlyLogo} alt="Tivly" className="w-9 h-9 object-contain" />
              </div>
              <h1 className="text-2xl font-semibold text-foreground tracking-tight">Välkommen</h1>
              <p className="text-sm text-muted-foreground text-center">
                Snabb, enkel och säker mötesinspelning.
              </p>
            </div>

            {step === 0 && (
              <Button 
                onClick={async () => {
                  await hapticLight();
                  setStep(1);
                }} 
                size="lg" 
                className="w-full rounded-xl h-12"
              >
                Kom igång
              </Button>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-background/60">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Mic className="w-5 h-5 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-foreground">Mikrofonåtkomst</p>
                    <p className="text-xs text-muted-foreground">Behövs för att spela in möten.</p>
                  </div>
                </div>
                <Button onClick={requestMicrophonePermission} size="lg" className="w-full rounded-xl h-12">
                  Tillåt mikrofon
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Du kan ändra detta senare i inställningar.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};