import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Loader2, Mic, FileText, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useScrollToInputHandler } from "@/hooks/useScrollToInput";

interface EnterpriseWelcomeWizardProps {
  open: boolean;
  companyName: string;
  onComplete: () => void;
}

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
    const t = setTimeout(() => setPhase("guide"), 2200);
    return () => clearTimeout(t);
  }, [open]);

  const goToName = useCallback(() => setPhase("name"), []);

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
      {/* Single subtle glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[400px] rounded-full bg-primary/[0.03] blur-[100px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-sm mx-6">
        <AnimatePresence mode="wait">

          {/* ─── BRAND ─── */}
          {phase === "brand" && (
            <motion.div
              key="brand"
              className="flex flex-col items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              <motion.h1
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground"
              >
                TIVLY
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.6 }}
                className="text-xs tracking-[0.3em] uppercase text-muted-foreground/50 mt-2"
              >
                Enterprise
              </motion.p>
              {/* Minimal progress line */}
              <motion.div
                className="mt-8 w-32 h-px rounded-full bg-border overflow-hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 }}
              >
                <motion.div
                  className="h-full bg-primary/60 rounded-full"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ delay: 1, duration: 1, ease: "easeInOut" }}
                />
              </motion.div>
            </motion.div>
          )}

          {/* ─── GUIDE ─── */}
          {phase === "guide" && (
            <motion.div
              key="guide"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="text-center mb-8">
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
                  Välkommen till {companyName}
                </h2>
              </div>

              <div className="space-y-2.5 mb-8">
                {[
                  { icon: Mic, text: "Spela in möten och få protokoll med AI" },
                  { icon: FileText, text: "Dela protokoll inom organisationen" },
                  { icon: Users, text: "Enterprise-säkerhet med EU-lagring" },
                ].map((item, i) => (
                  <motion.div
                    key={item.text}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + i * 0.1, duration: 0.4 }}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/40"
                  >
                    <item.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm text-foreground">{item.text}</span>
                  </motion.div>
                ))}
              </div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.55 }}
                className="flex justify-center"
              >
                <Button onClick={goToName} size="lg" className="gap-2 rounded-xl px-8">
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
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="text-center mb-8">
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
                  Vad heter du?
                </h2>
                <p className="text-sm text-muted-foreground mt-1.5">
                  Används för hälsningar och talaridentifiering.
                </p>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.4 }}
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
                  className="h-12 text-base rounded-xl text-center bg-muted/40 border-border"
                />
                <Button
                  onClick={handleSave}
                  size="lg"
                  className="w-full gap-2 rounded-xl h-12"
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
