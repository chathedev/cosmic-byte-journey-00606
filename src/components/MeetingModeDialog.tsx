import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Users, Phone, ArrowRight, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

export type MeetingMode = 'in-person' | 'phone-call';

interface MeetingModeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (mode: MeetingMode) => void;
}

export const MeetingModeDialog = ({
  open,
  onOpenChange,
  onSelect,
}: MeetingModeDialogProps) => {
  const [hoveredOption, setHoveredOption] = useState<MeetingMode | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden border-border/50" aria-describedby={undefined}>
        <VisuallyHidden>
          <DialogTitle>Välj inspelningsläge</DialogTitle>
        </VisuallyHidden>
        <div className="p-6 pb-4">
          <h2 className="text-xl font-semibold text-foreground text-center">
            Hur ser mötet ut?
          </h2>
          <p className="text-sm text-muted-foreground text-center mt-1">
            Vi anpassar inspelningen efter din situation
          </p>
        </div>

        <div className="px-4 pb-6 space-y-3">
          {/* In Person Option */}
          <button
            onClick={() => onSelect('in-person')}
            onMouseEnter={() => setHoveredOption('in-person')}
            onMouseLeave={() => setHoveredOption(null)}
            className={cn(
              "w-full p-4 rounded-xl border-2 text-left transition-all duration-200",
              "flex items-center gap-4 group",
              hoveredOption === 'in-person'
                ? "border-primary bg-primary/5 shadow-md"
                : "border-border hover:border-primary/50 bg-card"
            )}
          >
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors",
              hoveredOption === 'in-person'
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}>
              <Users className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-foreground">Fysiskt möte</span>
              <p className="text-sm text-muted-foreground mt-0.5">
                Alla sitter i samma rum
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1 flex items-center gap-1">
                <Phone className="w-3 h-3" />
                Pausar automatiskt vid inkommande samtal
              </p>
            </div>
            <ArrowRight className={cn(
              "w-5 h-5 shrink-0 transition-all",
              hoveredOption === 'in-person'
                ? "text-primary translate-x-0.5"
                : "text-muted-foreground/50"
            )} />
          </button>

          {/* Phone Call Option */}
          <button
            onClick={() => onSelect('phone-call')}
            onMouseEnter={() => setHoveredOption('phone-call')}
            onMouseLeave={() => setHoveredOption(null)}
            className={cn(
              "w-full p-4 rounded-xl border-2 text-left transition-all duration-200",
              "flex items-center gap-4 group",
              hoveredOption === 'phone-call'
                ? "border-primary bg-primary/5 shadow-md"
                : "border-border hover:border-primary/50 bg-card"
            )}
          >
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors",
              hoveredOption === 'phone-call'
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}>
              <Phone className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-foreground">Telefonmöte</span>
              <p className="text-sm text-muted-foreground mt-0.5">
                Mötet sker via telefon eller högtalartelefon
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1 flex items-center gap-1">
                <Mic className="w-3 h-3" />
                Fortsätter spela in även vid samtal
              </p>
            </div>
            <ArrowRight className={cn(
              "w-5 h-5 shrink-0 transition-all",
              hoveredOption === 'phone-call'
                ? "text-primary translate-x-0.5"
                : "text-muted-foreground/50"
            )} />
          </button>
        </div>

        <div className="px-6 py-3 bg-muted/30 border-t border-border/50">
          <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
            <Mic className="w-3.5 h-3.5 text-primary" />
            Tips: Låt alla säga sitt namn i början för bättre protokoll
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
