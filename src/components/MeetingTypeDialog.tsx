import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Users, Monitor, Mic, Volume2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface MeetingTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectInPerson: () => void;
  onSelectDigital: () => void;
  isDesktop: boolean;
}

export const MeetingTypeDialog = ({
  open,
  onOpenChange,
  onSelectInPerson,
  onSelectDigital,
  isDesktop,
}: MeetingTypeDialogProps) => {
  const [hoveredOption, setHoveredOption] = useState<'inperson' | 'digital' | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden border-border/50" aria-describedby={undefined}>
        <VisuallyHidden>
          <DialogTitle>Välj mötestyp</DialogTitle>
        </VisuallyHidden>
        <div className="p-6 pb-4">
          <h2 className="text-xl font-semibold text-foreground text-center">
            Välj mötestyp
          </h2>
          <p className="text-sm text-muted-foreground text-center mt-1">
            Hur vill du spela in ditt möte?
          </p>
        </div>

        <div className="px-4 pb-6 space-y-3">
          {/* In Person Option */}
          <button
            onClick={onSelectInPerson}
            onMouseEnter={() => setHoveredOption('inperson')}
            onMouseLeave={() => setHoveredOption(null)}
            className={cn(
              "w-full p-4 rounded-xl border-2 text-left transition-all duration-200",
              "flex items-center gap-4 group",
              hoveredOption === 'inperson' 
                ? "border-primary bg-primary/5 shadow-md" 
                : "border-border hover:border-primary/50 bg-card"
            )}
          >
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors",
              hoveredOption === 'inperson' 
                ? "bg-primary text-primary-foreground" 
                : "bg-muted text-muted-foreground"
            )}>
              <Users className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">Fysiskt möte</span>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                Spela in ett möte i samma rum med din mikrofon
              </p>
            </div>
            <ArrowRight className={cn(
              "w-5 h-5 shrink-0 transition-all",
              hoveredOption === 'inperson' 
                ? "text-primary translate-x-0.5" 
                : "text-muted-foreground/50"
            )} />
          </button>

          {/* Digital Option - Desktop Only */}
          {isDesktop && (
            <button
              onClick={onSelectDigital}
              onMouseEnter={() => setHoveredOption('digital')}
              onMouseLeave={() => setHoveredOption(null)}
              className={cn(
                "w-full p-4 rounded-xl border-2 text-left transition-all duration-200",
                "flex items-center gap-4 group",
                hoveredOption === 'digital' 
                  ? "border-primary bg-primary/5 shadow-md" 
                  : "border-border hover:border-primary/50 bg-card"
              )}
            >
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                hoveredOption === 'digital' 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-muted text-muted-foreground"
              )}>
                <Monitor className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">Digitalt möte</span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Spela in Zoom, Teams eller andra onlinemöten
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Systemljud</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Mic className="w-3.5 h-3.5" />
                    <span>Mikrofon</span>
                  </div>
                </div>
              </div>
              <ArrowRight className={cn(
                "w-5 h-5 shrink-0 transition-all",
                hoveredOption === 'digital' 
                  ? "text-primary translate-x-0.5" 
                  : "text-muted-foreground/50"
              )} />
            </button>
          )}
        </div>

        <div className="px-6 py-3 bg-muted/30 border-t border-border/50">
          <p className="text-xs text-muted-foreground text-center">
            {isDesktop 
              ? "Digitalt möte fångar både deltagarnas röster och din egen"
              : "Fysiskt möte spelar in alla i rummet via din mikrofon"
            }
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
