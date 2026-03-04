import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Building2, ArrowRight, Loader2 } from "lucide-react";
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
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background"
    >
      {/* Minimal ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-primary/[0.04] blur-[100px]" />
      </div>

      <div className="relative w-full max-w-sm mx-6">
        {/* Icon */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="flex justify-center mb-8"
        >
          <div className="w-14 h-14 rounded-2xl bg-primary/[0.08] border border-primary/10 flex items-center justify-center">
            <Building2 className="w-7 h-7 text-primary" />
          </div>
        </motion.div>

        {/* Text */}
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="text-center mb-8"
        >
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Välkommen till {companyName}
          </h1>
          <p className="text-muted-foreground text-sm mt-2">
            Ange ditt namn för att komma igång.
          </p>
        </motion.div>

        {/* Input + Button */}
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.5 }}
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
            className="h-12 text-base rounded-xl bg-card border-border focus:border-primary/40 text-center placeholder:text-muted-foreground/50"
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
                Fortsätt
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </motion.div>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="text-center text-[11px] text-muted-foreground/40 mt-10 tracking-wide uppercase"
        >
          Enterprise
        </motion.p>
      </div>
    </motion.div>
  );
}
