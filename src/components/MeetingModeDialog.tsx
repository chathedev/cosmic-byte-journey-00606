import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Users, Phone, ArrowRight, Mic, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

export type MeetingMode = 'in-person' | 'phone-call' | 'digital';

interface MeetingModeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (mode: MeetingMode) => void;
  showDigitalOption?: boolean;
}

const OPTIONS: { mode: MeetingMode; icon: typeof Users; title: string; desc: string; hint: string; hintIcon: typeof Mic }[] = [
  {
    mode: 'in-person',
    icon: Users,
    title: 'Fysiskt möte',
    desc: 'Alla sitter i samma rum',
    hint: 'Pausar automatiskt vid inkommande samtal',
    hintIcon: Phone,
  },
  {
    mode: 'phone-call',
    icon: Phone,
    title: 'Telefonmöte',
    desc: 'Mötet sker via telefon eller högtalartelefon',
    hint: 'Fortsätter spela in även vid samtal',
    hintIcon: Mic,
  },
  {
    mode: 'digital',
    icon: Monitor,
    title: 'Teams-möte (bot)',
    desc: 'En bot går med i ditt Teams-möte och transkriberar',
    hint: 'Du behöver inte spela in själv',
    hintIcon: Monitor,
  },
];

export const MeetingModeDialog = ({
  open,
  onOpenChange,
  onSelect,
  showDigitalOption = false,
}: MeetingModeDialogProps) => {
  const [hoveredOption, setHoveredOption] = useState<MeetingMode | null>(null);

  const visibleOptions = showDigitalOption ? OPTIONS : OPTIONS.filter(o => o.mode !== 'digital');

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
          {visibleOptions.map((opt) => (
            <button
              key={opt.mode}
              onClick={() => onSelect(opt.mode)}
              onMouseEnter={() => setHoveredOption(opt.mode)}
              onMouseLeave={() => setHoveredOption(null)}
              className={cn(
                "w-full p-4 rounded-xl border-2 text-left transition-all duration-200",
                "flex items-center gap-4 group",
                hoveredOption === opt.mode
                  ? "border-primary bg-primary/5 shadow-md"
                  : "border-border hover:border-primary/50 bg-card"
              )}
            >
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                hoveredOption === opt.mode
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}>
                <opt.icon className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-foreground">{opt.title}</span>
                <p className="text-sm text-muted-foreground mt-0.5">{opt.desc}</p>
                <p className="text-xs text-muted-foreground/70 mt-1 flex items-center gap-1">
                  <opt.hintIcon className="w-3 h-3" />
                  {opt.hint}
                </p>
              </div>
              <ArrowRight className={cn(
                "w-5 h-5 shrink-0 transition-all",
                hoveredOption === opt.mode
                  ? "text-primary translate-x-0.5"
                  : "text-muted-foreground/50"
              )} />
            </button>
          ))}
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
