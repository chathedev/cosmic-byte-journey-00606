import { Users } from "lucide-react";

/**
 * Visas under inspelning för att förbättra röstigenkänning / namnsättning.
 * Håll den kompakt och helt på svenska.
 */
export function VoiceNamePrompt() {
  return (
    <div className="w-full max-w-md mt-3">
      <div className="rounded-xl border border-border/50 bg-muted/30 px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-8 w-8 shrink-0 rounded-lg border border-border/50 bg-background/60 flex items-center justify-center">
            <Users className="h-4 w-4 text-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Tips för bättre namn på talare</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Låt varje person säga <span className="font-medium text-foreground">”Hej, jag heter …”</span> i början.
              Det hjälper Tivly att koppla röster till rätt person.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
