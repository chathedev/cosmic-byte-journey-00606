import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Users, Phone, ArrowRight, Mic, Monitor, Lock, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { debugLog } from "@/lib/debugLogger";
import teamsLogo from "@/assets/teams-logo.png";
import zoomLogo from "@/assets/zoom-logo.png";
import googleMeetLogo from "@/assets/google-meet-logo.png";

export type MeetingMode = 'in-person' | 'phone-call' | 'digital';
export type DigitalProvider = 'teams' | 'zoom' | 'google_meet';

interface MeetingModeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (mode: MeetingMode, provider?: DigitalProvider) => void;
  showDigitalOption?: boolean;
  digitalLocked?: boolean;
  digitalComingSoon?: boolean;
  showStartConfirmation?: boolean;
  teamsLocked?: boolean;
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
    title: 'Importera digitalt möte',
    desc: 'Importera transkript från Teams, Zoom eller Google Meet',
    hint: 'Kräver transkribering aktiverad',
    hintIcon: Monitor,
  },
];

const DIGITAL_PROVIDERS: { id: DigitalProvider; logo: string; title: string; desc: string }[] = [
  {
    id: 'teams',
    logo: teamsLogo,
    title: 'Microsoft Teams',
    desc: 'Importera från Microsoft 365 / Teams',
  },
  {
    id: 'zoom',
    logo: zoomLogo,
    title: 'Zoom',
    desc: 'Importera från Zoom Cloud Recordings',
  },
  {
    id: 'google_meet',
    logo: googleMeetLogo,
    title: 'Google Meet',
    desc: 'Importera från Google Meet-transkript',
  },
];

