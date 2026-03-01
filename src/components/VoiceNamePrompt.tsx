import { Users, Mic } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface VoiceNamePromptProps {
  /** Show expanded version for the first 30 seconds */
  durationSec?: number;
}

/**
 * Encourages participants to introduce themselves at the start of a meeting.
 * Shows an expanded, prominent version during the first 30 seconds,
 * then collapses to a subtle reminder.
 */
export function VoiceNamePrompt({ durationSec = 0 }: VoiceNamePromptProps) {
  const isEarlyPhase = durationSec < 30;
  const [dismissed, setDismissed] = useState(false);

  // Auto-dismiss after 2 minutes
  useEffect(() => {
    if (durationSec > 120) {
      setDismissed(true);
    }
  }, [durationSec]);

  if (dismissed) return null;

  return (
    <div className="w-full max-w-md mt-2">
      <div
        className={cn(
          "rounded-xl border transition-all duration-500",
          isEarlyPhase
            ? "border-primary/40 bg-primary/5 px-4 py-3"
            : "border-border/50 bg-muted/30 px-3 py-2"
        )}
      >
        <div className="flex items-start gap-3">
          <div className={cn(
            "shrink-0 rounded-lg flex items-center justify-center transition-all",
            isEarlyPhase
              ? "mt-0.5 h-9 w-9 border border-primary/30 bg-primary/10"
              : "mt-0.5 h-7 w-7 border border-border/50 bg-background/60"
          )}>
            {isEarlyPhase ? (
              <Mic className="h-4.5 w-4.5 text-primary" />
            ) : (
              <Users className="h-3.5 w-3.5 text-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            {isEarlyPhase ? (
              <>
                <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                  </span>
                  Presentera er nu!
                </p>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  Låt alla i mötet säga <span className="font-medium text-foreground">"Hej, jag heter …"</span> så kopplar vi röster till rätt person i protokollet.
                </p>
              </>
            ) : (
              <>
                <p className="text-xs font-medium text-foreground">Tips: Säg ert namn</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">"Hej, jag heter …"</span> – hjälper Tivly identifiera talare
                </p>
              </>
            )}
          </div>
          {!isEarlyPhase && (
            <button
              onClick={() => setDismissed(true)}
              className="text-muted-foreground/50 hover:text-muted-foreground text-xs px-1"
              aria-label="Stäng"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
