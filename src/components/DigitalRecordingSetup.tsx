import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Monitor, Mic, Volume2, Check, AlertCircle, Loader2, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface DigitalRecordingSetupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartRecording: (streams: { systemStream?: MediaStream; micStream?: MediaStream }) => void;
}

type AudioSource = 'both' | 'system' | 'mic';

export const DigitalRecordingSetup = ({
  open,
  onOpenChange,
  onStartRecording,
}: DigitalRecordingSetupProps) => {
  const [audioSource, setAudioSource] = useState<AudioSource>('both');
  const [systemAudioReady, setSystemAudioReady] = useState(false);
  const [micAudioReady, setMicAudioReady] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  
  const systemStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  // IMPORTANT: when the dialog closes because we're navigating into recording,
  // we must NOT stop tracks (otherwise digital recording becomes silent).
  const cleanupOnCloseRef = useRef(true);

  // Cleanup streams on close
  useEffect(() => {
    if (!open) {
      if (cleanupOnCloseRef.current) {
        systemStreamRef.current?.getTracks().forEach(t => t.stop());
        micStreamRef.current?.getTracks().forEach(t => t.stop());
        systemStreamRef.current = null;
        micStreamRef.current = null;
        setSystemAudioReady(false);
        setMicAudioReady(false);
        setError(null);
      }

      // Reset for next open
      cleanupOnCloseRef.current = true;
    }
  }, [open]);

  const requestSystemAudio = async () => {
    try {
      setError(null);
      // Request display media with audio
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true, // Required for getDisplayMedia
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      // Check if we got audio
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        // Stop video track since we don't need it
        stream.getVideoTracks().forEach(t => t.stop());
        setError("Inget systemljud valdes. Se till att välja 'Dela systemljud' eller 'Share system audio'.");
        return false;
      }

      // Stop video track, we only need audio
      stream.getVideoTracks().forEach(t => t.stop());
      
      // Create audio-only stream
      systemStreamRef.current = new MediaStream(audioTracks);
      setSystemAudioReady(true);
      return true;
    } catch (err: any) {
      console.error('System audio error:', err);
      if (err.name === 'NotAllowedError') {
        setError("Åtkomst nekad. Tillåt skärmdelning för att fånga systemljud.");
      } else {
        setError("Kunde inte fånga systemljud. Försök igen.");
      }
      return false;
    }
  };

  const requestMicAudio = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = stream;
      setMicAudioReady(true);
      return true;
    } catch (err: any) {
      console.error('Mic audio error:', err);
      if (err.name === 'NotAllowedError') {
        setError("Mikrofonåtkomst nekad. Tillåt mikrofon i webbläsaren.");
      } else {
        setError("Kunde inte komma åt mikrofonen. Försök igen.");
      }
      return false;
    }
  };

  const handleSetupAndStart = async () => {
    setIsSettingUp(true);
    setError(null);

    try {
      let systemOk = true;
      let micOk = true;

      // Request needed streams based on selection
      if (audioSource === 'both' || audioSource === 'system') {
        if (!systemAudioReady) {
          systemOk = await requestSystemAudio();
        }
      }

      if (audioSource === 'both' || audioSource === 'mic') {
        if (!micAudioReady) {
          micOk = await requestMicAudio();
        }
      }

      // Check if we got what we needed
      if (audioSource === 'both' && (!systemOk || !micOk)) {
        setIsSettingUp(false);
        return;
      }
      if (audioSource === 'system' && !systemOk) {
        setIsSettingUp(false);
        return;
      }
      if (audioSource === 'mic' && !micOk) {
        setIsSettingUp(false);
        return;
      }

      // All good, start recording
      // Prevent the "dialog closed" cleanup from stopping tracks.
      cleanupOnCloseRef.current = false;
      onStartRecording({
        systemStream: systemStreamRef.current || undefined,
        micStream: micStreamRef.current || undefined,
      });
      
      onOpenChange(false);
    } catch (err) {
      console.error('Setup error:', err);
      setError("Ett fel uppstod. Försök igen.");
      cleanupOnCloseRef.current = true;
    } finally {
      setIsSettingUp(false);
    }
  };

  const canStart = () => {
    if (audioSource === 'both') return true; // Will request both
    if (audioSource === 'system') return true;
    if (audioSource === 'mic') return true;
    return false;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden border-border/50" aria-describedby={undefined}>
        <VisuallyHidden>
          <DialogTitle>Digitalt möte</DialogTitle>
        </VisuallyHidden>
        <div className="p-6 pb-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Monitor className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold text-foreground">
              Digitalt möte
            </h2>
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Välj vilka ljudkällor som ska spelas in
          </p>
        </div>

        <div className="px-6 pb-4">
          <Tabs value={audioSource} onValueChange={(v) => setAudioSource(v as AudioSource)}>
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="both" className="text-xs sm:text-sm">
                Båda
              </TabsTrigger>
              <TabsTrigger value="system" className="text-xs sm:text-sm">
                Systemljud
              </TabsTrigger>
              <TabsTrigger value="mic" className="text-xs sm:text-sm">
                Mikrofon
              </TabsTrigger>
            </TabsList>

            <TabsContent value="both" className="mt-4 space-y-3">
              <AudioSourceCard
                icon={Volume2}
                title="Systemljud"
                description="Fångar allt ljud från mötet (Zoom, Teams, etc.)"
                ready={systemAudioReady}
              />
              <AudioSourceCard
                icon={Mic}
                title="Din mikrofon"
                description="Spelar in din egen röst"
                ready={micAudioReady}
              />
            </TabsContent>

            <TabsContent value="system" className="mt-4">
              <AudioSourceCard
                icon={Volume2}
                title="Endast systemljud"
                description="Fångar mötesdeltagarnas röster utan din egen"
                ready={systemAudioReady}
              />
            </TabsContent>

            <TabsContent value="mic" className="mt-4">
              <AudioSourceCard
                icon={Mic}
                title="Endast mikrofon"
                description="Spelar bara in din egen röst"
                ready={micAudioReady}
              />
            </TabsContent>
          </Tabs>
        </div>

        {error && (
          <div className="mx-6 mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="px-6 pb-6">
          <Button
            onClick={handleSetupAndStart}
            disabled={!canStart() || isSettingUp}
            className="w-full h-12 text-base gap-2"
          >
            {isSettingUp ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Förbereder...
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                Starta inspelning
              </>
            )}
          </Button>
        </div>

        <div className="px-6 py-3 bg-muted/30 border-t border-border/50">
          <p className="text-xs text-muted-foreground text-center">
            För systemljud: Välj en flik/fönster och aktivera "Dela systemljud"
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

interface AudioSourceCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  ready: boolean;
}

const AudioSourceCard = ({ icon: Icon, title, description, ready }: AudioSourceCardProps) => (
  <div className={cn(
    "p-4 rounded-xl border-2 transition-colors",
    ready 
      ? "border-primary/50 bg-primary/5" 
      : "border-border bg-card"
  )}>
    <div className="flex items-center gap-3">
      <div className={cn(
        "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
        ready ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
      )}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground text-sm">{title}</span>
          {ready && <Check className="w-4 h-4 text-primary" />}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  </div>
);
