import { useState, useRef, useEffect } from "react";
import { useScrollToInputHandler } from "@/hooks/useScrollToInput";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Plus, X, ArrowRight, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

interface ParticipantsInputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (participants: string[]) => void;
  title?: string;
  subtitle?: string;
  confirmLabel?: string;
  allowSkip?: boolean;
}

export const ParticipantsInputDialog = ({
  open,
  onOpenChange,
  onConfirm,
  title = "Mötesdeltagare",
  subtitle = "Ange deltagarnas namn för bättre transkribering",
  confirmLabel = "Fortsätt",
  allowSkip = true,
}: ParticipantsInputDialogProps) => {
  const [participants, setParticipants] = useState<string[]>([""]);
  const { handleFocus: scrollOnFocus } = useScrollToInputHandler();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setParticipants([""]);
    }
  }, [open]);

  // Focus latest input
  useEffect(() => {
    const lastIndex = participants.length - 1;
    if (inputRefs.current[lastIndex]) {
      inputRefs.current[lastIndex]?.focus();
    }
  }, [participants.length]);

  const handleAdd = () => {
    setParticipants((prev) => [...prev, ""]);
  };

  const handleRemove = (index: number) => {
    if (participants.length <= 1) return;
    setParticipants((prev) => prev.filter((_, i) => i !== index));
  };

  const handleChange = (index: number, value: string) => {
    setParticipants((prev) => prev.map((p, i) => (i === index ? value : p)));
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // If current input has text, add a new row
      if (participants[index].trim()) {
        handleAdd();
      }
    }
  };

  const filledParticipants = participants
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const handleConfirm = () => {
    onConfirm(filledParticipants);
  };

  const handleSkip = () => {
    onConfirm([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-sm p-0 gap-0 overflow-hidden border-border/40 rounded-2xl"
        aria-describedby={undefined}
      >
        <VisuallyHidden>
          <DialogTitle>{title}</DialogTitle>
        </VisuallyHidden>

        <div className="p-5 space-y-4">
          {/* Header */}
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Users className="w-6 h-6 text-primary" />
            </div>
          </div>

          <div className="text-center space-y-1">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>

          {/* Participant inputs */}
          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {participants.map((name, index) => (
              <div key={index} className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <span className="text-xs font-medium text-muted-foreground">
                    {index + 1}
                  </span>
                </div>
                <Input
                  ref={(el) => { inputRefs.current[index] = el; }}
                  placeholder="Förnamn Efternamn"
                  value={name}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  onFocus={scrollOnFocus}
                  className="h-10 rounded-xl border-border/50 bg-muted/30 text-sm placeholder:text-muted-foreground/50"
                />
                {participants.length > 1 && (
                  <button
                    onClick={() => handleRemove(index)}
                    className="w-7 h-7 rounded-full hover:bg-destructive/10 flex items-center justify-center shrink-0 transition-colors"
                  >
                    <X className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Add button */}
          <button
            onClick={handleAdd}
            className="w-full flex items-center justify-center gap-2 py-2 text-sm text-primary hover:text-primary/80 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Lägg till deltagare
          </button>

          {/* Actions */}
          <div className="space-y-2">
            <Button
              onClick={handleConfirm}
              disabled={filledParticipants.length === 0}
              className="w-full h-11 rounded-xl text-sm font-medium gap-2"
            >
              <UserPlus className="w-4 h-4" />
              {confirmLabel}
              {filledParticipants.length > 0 && (
                <span className="text-primary-foreground/70">
                  ({filledParticipants.length})
                </span>
              )}
            </Button>

            {allowSkip && (
              <button
                onClick={handleSkip}
                className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Hoppa över
              </button>
            )}
          </div>
        </div>

        <div className="px-5 py-2.5 bg-muted/20 border-t border-border/30">
          <p className="text-[11px] text-muted-foreground/60 text-center">
            Fullständiga namn ger bättre namnigenkänning i transkriptet
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
