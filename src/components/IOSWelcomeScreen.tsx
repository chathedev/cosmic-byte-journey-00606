import { useState } from "react";
import { Mic, Loader2, CheckCircle2 } from "lucide-react";
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
  const [permissionDenied, setPermissionDenied] = useState(false);

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
    setPermissionDenied(false);
    
    try {
      await hapticMedium();
    } catch (e) {
      // Haptics may not be available
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      // Permission granted - clean up and proceed
      stream.getTracks().forEach((track) => track.stop());
      
      try {
        await Haptics.notification({ type: NotificationType.Success });
      } catch {}
      
      // Wait a moment for the success haptic, then proceed
      setTimeout(() => {
        proceedOnce();
      }, 200);
      
    } catch (error: any) {
      console.error("Microphone permission denied:", error);
      
      // Permission denied
      try {
        await Haptics.notification({ type: NotificationType.Error });
      } catch {}
      
      setPermissionDenied(true);
      setRequesting(false);
    }
  };

  return (
    <div 
      className="min-h-screen bg-gradient-to-br from-primary/20 via-background to-accent/20 flex items-center justify-center p-4 sm:p-6 safe-area-inset relative overflow-hidden"
    >
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute -top-1/4 -left-1/4 w-1/2 h-1/2 bg-primary/20 rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1,
          }}
          className="absolute -bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-accent/20 rounded-full blur-3xl"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md relative z-10"
      >
        <div className="rounded-3xl border border-border/50 bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden">
          <div className="p-6 sm:p-8 space-y-6">
            <motion.div 
              initial={{ y: -30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
              className="flex flex-col items-center gap-4"
            >
              <motion.div 
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ 
                  type: "spring",
                  stiffness: 180,
                  damping: 12,
                  delay: 0.2 
                }}
                whileHover={{ scale: 1.05, rotate: 5 }}
                className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 border border-primary/30 flex items-center justify-center shadow-lg"
              >
                <img src={tivlyLogo} alt="Tivly" className="w-10 h-10 object-contain" />
              </motion.div>
              <motion.h1 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight"
              >
                Välkommen till Tivly
              </motion.h1>
              <motion.p 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="text-sm text-muted-foreground text-center max-w-xs leading-relaxed"
              >
                Snabb, enkel och säker mötesinspelning med AI-genererade protokoll
              </motion.p>
            </motion.div>

            <AnimatePresence mode="wait">
              {step === 0 && (
                <motion.div
                  key="step0"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -30, scale: 0.95 }}
                  transition={{ duration: 0.4, delay: 0.5 }}
                  className="space-y-4"
                >
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="space-y-3 p-5 rounded-2xl border border-border/60 bg-muted/30"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
                        <Mic className="w-4 h-4 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">Spela in möten</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Högkvalitativa inspelningar direkt från din enhet
                        </p>
                      </div>
                    </div>
                    <div className="h-px bg-border/50" />
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">AI-protokoll</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Automatiskt genererade och formaterade protokoll
                        </p>
                      </div>
                    </div>
                  </motion.div>
                  
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
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
                      className="w-full rounded-xl h-14 active:scale-95 transition-all duration-200 touch-manipulation text-base font-semibold shadow-lg"
                    >
                      Kom igång
                    </Button>
                  </motion.div>
                </motion.div>
              )}

              {step === 1 && (
                <motion.div 
                  key="step1"
                  initial={{ opacity: 0, x: 30, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 30 }}
                  transition={{ duration: 0.4 }}
                  className="space-y-5"
                >
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1, duration: 0.4 }}
                    className={`p-5 rounded-2xl border backdrop-blur-sm ${
                      permissionDenied 
                        ? 'border-destructive/60 bg-destructive/10' 
                        : 'border-border/60 bg-muted/30'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <motion.div 
                        animate={!permissionDenied ? { 
                          scale: [1, 1.15, 1],
                        } : {}}
                        transition={{ 
                          duration: 2,
                          repeat: Infinity,
                          ease: "easeInOut"
                        }}
                        className={`w-12 h-12 shrink-0 rounded-xl border shadow-lg flex items-center justify-center ${
                          permissionDenied
                            ? 'bg-destructive/20 border-destructive/30'
                            : 'bg-gradient-to-br from-primary/20 to-primary/10 border-primary/30'
                        }`}
                      >
                        <Mic className={`w-6 h-6 ${permissionDenied ? 'text-destructive' : 'text-primary'}`} />
                      </motion.div>
                      <div className="flex-1 text-left space-y-1.5">
                        <p className={`text-base font-semibold ${permissionDenied ? 'text-destructive' : 'text-foreground'}`}>
                          {permissionDenied ? 'Åtkomst nekad' : 'Mikrofonåtkomst'}
                        </p>
                        <p className={`text-sm leading-relaxed ${permissionDenied ? 'text-destructive/90' : 'text-muted-foreground'}`}>
                          {permissionDenied 
                            ? 'Vi behöver tillgång till mikrofonen för att kunna spela in möten. Vänligen aktivera mikrofonåtkomst i webbläsarens inställningar.'
                            : 'Vi behöver tillgång till mikrofonen för att kunna spela in dina möten med högsta kvalitet'
                          }
                        </p>
                      </div>
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
                      variant={permissionDenied ? "destructive" : "default"}
                      className="w-full rounded-xl h-14 active:scale-95 transition-all duration-200 touch-manipulation text-base font-semibold shadow-lg disabled:opacity-50"
                    >
                      {requesting ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Väntar på tillåtelse...
                        </>
                      ) : permissionDenied ? (
                        <>
                          <Mic className="mr-2 h-5 w-5" />
                          Försök igen
                        </>
                      ) : (
                        <>
                          <Mic className="mr-2 h-5 w-5" />
                          Tillåt mikrofon
                        </>
                      )}
                    </Button>
                  </motion.div>
                  
                  {!permissionDenied && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3, duration: 0.3 }}
                      className="space-y-2"
                    >
                      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                        <div className="w-1 h-1 bg-muted-foreground/40 rounded-full" />
                        <span>Säker och privat</span>
                        <div className="w-1 h-1 bg-muted-foreground/40 rounded-full" />
                      </div>
                      <p className="text-xs text-muted-foreground text-center leading-relaxed px-4">
                        Du kan när som helst ändra detta i enhetens inställningar
                      </p>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  );
};