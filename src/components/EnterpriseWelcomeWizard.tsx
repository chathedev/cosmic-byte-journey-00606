import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, ArrowRight, Sparkles, Users, Shield, Loader2 } from "lucide-react";
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

const STEPS = 3;

export function EnterpriseWelcomeWizard({ open, companyName, onComplete }: EnterpriseWelcomeWizardProps) {
  const { refreshUser } = useAuth();
  const { toast } = useToast();
  const { handleFocus: scrollOnFocus } = useScrollToInputHandler();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const handleNext = () => {
    setDirection(1);
    setStep((s) => Math.min(s + 1, STEPS - 1));
  };

  const handleSaveName = async () => {
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
    if (e.key === "Enter" && name.trim()) handleSaveName();
  };

  if (!open) return null;

  const slideVariants = {
    enter: (d: number) => ({ x: d > 0 ? 80 : -80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -80 : 80, opacity: 0 }),
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-xl"
    >
      {/* Subtle background pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-32 w-96 h-96 rounded-full bg-primary/[0.03] blur-3xl" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full bg-primary/[0.03] blur-3xl" />
      </div>

      <div className="relative w-full max-w-lg mx-4">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {Array.from({ length: STEPS }).map((_, i) => (
            <motion.div
              key={i}
              className="h-1.5 rounded-full"
              animate={{
                width: i === step ? 32 : 8,
                backgroundColor: i <= step ? "hsl(var(--primary))" : "hsl(var(--border))",
              }}
              transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            />
          ))}
        </div>

        {/* Card */}
        <motion.div
          layout
          className="bg-card border border-border rounded-2xl shadow-2xl shadow-primary/[0.04] overflow-hidden"
        >
          <AnimatePresence mode="wait" custom={direction}>
            {step === 0 && (
              <motion.div
                key="step-0"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                className="p-8 sm:p-10"
              >
                <div className="text-center space-y-6">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.15, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                    className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center"
                  >
                    <Building2 className="w-8 h-8 text-primary" />
                  </motion.div>

                  <motion.div
                    initial={{ y: 12, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.25, duration: 0.5 }}
                    className="space-y-2"
                  >
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                      Välkommen till Tivly
                    </h1>
                    <p className="text-muted-foreground text-base">
                      <span className="font-semibold text-foreground">{companyName}</span> är redo.
                      <br />
                      Låt oss göra en snabb genomgång.
                    </p>
                  </motion.div>

                  <motion.div
                    initial={{ y: 12, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.4, duration: 0.5 }}
                  >
                    <Button onClick={handleNext} size="lg" className="gap-2 px-8 rounded-xl">
                      Kom igång
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </motion.div>
                </div>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div
                key="step-1"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                className="p-8 sm:p-10"
              >
                <div className="space-y-8">
                  <div className="text-center space-y-2">
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                      Så fungerar det
                    </h2>
                    <p className="text-muted-foreground text-sm">
                      Tre saker du behöver veta
                    </p>
                  </div>

                  <div className="space-y-4">
                    {[
                      {
                        icon: Sparkles,
                        title: "AI-protokoll",
                        desc: "Spela in möten och få protokoll automatiskt med AI.",
                      },
                      {
                        icon: Users,
                        title: "Teamsamarbete",
                        desc: "Bjud in kollegor och dela protokoll inom organisationen.",
                      },
                      {
                        icon: Shield,
                        title: "Enterprise-säkerhet",
                        desc: "All data lagras i EU med enterprise-kryptering.",
                      },
                    ].map((item, i) => (
                      <motion.div
                        key={item.title}
                        initial={{ x: 20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.1 + i * 0.1, duration: 0.4 }}
                        className="flex items-start gap-4 p-4 rounded-xl bg-muted/50 border border-border/50"
                      >
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          <item.icon className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-foreground">{item.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <div className="flex justify-center">
                    <Button onClick={handleNext} size="lg" className="gap-2 px-8 rounded-xl">
                      Fortsätt
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step-2"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                className="p-8 sm:p-10"
              >
                <div className="space-y-6">
                  <div className="text-center space-y-2">
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                      Vad heter du?
                    </h2>
                    <p className="text-muted-foreground text-sm">
                      Ditt namn används för hälsningar och talaridentifiering.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <Input
                      placeholder="T.ex. Anna Johansson"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onFocus={scrollOnFocus}
                      autoFocus
                      disabled={isSaving}
                      className="h-12 text-base rounded-xl bg-muted/50 border-border/50 focus:border-primary/30"
                    />
                  </div>

                  <Button
                    onClick={handleSaveName}
                    size="lg"
                    className="w-full gap-2 rounded-xl"
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
                        <Sparkles className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Subtle footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center text-xs text-muted-foreground/60 mt-6"
        >
          {companyName} • Enterprise
        </motion.p>
      </div>
    </motion.div>
  );
}
