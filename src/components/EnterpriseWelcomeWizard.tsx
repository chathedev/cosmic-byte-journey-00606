import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Loader2, Mic, FileText, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useScrollToInputHandler } from "@/hooks/useScrollToInput";
import tivlyLogo from "@/assets/tivly-logo.png";

interface EnterpriseWelcomeWizardProps {
  open: boolean;
  companyName: string;
  onComplete: () => void;
}

const ease = [0.16, 1, 0.3, 1] as const;

export function EnterpriseWelcomeWizard({ open, companyName, onComplete }: EnterpriseWelcomeWizardProps) {
  const { refreshUser } = useAuth();
  const { toast } = useToast();
  const { handleFocus: scrollOnFocus } = useScrollToInputHandler();
  const [phase, setPhase] = useState<"brand" | "guide" | "name">("brand");
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPhase("brand");
    setName("");
  }, [open]);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Auto-advance brand → guide
  useEffect(() => {
    if (!open) return;
    if (phase !== "brand") return;

    const t = setTimeout(() => setPhase("guide"), 1600);
    return () => clearTimeout(t);
  }, [open, phase]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setIsSaving(true);
    try {
      await apiClient.updatePreferredName(trimmed);
      await refreshUser();
      toast({
        title: "Välkommen!",
        description: `Trevligt att träffas, ${trimmed}!`,
      });
      onComplete();
    } catch {
      toast({
        title: "Kunde inte spara",
        description: "Försök igen om en stund",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && name.trim()) handleSave();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background pointer-events-auto select-text">
      <div className="relative z-10 w-full max-w-md mx-6 rounded-2xl border border-border bg-card shadow-xl p-6 sm:p-7 pointer-events-auto">
        <AnimatePresence mode="wait" initial={false}>
          {phase === "brand" && (
            <motion.div
              key="brand"
              className="flex flex-col items-center py-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              transition={{ duration: 0.35 }}
            >
              <motion.img
                src={tivlyLogo}
                alt="Tivly"
                className="w-14 h-14 rounded-2xl"
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, ease }}
              />
              <p className="text-xs tracking-[0.26em] uppercase text-muted-foreground mt-3">
                Enterprise
              </p>
            </motion.div>
          )}

          {phase === "guide" && (
            <motion.div
              key="guide"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
              transition={{ duration: 0.3, ease }}
              className="space-y-6"
            >
              <div className="text-center">
                <h2 className="text-xl font-semibold tracking-tight text-foreground">Välkommen till {companyName}</h2>
                <p className="text-sm text-muted-foreground mt-1">Här är vad du kan göra</p>
              </div>

              <div className="space-y-2">
                {[
                  { icon: Mic, text: "Spela in möten och få AI-protokoll" },
                  { icon: FileText, text: "Dela och hantera protokoll i teamet" },
                  { icon: Users, text: "Enterprise-säkerhet med EU-lagring" },
                ].map((item, i) => (
                  <motion.div
                    key={item.text}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.06 + i * 0.05, duration: 0.25 }}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/50"
                  >
                    <item.icon className="w-4 h-4 text-primary/70 shrink-0" />
                    <span className="text-sm text-foreground">{item.text}</span>
                  </motion.div>
                ))}
              </div>

              <Button onClick={() => setPhase("name")} size="lg" className="w-full gap-2 rounded-xl h-11">
                Fortsätt
                <ArrowRight className="w-4 h-4" />
              </Button>
            </motion.div>
          )}

          {phase === "name" && (
            <motion.div
              key="name"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease }}
              className="space-y-6"
            >
              <div className="text-center">
                <h2 className="text-xl font-semibold tracking-tight text-foreground">Vad heter du?</h2>
                <p className="text-sm text-muted-foreground mt-1">Används för hälsningar och talaridentifiering</p>
              </div>

              <div className="space-y-3">
                <Input
                  placeholder="Ditt namn"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={scrollOnFocus}
                  autoFocus
                  disabled={isSaving}
                  className="h-11 text-base rounded-xl text-center bg-muted/40 border-border"
                />

                <Button
                  onClick={handleSave}
                  size="lg"
                  className="w-full gap-2 rounded-xl h-11"
                  disabled={!name.trim() || isSaving}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sparar...
                    </>
                  ) : (
                    <>
                      Slutför
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
