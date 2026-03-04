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
    if (open) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Auto-advance brand → guide
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setPhase("guide"), 2000);
    return () => clearTimeout(t);
  }, [open]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setIsSaving(true);
    try {
      await apiClient.updatePreferredName(trimmed);
      await refreshUser();
      toast({ title: "Välkommen!", description: `Trevligt att träffas, ${trimmed}!` });
      onComplete();
    } catch {
      toast({ title: "Kunde inte spara", description: "Försök igen om en stund", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && name.trim()) handleSave();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background">
      <div className="relative z-10 w-full max-w-sm mx-6">
        <AnimatePresence mode="wait">

          {/* ─── BRAND SPLASH ─── */}
          {phase === "brand" && (
            <motion.div
              key="brand"
              className="flex flex-col items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.3 } }}
              transition={{ duration: 0.6 }}
            >
              <motion.img
                src={tivlyLogo}
                alt="Tivly"
                className="w-14 h-14 rounded-2xl"
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, duration: 0.6, ease }}
              />
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.35 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="text-[11px] tracking-[0.3em] uppercase text-muted-foreground mt-3"
              >
                Enterprise
              </motion.p>
              <motion.div
                className="mt-8 w-24 h-px rounded-full bg-border overflow-hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
              >
                <motion.div
                  className="h-full bg-primary/50 rounded-full"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ delay: 0.8, duration: 1, ease: "easeInOut" }}
                />
              </motion.div>
            </motion.div>
          )}

          {/* ─── GUIDE ─── */}
          {phase === "guide" && (
            <motion.div
              key="guide"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8, transition: { duration: 0.25 } }}
              transition={{ duration: 0.45, ease }}
            >
              <div className="text-center mb-7">
                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  Välkommen till {companyName}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Här är vad du kan göra
                </p>
              </div>

              <div className="space-y-2 mb-7">
                {[
                  { icon: Mic, text: "Spela in möten och få AI-protokoll" },
                  { icon: FileText, text: "Dela och hantera protokoll i teamet" },
                  { icon: Users, text: "Enterprise-säkerhet med EU-lagring" },
                ].map((item, i) => (
                  <motion.div
                    key={item.text}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.12 + i * 0.08, duration: 0.35, ease }}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/50"
                  >
                    <item.icon className="w-4 h-4 text-primary/70 shrink-0" />
                    <span className="text-[13px] text-foreground">{item.text}</span>
                  </motion.div>
                ))}
              </div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                <Button
                  onClick={() => setPhase("name")}
                  size="lg"
                  className="w-full gap-2 rounded-xl h-11"
                >
                  Fortsätt
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </motion.div>
            </motion.div>
          )}

          {/* ─── NAME ─── */}
          {phase === "name" && (
            <motion.div
              key="name"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease }}
            >
              <div className="text-center mb-7">
                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  Vad heter du?
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Används för hälsningar och talaridentifiering
                </p>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.35 }}
                className="space-y-3"
              >
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
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Slutför
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </motion.div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
