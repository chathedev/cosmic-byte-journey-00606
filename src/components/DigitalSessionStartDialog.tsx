import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Monitor, Loader2, AlertCircle, Link2 } from "lucide-react";

interface DigitalSessionStartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (joinUrl: string, title: string) => Promise<boolean>;
  isLocked: boolean;
  error: string | null;
}

const TEAMS_URL_PATTERN = /teams\.microsoft\.com|teams\.live\.com/i;

export const DigitalSessionStartDialog = ({
  open,
  onOpenChange,
  onStart,
  isLocked,
  error,
}: DigitalSessionStartDialogProps) => {
  const [joinUrl, setJoinUrl] = useState("");
  const [title, setTitle] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isValidUrl = joinUrl.trim().length > 10 && TEAMS_URL_PATTERN.test(joinUrl);

  const handleStart = async () => {
    if (!isValidUrl) {
      setLocalError("Klistra in en giltig Teams-möteslänk");
      return;
    }

    setLocalError(null);
    setIsStarting(true);

    const success = await onStart(joinUrl.trim(), title.trim() || "Digitalt möte");

    if (success) {
      setJoinUrl("");
      setTitle("");
      onOpenChange(false);
    }

    setIsStarting(false);
  };

  const displayError = localError || error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden border-border/50" aria-describedby={undefined}>
        <VisuallyHidden>
          <DialogTitle>Starta digital session</DialogTitle>
        </VisuallyHidden>

        <div className="p-6 pb-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Monitor className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold text-foreground">Gå med i Teams-möte</h2>
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Vår bot går med i mötet och transkriberar automatiskt
          </p>
        </div>

        <div className="px-6 pb-4 space-y-4">
          {isLocked && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">
                En digital session är redan aktiv. Avsluta den först.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Teams-möteslänk *</label>
            <div className="relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="https://teams.microsoft.com/l/meetup-join/..."
                value={joinUrl}
                onChange={(e) => {
                  setJoinUrl(e.target.value);
                  setLocalError(null);
                }}
                className="pl-10"
                disabled={isLocked || isStarting}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Mötesnamn (valfritt)</label>
            <Input
              placeholder="t.ex. Kundmöte Acme"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isLocked || isStarting}
            />
          </div>

          {displayError && !isLocked && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{displayError}</p>
            </div>
          )}

          <Button
            onClick={handleStart}
            disabled={isLocked || isStarting || !joinUrl.trim()}
            className="w-full h-12 text-base gap-2"
          >
            {isStarting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Startar...
              </>
            ) : (
              <>
                <Monitor className="w-5 h-5" />
                Starta digital session
              </>
            )}
          </Button>
        </div>

        <div className="px-6 py-3 bg-muted/30 border-t border-border/50">
          <p className="text-xs text-muted-foreground text-center">
            Boten går med som deltagare — alla i mötet ser att den är med
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
