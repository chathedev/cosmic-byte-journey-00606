import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
interface WelcomeScreenProps {
  onPermissionGranted: () => void;
  onPermissionDenied: () => void;
}
export const WelcomeScreen = ({
  onPermissionGranted,
  onPermissionDenied
}: WelcomeScreenProps) => {
  const requestMicrophonePermission = async () => {
    try {
      // Be om både mikrofon OCH systemljud (desktop audio)
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };

      // Försök först med systemljud-capture om det stöds
      try {
        // @ts-ignore - Chrome experimentell funktion
        await navigator.mediaDevices.getUserMedia({
          audio: {
            ...constraints.audio,
            // @ts-ignore
            systemAudio: "include"
          }
        });
      } catch (systemAudioError) {
        // Fallback till endast mikrofon om systemljud inte stöds
        console.log("Systemljud inte tillgängligt, använder endast mikrofon");
        await navigator.mediaDevices.getUserMedia(constraints);
      }
      onPermissionGranted();
    } catch (error) {
      console.error("Mikrofontillstånd nekades:", error);
      onPermissionDenied();
    }
  };
  return <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="space-y-4">
          <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
            <Mic className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">
            Mötestranskribering
          </h1>
          <p className="text-muted-foreground text-lg">
            Transkribera dina möten i realtid till text. Allt sker lokalt i din webbläsare – inget sparas.
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <h2 className="font-semibold text-card-foreground">
            Innan vi börjar:
          </h2>
          <ul className="text-sm text-muted-foreground space-y-2 text-left">
            <li>✓ Vi behöver tillgång till din mikrofon endast</li>
            <li>✓ Fångar bara i möte personligt, inte via teams osv</li>
            <li>✓ Allt transkriberas lokalt i webbläsaren</li>
            <li>✓ Ingen data sparas eller skickas någonstans</li>
            <li>✓ Fungerar bäst i Google och Edge</li>
          </ul>
        </div>

        <Button onClick={requestMicrophonePermission} size="lg" className="w-full">
          <Mic className="mr-2" />
          Ge mikrofontillstånd
        </Button>

        <p className="text-xs text-muted-foreground">
          Du kan när som helst återkalla tillståndet i webbläsarens inställningar
        </p>
      </div>
    </div>;
};