export const MeetingModeDialog = ({
  open,
  onOpenChange,
  onSelect,
  showDigitalOption = false,
  digitalLocked = false,
  digitalComingSoon = false,
  showStartConfirmation = false,
}: MeetingModeDialogProps) => {
  const [hoveredOption, setHoveredOption] = useState<MeetingMode | null>(null);
  const [hoveredProvider, setHoveredProvider] = useState<DigitalProvider | null>(null);
  const [pendingMode, setPendingMode] = useState<MeetingMode | null>(null);
  const [showProviderPicker, setShowProviderPicker] = useState(false);

  const visibleOptions = showDigitalOption ? OPTIONS : OPTIONS.filter(o => o.mode !== 'digital');

  useEffect(() => {
    debugLog('[📋 ModeDialog] open changed:', open);
    if (!open) {
      setPendingMode(null);
      setShowProviderPicker(false);
    }
  }, [open]);

  const selectedOption = pendingMode ? OPTIONS.find((o) => o.mode === pendingMode) : null;

  const handleOptionSelect = (mode: MeetingMode) => {
    debugLog('[📋 ModeDialog] option tapped:', mode);

    if (mode === 'digital') {
      setShowProviderPicker(true);
      return;
    }

    if (showStartConfirmation) {
      setPendingMode(mode);
      return;
    }
    onSelect(mode);
  };

  const handleProviderSelect = (provider: DigitalProvider) => {
    debugLog('[📋 ModeDialog] provider selected:', provider);
    onSelect('digital', provider);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden border-border/50 max-h-[min(88vh,600px)] flex flex-col" aria-describedby={undefined}>
        <VisuallyHidden>
          <DialogTitle>Välj inspelningsläge</DialogTitle>
        </VisuallyHidden>

        {/* Provider picker sub-view */}
        {showProviderPicker ? (
          <>
            <div className="p-5 sm:p-6 pb-3 sm:pb-4 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowProviderPicker(false)}
                  className="p-1.5 -ml-1.5 rounded-lg hover:bg-muted transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h2 className="text-lg sm:text-xl font-semibold text-foreground">
                  Välj plattform
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1 ml-7">
                Varifrån vill du importera transkript?
              </p>
            </div>

            <div className="px-3 sm:px-4 pb-4 sm:pb-6 space-y-2 sm:space-y-3">
              {DIGITAL_PROVIDERS.map((prov) => (
                <button
                  key={prov.id}
                  onClick={() => handleProviderSelect(prov.id)}
                  onMouseEnter={() => setHoveredProvider(prov.id)}
                  onMouseLeave={() => setHoveredProvider(null)}
                  className={cn(
                    "w-full p-3 sm:p-4 rounded-xl border-2 text-left transition-all duration-200",
                    "flex items-center gap-3 sm:gap-4 group",
                    hoveredProvider === prov.id
                      ? "border-primary bg-primary/5 shadow-md"
                      : "border-border hover:border-primary/50 bg-card"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors overflow-hidden",
                    hoveredProvider === prov.id
                      ? "bg-primary/10"
                      : "bg-muted"
                  )}>
                    <img src={prov.logo} alt={prov.title} className={`object-contain ${prov.id === 'zoom' ? 'w-9 h-9 sm:w-10 sm:h-10' : 'w-7 h-7 sm:w-8 sm:h-8'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-sm sm:text-base text-foreground">{prov.title}</span>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{prov.desc}</p>
                  </div>
                  <ArrowRight className={cn(
                    "w-4 h-4 sm:w-5 sm:h-5 shrink-0 transition-all",
                    hoveredProvider === prov.id
                      ? "text-primary translate-x-0.5"
                      : "text-muted-foreground/50"
                  )} />
                </button>
              ))}
            </div>
          </>
        ) : showStartConfirmation && pendingMode && selectedOption ? (
          <>
            <div className="p-5 sm:p-6 pb-3 text-center space-y-1 shrink-0">
              <h2 className="text-lg sm:text-xl font-semibold text-foreground">Starta möte</h2>
              <p className="text-sm text-muted-foreground">
                Du har valt <span className="font-medium text-foreground">{selectedOption.title}</span>.
              </p>
            </div>

            <div className="px-4 pb-4 sm:pb-5 shrink-0">
              <div className="rounded-xl border border-border bg-card p-3 sm:p-4 flex items-center gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <selectedOption.icon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{selectedOption.title}</p>
                  <p className="text-xs text-muted-foreground">{selectedOption.desc}</p>
                </div>
              </div>
            </div>

            <div className="px-4 pb-5 sm:pb-6 grid grid-cols-2 gap-2 shrink-0">
              <button
                onClick={() => { debugLog('[📋 ModeDialog] Tillbaka clicked'); setPendingMode(null); }}
                className="h-10 sm:h-11 rounded-xl border border-input bg-background text-foreground text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                Tillbaka
              </button>
              <button
                onClick={() => {
                  if (!pendingMode) return;
                  debugLog('[📋 ModeDialog] Starta möte clicked, confirming mode:', pendingMode);
                  onSelect(pendingMode);
                }}
                className="h-10 sm:h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Starta möte
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="p-5 sm:p-6 pb-3 sm:pb-4 shrink-0">
              <h2 className="text-lg sm:text-xl font-semibold text-foreground text-center">
                Hur ser mötet ut?
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground text-center mt-1">
                Vi anpassar inspelningen efter din situation
              </p>
            </div>

            <div className="px-3 sm:px-4 pb-4 sm:pb-6 space-y-2 sm:space-y-3 overflow-y-auto min-h-0 flex-1">
              {visibleOptions.map((opt) => {
                const isDigitalLocked = opt.mode === 'digital' && digitalLocked;
                const isDigitalComingSoon = opt.mode === 'digital' && digitalComingSoon && !isDigitalLocked;
                const isDisabled = isDigitalLocked || isDigitalComingSoon;

                return (
                  <button
                    key={opt.mode}
                    onClick={() => !isDisabled && handleOptionSelect(opt.mode)}
                    onMouseEnter={() => setHoveredOption(opt.mode)}
                    onMouseLeave={() => setHoveredOption(null)}
                    disabled={isDisabled}
                    className={cn(
                      "w-full p-3 sm:p-4 rounded-xl border-2 text-left transition-all duration-200",
                      "flex items-center gap-3 sm:gap-4 group",
                      isDisabled
                        ? "border-border/50 bg-muted/30 opacity-60 cursor-not-allowed"
                        : hoveredOption === opt.mode
                          ? "border-primary bg-primary/5 shadow-md"
                          : "border-border hover:border-primary/50 bg-card"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors relative",
                      isDisabled
                        ? "bg-muted text-muted-foreground"
                        : hoveredOption === opt.mode
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                    )}>
                      <opt.icon className="w-5 h-5 sm:w-6 sm:h-6" />
                      {isDisabled && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive flex items-center justify-center">
                          <Lock className="w-3 h-3 text-destructive-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-sm sm:text-base text-foreground">{opt.title}</span>
                    {isDigitalLocked ? (
                        <div className="mt-0.5">
                          <p className="text-xs sm:text-sm text-destructive font-medium">Upptagen just nu</p>
                        </div>
                      ) : isDigitalComingSoon ? (
                        <div className="mt-0.5">
                          <p className="text-xs sm:text-sm text-amber-500 font-medium">Kommer snart</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Vi jobbar på den här funktionen</p>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{opt.desc}</p>
                          <p className="text-xs text-muted-foreground/70 mt-0.5 sm:mt-1 flex items-center gap-1">
                            <opt.hintIcon className="w-3 h-3 shrink-0" />
                            <span className="line-clamp-1">{opt.hint}</span>
                          </p>
                        </>
                      )}
                    </div>
                    {!isDisabled && (
                      <ArrowRight className={cn(
                        "w-4 h-4 sm:w-5 sm:h-5 shrink-0 transition-all",
                        hoveredOption === opt.mode
                          ? "text-primary translate-x-0.5"
                          : "text-muted-foreground/50"
                      )} />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="px-4 sm:px-6 py-2.5 sm:py-3 bg-muted/30 border-t border-border/50 shrink-0">
              <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5">
                <Mic className="w-3.5 h-3.5 text-primary shrink-0" />
                Tips: Ange deltagarnas namn för bättre transkribering
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
