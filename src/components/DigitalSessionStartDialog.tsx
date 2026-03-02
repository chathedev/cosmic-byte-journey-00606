import { useState, useEffect } from "react";
import { useScrollToInputHandler } from "@/hooks/useScrollToInput";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, AlertCircle, ArrowRight, Monitor, Bot, Users, Plus, X, ArrowLeft } from "lucide-react";

interface DigitalSessionStartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (joinUrl: string, title: string, participants?: string[]) => Promise<boolean>;
  isLocked: boolean;
  error: string | null;
  onClearError?: () => void;
}

type Step = 'details' | 'participants';

const TEAMS_URL_PATTERN = /teams\.microsoft\.com|teams\.live\.com/i;

export const DigitalSessionStartDialog = ({
  open,
  onOpenChange,
  onStart,
  isLocked,
  error,
  onClearError,
}: DigitalSessionStartDialogProps) => {
  const [joinUrl, setJoinUrl] = useState("");
  const [title, setTitle] = useState("");
  const { handleFocus: scrollOnFocus } = useScrollToInputHandler();
  const [isStarting, setIsStarting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('details');
  const [participants, setParticipants] = useState<string[]>([""]);

  const isValidUrl = joinUrl.trim().length > 10 && TEAMS_URL_PATTERN.test(joinUrl);

  // Clear stale errors when dialog opens
  useEffect(() => {
    if (open) {
      setLocalError(null);
      setStep('details');
      setParticipants([""]);
      onClearError?.();
    }
  }, [open]);

  const handleNext = () => {
    if (!isValidUrl) {
      setLocalError("Klistra in en giltig Teams-möteslänk");
      return;
    }
    setLocalError(null);
    setStep('participants');
  };

  const handleStart = async (participantList?: string[]) => {
    setLocalError(null);
    setIsStarting(true);

    const filledParticipants = (participantList || participants)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    const success = await onStart(
      joinUrl.trim(),
      title.trim() || "Digitalt möte",
      filledParticipants.length > 0 ? filledParticipants : undefined
    );

    if (success) {
      setJoinUrl("");
      setTitle("");
      setParticipants([""]);
      onOpenChange(false);
    }

    setIsStarting(false);
  };

  const handleAddParticipant = () => {
    setParticipants(prev => [...prev, ""]);
  };

  const handleRemoveParticipant = (index: number) => {
    if (participants.length <= 1) return;
    setParticipants(prev => prev.filter((_, i) => i !== index));
  };

  const handleParticipantChange = (index: number, value: string) => {
    setParticipants(prev => prev.map((p, i) => (i === index ? value : p)));
  };

  const handleParticipantKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (participants[index].trim()) {
        handleAddParticipant();
      }
    }
  };

  const handleUrlChange = (value: string) => {
    setJoinUrl(value);
    setLocalError(null);
    onClearError?.();
  };

  const displayError = localError || error;

  const filledCount = participants.map(p => p.trim()).filter(p => p.length > 0).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm p-0 gap-0 overflow-hidden border-border/40 rounded-2xl" aria-describedby={undefined}>
        <VisuallyHidden>
          <DialogTitle>Digital session</DialogTitle>
        </VisuallyHidden>

        {step === 'details' ? (
          <div className="p-5 space-y-4">
            {/* Header icon */}
            <div className="flex justify-center">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Monitor className="w-6 h-6 text-primary" />
              </div>
            </div>

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
                onChange={(e) => handleUrlChange(e.target.value)}
                onFocus={scrollOnFocus}
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
                onFocus={scrollOnFocus}
                className="h-11 rounded-xl border-border/50 bg-muted/30 text-sm placeholder:text-muted-foreground/50"
                disabled={isLocked || isStarting}
              />
            </div>

            {displayError && !isLocked && (
              <div className="p-2.5 rounded-lg bg-destructive/5 border border-destructive/15">
                <p className="text-xs text-destructive flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {displayError}
                </p>
              </div>
            )}

            <Button
              onClick={handleNext}
              disabled={isLocked || !joinUrl.trim()}
              className="w-full h-11 rounded-xl text-sm font-medium gap-2"
            >
              Nästa
              <ArrowRight className="w-4 h-4" />
            </Button>

            <div className="px-0 py-1">
              <p className="text-[11px] text-muted-foreground/60 text-center flex items-center justify-center gap-1.5">
                <Bot className="w-3 h-3" />
                Boten syns som deltagare i mötet
              </p>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {/* Header */}
            <div className="flex justify-center">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Users className="w-6 h-6 text-primary" />
              </div>
            </div>

            <div className="text-center space-y-1">
              <h2 className="text-lg font-semibold text-foreground">Mötesdeltagare</h2>
              <p className="text-sm text-muted-foreground">Ange deltagarnas namn för bättre transkribering</p>
            </div>

            {/* Participant inputs */}
            <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
              {participants.map((name, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <span className="text-xs font-medium text-muted-foreground">{index + 1}</span>
                  </div>
                  <Input
                    placeholder="Förnamn Efternamn"
                    value={name}
                    onChange={(e) => handleParticipantChange(index, e.target.value)}
                    onKeyDown={(e) => handleParticipantKeyDown(e, index)}
                    onFocus={scrollOnFocus}
                    className="h-10 rounded-xl border-border/50 bg-muted/30 text-sm placeholder:text-muted-foreground/50"
                    autoFocus={index === participants.length - 1}
                  />
                  {participants.length > 1 && (
                    <button
                      onClick={() => handleRemoveParticipant(index)}
                      className="w-7 h-7 rounded-full hover:bg-destructive/10 flex items-center justify-center shrink-0 transition-colors"
                    >
                      <X className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={handleAddParticipant}
              className="w-full flex items-center justify-center gap-2 py-2 text-sm text-primary hover:text-primary/80 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Lägg till deltagare
            </button>

            {/* Actions */}
            <div className="space-y-2">
              <Button
                onClick={() => handleStart()}
                disabled={isStarting}
                className="w-full h-11 rounded-xl text-sm font-medium gap-2"
              >
                {isStarting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Starta
                    {filledCount > 0 && <span className="text-primary-foreground/70">({filledCount} deltagare)</span>}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => setStep('details')}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Tillbaka
                </button>
                <button
                  onClick={() => handleStart([])}
                  disabled={isStarting}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Hoppa över
                </button>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground/60 text-center">
              Fullständiga namn ger bättre namnigenkänning i transkriptet
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
