import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, ArrowRight, Loader2, Mic, FileText, Shield } from "lucide-react";
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
  const [phase, setPhase] = useState<"splash" | "features" | "name">("splash");
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Auto-advance from splash → features
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setPhase("features"), 2800);
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
    <div className="fixed inset-0 z-[100] overflow-hidden">
      {/* Animated gradient background */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        style={{
          background: "linear-gradient(135deg, hsl(220 25% 6%) 0%, hsl(220 30% 10%) 40%, hsl(211 50% 14%) 100%)",
        }}
      />

      {/* Moving gradient orbs */}
      <motion.div
        className="absolute w-[800px] h-[800px] rounded-full blur-[120px] opacity-20"
        style={{ background: "radial-gradient(circle, hsl(211 100% 50% / 0.4), transparent 70%)" }}
        animate={{
          x: ["-20%", "10%", "-10%"],
          y: ["-10%", "20%", "-5%"],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute right-0 bottom-0 w-[600px] h-[600px] rounded-full blur-[100px] opacity-15"
        style={{ background: "radial-gradient(circle, hsl(208 100% 47% / 0.5), transparent 70%)" }}
        animate={{
          x: ["10%", "-15%", "5%"],
          y: ["10%", "-10%", "15%"],
        }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(hsl(0 0% 100%) 1px, transparent 1px), linear-gradient(90deg, hsl(0 0% 100%) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />

      {/* Scan line effect */}
      <motion.div
        className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent"
        initial={{ top: "0%" }}
        animate={{ top: ["0%", "100%", "0%"] }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
      />

      {/* Content */}
      <div className="relative z-10 flex items-center justify-center min-h-screen px-6">
        <AnimatePresence mode="wait">

          {/* ─── PHASE 1: SPLASH ─── */}
          {phase === "splash" && (
            <motion.div
              key="splash"
              className="flex flex-col items-center"
              exit={{ opacity: 0, scale: 0.95, filter: "blur(12px)" }}
              transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
            >
              {/* Logo mark */}
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className="relative mb-8"
              >
                {/* Outer ring pulse */}
                <motion.div
                  className="absolute inset-0 rounded-3xl border border-primary/20"
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ scale: 1.6, opacity: 0 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                  style={{ width: 88, height: 88, margin: "-8px" }}
                />
                <div className="w-[72px] h-[72px] rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center backdrop-blur-sm">
                  <Building2 className="w-8 h-8 text-primary" />
                </div>
              </motion.div>

              {/* Brand name */}
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className="text-4xl sm:text-5xl font-bold tracking-tight"
                style={{ color: "hsl(0 0% 100%)" }}
              >
                TIVLY
              </motion.h1>

              {/* Tagline */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                transition={{ delay: 0.8, duration: 0.7 }}
                className="text-sm tracking-[0.25em] uppercase mt-3"
                style={{ color: "hsl(0 0% 100%)" }}
              >
                Enterprise
              </motion.p>

              {/* Loading bar */}
              <motion.div
                className="mt-10 w-48 h-[2px] rounded-full overflow-hidden"
                style={{ backgroundColor: "hsl(0 0% 100% / 0.08)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: "linear-gradient(90deg, hsl(211 100% 50%), hsl(208 100% 65%))" }}
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ delay: 1.1, duration: 1.5, ease: [0.4, 0, 0.2, 1] }}
                />
              </motion.div>
            </motion.div>
          )}

          {/* ─── PHASE 2: FEATURES ─── */}
          {phase === "features" && (
            <motion.div
              key="features"
              className="max-w-md w-full"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.5 }}
                className="text-center mb-10"
              >
                <h2
                  className="text-2xl sm:text-3xl font-semibold tracking-tight"
                  style={{ color: "hsl(0 0% 100%)" }}
                >
                  Välkommen till{" "}
                  <span className="bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
                    {companyName}
                  </span>
                </h2>
              </motion.div>

              <div className="space-y-3 mb-10">
                {[
                  { icon: Mic, label: "Spela in möten", desc: "Starta inspelning direkt från din enhet" },
                  { icon: FileText, label: "AI-protokoll", desc: "Protokoll genereras automatiskt med AI" },
                  { icon: Shield, label: "Enterprise-säkerhet", desc: "EU-lagring med enterprise-kryptering" },
                ].map((item, i) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="flex items-center gap-4 p-4 rounded-xl border backdrop-blur-sm"
                    style={{
                      backgroundColor: "hsl(0 0% 100% / 0.03)",
                      borderColor: "hsl(0 0% 100% / 0.06)",
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: "hsl(211 100% 50% / 0.1)" }}
                    >
                      <item.icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: "hsl(0 0% 95%)" }}>
                        {item.label}
                      </p>
                      <p className="text-xs" style={{ color: "hsl(0 0% 100% / 0.4)" }}>
                        {item.desc}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 0.5 }}
                className="flex justify-center"
              >
                <Button
                  onClick={goToName}
                  size="lg"
                  className="gap-2 px-10 rounded-xl h-12 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
                >
                  Fortsätt
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </motion.div>
            </motion.div>
          )}

          {/* ─── PHASE 3: NAME ─── */}
          {phase === "name" && (
            <motion.div
              key="name"
              className="max-w-sm w-full"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.5 }}
                className="text-center mb-8"
              >
                <h2
                  className="text-2xl font-semibold tracking-tight"
                  style={{ color: "hsl(0 0% 100%)" }}
                >
                  Vad heter du?
                </h2>
                <p className="text-sm mt-2" style={{ color: "hsl(0 0% 100% / 0.4)" }}>
                  Används för hälsningar och talaridentifiering.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.5 }}
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
                  className="h-12 text-base rounded-xl text-center border-0 ring-1 ring-inset focus-visible:ring-2 focus-visible:ring-primary/50"
                  style={{
                    backgroundColor: "hsl(0 0% 100% / 0.06)",
                    color: "hsl(0 0% 100%)",
                    // @ts-ignore
                    "--tw-ring-color": "hsl(0 0% 100% / 0.1)",
                  }}
                />

                <Button
                  onClick={handleSave}
                  size="lg"
                  className="w-full gap-2 rounded-xl h-12 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
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
