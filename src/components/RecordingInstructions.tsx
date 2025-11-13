import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Volume2, Users, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RecordingInstructionsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RecordingInstructions = ({ isOpen, onClose }: RecordingInstructionsProps) => {
  const [canClose, setCanClose] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(5);

  useEffect(() => {
    if (!isOpen) {
      setCanClose(false);
      setSecondsLeft(5);
      return;
    }

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setCanClose(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  const handleClose = () => {
    if (canClose) {
      localStorage.setItem('hasSeenRecordingInstructions', 'true');
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={handleClose}
          />

          {/* Dialog */}
          <div className="fixed inset-0 flex items-center justify-center z-50 p-6">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', duration: 0.5 }}
              className="w-full max-w-md rounded-3xl border border-border/40 bg-background/95 backdrop-blur-2xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-8 space-y-6">
                {/* Header */}
                <div className="text-center space-y-3">
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', delay: 0.2 }}
                    className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center"
                  >
                    <Mic className="w-8 h-8 text-primary" />
                  </motion.div>
                  <h2 className="text-2xl font-semibold text-foreground">
                    Tips för bästa inspelning
                  </h2>
                </div>

                {/* Instructions */}
                <div className="space-y-3">
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                    className="flex items-start gap-3 p-3 rounded-xl border border-border/50 bg-background/60"
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Mic className="w-5 h-5 text-primary" />
                    </div>
                    <div className="text-left flex-1">
                      <p className="text-sm font-medium text-foreground">Håll telefonen nära</p>
                      <p className="text-xs text-muted-foreground">
                        Placera telefonen 30-50 cm från talarna
                      </p>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 }}
                    className="flex items-start gap-3 p-3 rounded-xl border border-border/50 bg-background/60"
                  >
                    <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <Volume2 className="w-5 h-5 text-accent" />
                    </div>
                    <div className="text-left flex-1">
                      <p className="text-sm font-medium text-foreground">Tyst miljö</p>
                      <p className="text-xs text-muted-foreground">
                        Minimera bakgrundsljud för tydligare transkribering
                      </p>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 }}
                    className="flex items-start gap-3 p-3 rounded-xl border border-border/50 bg-background/60"
                  >
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Users className="w-5 h-5 text-primary" />
                    </div>
                    <div className="text-left flex-1">
                      <p className="text-sm font-medium text-foreground">Prata tydligt</p>
                      <p className="text-xs text-muted-foreground">
                        En person i taget ger bäst resultat
                      </p>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 }}
                    className="flex items-start gap-3 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5"
                  >
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div className="text-left flex-1">
                      <p className="text-sm font-medium text-foreground">Långa möten? Inga problem!</p>
                      <p className="text-xs text-muted-foreground">
                        Appen håller skärmen aktiv och hanterar möten på 2-8+ timmar utan problem
                      </p>
                    </div>
                  </motion.div>

                  {/* Button explanations */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    className="pt-3 mt-1 border-t border-border/30"
                  >
                    <p className="text-xs font-semibold text-foreground mb-2.5">Vad gör knapparna?</p>
                    <div className="space-y-2.5 text-xs">
                      <div className="flex items-start gap-2">
                        <span className="text-red-500 font-bold min-w-[60px] flex-shrink-0">🔴 Avsluta:</span>
                        <span className="text-muted-foreground">Stoppar inspelningen <strong>OCH</strong> skapar automatiskt ett komplett protokoll med AI-analys (sammanfattning, beslut, åtgärder)</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-bold min-w-[60px] flex-shrink-0">💾 Spara:</span>
                        <span className="text-muted-foreground">Sparar <strong>endast</strong> transkriptionen till biblioteket - inget protokoll skapas (använd när du bara vill ha texten)</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-bold min-w-[60px] flex-shrink-0">⏸️ Pausa:</span>
                        <span className="text-muted-foreground">Pausar inspelningen tillfälligt - tryck igen för att fortsätta (smart vid pauser eller när någon pratar utanför mötet)</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-bold min-w-[60px] flex-shrink-0">🔇 Ljud av:</span>
                        <span className="text-muted-foreground">Stänger av ljudfeedback från mikrofonen - inspelningen fortsätter normalt</span>
                      </div>
                    </div>
                  </motion.div>
                </div>

                {/* CTA Button */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                >
                  <Button
                    onClick={handleClose}
                    disabled={!canClose}
                    size="lg"
                    className="w-full h-12 rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {canClose ? (
                      <>
                        <CheckCircle className="w-5 h-5 mr-2" />
                        Jag förstår
                      </>
                    ) : (
                      <>Vänta {secondsLeft}s...</>
                    )}
                  </Button>
                </motion.div>

                {!canClose && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    className="text-xs text-center text-muted-foreground"
                  >
                    Läs igenom tipsen innan du fortsätter
                  </motion.p>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};