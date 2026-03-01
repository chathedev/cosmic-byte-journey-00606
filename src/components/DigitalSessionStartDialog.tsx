import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, AlertCircle, ArrowRight } from "lucide-react";

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
      <DialogContent className="sm:max-w-sm p-0 gap-0 overflow-hidden border-border/40 rounded-2xl" aria-describedby={undefined}>
        <VisuallyHidden>
          <DialogTitle>Digital session</DialogTitle>
        </VisuallyHidden>

        <div className="p-5 space-y-4">
          {isLocked && (
            <div className="p-3 rounded-xl bg-destructive/8 border border-destructive/15 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive leading-snug">
                En session är redan aktiv. Avsluta den först.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Teams-länk</label>
            <Input
              placeholder="Klistra in möteslänk..."
              value={joinUrl}
              onChange={(e) => {
                setJoinUrl(e.target.value);
                setLocalError(null);
              }}
              className="h-11 rounded-xl border-border/50 bg-muted/30 text-sm placeholder:text-muted-foreground/50"
              disabled={isLocked || isStarting}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Namn <span className="text-muted-foreground/50 normal-case">(valfritt)</span></label>
            <Input
              placeholder="t.ex. Kundmöte Acme"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-11 rounded-xl border-border/50 bg-muted/30 text-sm placeholder:text-muted-foreground/50"
              disabled={isLocked || isStarting}
            />
          </div>

          {displayError && !isLocked && (
            <p className="text-xs text-destructive flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {displayError}
            </p>
          )}

          <Button
            onClick={handleStart}
            disabled={isLocked || isStarting || !joinUrl.trim()}
            className="w-full h-11 rounded-xl text-sm font-medium gap-2"
          >
            {isStarting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                Starta
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>

        <div className="px-5 py-2.5 bg-muted/20 border-t border-border/30">
          <p className="text-[11px] text-muted-foreground/60 text-center">
            Boten syns som deltagare i mötet
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
