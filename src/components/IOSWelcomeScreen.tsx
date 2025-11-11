import { useState } from "react";
import { Mic, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { motion, AnimatePresence } from "framer-motion";
import tivlyLogo from "@/assets/tivly-logo.png";

interface IOSWelcomeScreenProps {
  onComplete: () => void;
}

export const IOSWelcomeScreen = ({ onComplete }: IOSWelcomeScreenProps) => {
  const [step, setStep] = useState<0 | 1>(0);
  const [requesting, setRequesting] = useState(false);
  const [completed, setCompleted] = useState(false);

  const hapticLight = async () => {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {
      // Haptics not available (web browser)
    }
  };

  const hapticMedium = async () => {
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch (e) {
      // Haptics not available
    }
  };

  const proceedOnce = () => {
    if (completed) return;
    setCompleted(true);
    onComplete();
  };
  const requestMicrophonePermission = async () => {
    setRequesting(true);
    try {
      await hapticMedium();
    } catch (e) {
      // Haptics may not be available
    }

    // Fallback: continue after a short delay to avoid iOS webview stalls
    const fallback = setTimeout(() => {
      proceedOnce();
    }, 400);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      stream.getTracks().forEach((track) => track.stop());
      try {
        await Haptics.notification({ type: NotificationType.Success });
      } catch {}
      clearTimeout(fallback);
      setTimeout(() => {
        proceedOnce();
      }, 120);
    } catch (error) {
      console.error("Microphone permission request issue:", error);
      try {
        await Haptics.notification({ type: NotificationType.Error });
      } catch {}
      clearTimeout(fallback);
      // Proceed anyway; recording screen will re-request with proper prompts
      proceedOnce();
    } finally {
      setRequesting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-gradient-to-br from-primary/30 via-accent/20 to-primary/50 flex items-center justify-center p-6"
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="w-full max-w-sm"
      >
        <div className="rounded-3xl border border-border/40 bg-background/80 backdrop-blur-2xl shadow-2xl overflow-hidden">
          <div className="p-8 space-y-6">
            <motion.div 
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-col items-center gap-4"
            >
              <motion.div 
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ 
                  type: "spring",
                  stiffness: 200,
                  damping: 15,
                  delay: 0.4 
                }}
                className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center"
              >
                <img src={tivlyLogo} alt="Tivly" className="w-9 h-9 object-contain" />
              </motion.div>
              <motion.h1 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.5 }}
                className="text-2xl font-semibold text-foreground tracking-tight"
              >
                Välkommen
              </motion.h1>
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.6 }}
                className="text-sm text-muted-foreground text-center"
              >
                Snabb, enkel och säker mötesinspelning.
              </motion.p>
            </motion.div>

            <AnimatePresence mode="wait">
              {step === 0 && (
                <motion.div
                  key="step0"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <Button 
                    onClick={async () => {
                      try {
                        await hapticLight();
                      } catch (e) {
                        // Haptics not available
                      }
                      setStep(1);
                    }} 
                    size="lg" 
                    className="w-full rounded-xl h-12 active:scale-95 transition-transform touch-manipulation"
                  >
                    Kom igång
                  </Button>
                </motion.div>
              )}

              {step === 1 && (
                <motion.div 
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-4"
                >
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1, duration: 0.3 }}
                    className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-background/60"
                  >
                    <motion.div 
                      animate={{ 
                        scale: [1, 1.1, 1],
                      }}
                      transition={{ 
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                      className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center"
                    >
                      <Mic className="w-5 h-5 text-primary" />
                    </motion.div>
                    <div className="text-left">
                      <p className="text-sm font-medium text-foreground">Mikrofonåtkomst</p>
                      <p className="text-xs text-muted-foreground">Behövs för att spela in möten.</p>
                    </div>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.3 }}
                  >
                    <Button 
                      onClick={requestMicrophonePermission} 
                      size="lg" 
                      disabled={requesting}
                      className="w-full rounded-xl h-12 active:scale-95 transition-transform touch-manipulation"
                    >
                      {requesting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Tillåter...
                        </>
                      ) : (
                        'Tillåt mikrofon'
                      )}
                    </Button>
                  </motion.div>
                  <motion.p 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3, duration: 0.3 }}
                    className="text-xs text-muted-foreground text-center"
                  >
                    Du kan ändra detta senare i inställningar.
                  </motion.p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};