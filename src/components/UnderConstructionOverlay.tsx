import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/lib/api";
import { Construction, Lock, Wrench, HardHat } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export const UnderConstructionOverlay = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user?.email) {
        setIsAdmin(false);
        setIsChecking(false);
        return;
      }

      try {
        const roleData = await apiClient.getUserRole(user.email.toLowerCase());
        const hasAdminRole = roleData && (roleData.role === 'admin' || roleData.role === 'owner');
        setIsAdmin(hasAdminRole);
      } catch {
        setIsAdmin(false);
      } finally {
        setIsChecking(false);
      }
    };

    if (!authLoading) {
      checkAdminStatus();
    }
  }, [user, authLoading]);

  // Still loading - show nothing
  if (authLoading || isChecking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Admin - show app normally
  if (isAdmin) {
    return <>{children}</>;
  }

  // Non-admin - show blocking overlay
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-[99999] flex items-center justify-center overflow-hidden"
        style={{ background: 'linear-gradient(135deg, hsl(222 47% 8%) 0%, hsl(222 47% 14%) 50%, hsl(222 47% 8%) 100%)' }}
      >
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-primary/20 rounded-full"
              initial={{ 
                x: Math.random() * window.innerWidth, 
                y: Math.random() * window.innerHeight,
                scale: Math.random() * 2 + 0.5
              }}
              animate={{ 
                y: [null, Math.random() * -200 - 100],
                opacity: [0.3, 0]
              }}
              transition={{ 
                duration: Math.random() * 3 + 2, 
                repeat: Infinity, 
                ease: "linear",
                delay: Math.random() * 2
              }}
            />
          ))}
        </div>

        {/* Rotating gears background */}
        <motion.div 
          className="absolute top-20 left-20 text-primary/5"
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        >
          <Wrench className="w-32 h-32" />
        </motion.div>
        <motion.div 
          className="absolute bottom-20 right-20 text-primary/5"
          animate={{ rotate: -360 }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        >
          <Construction className="w-40 h-40" />
        </motion.div>

        {/* Main content */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 100 }}
          className="relative z-10 text-center px-6 max-w-lg"
        >
          {/* Icon container */}
          <motion.div 
            className="relative mx-auto mb-8 w-32 h-32"
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl" />
            <div className="relative w-full h-full bg-gradient-to-br from-primary/30 to-primary/10 rounded-full flex items-center justify-center border border-primary/30 backdrop-blur-sm">
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >
                <HardHat className="w-16 h-16 text-primary" />
              </motion.div>
            </div>
            
            {/* Orbiting lock */}
            <motion.div
              className="absolute -right-2 -bottom-2"
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              style={{ transformOrigin: "50px 50px" }}
            >
              <div className="bg-destructive/90 p-2 rounded-full shadow-lg">
                <Lock className="w-5 h-5 text-destructive-foreground" />
              </div>
            </motion.div>
          </motion.div>

          {/* Text content */}
          <motion.h1
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-3xl sm:text-4xl font-bold text-foreground mb-4"
          >
            Under Construction
          </motion.h1>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="space-y-3"
          >
            <p className="text-lg text-muted-foreground">
              Vi arbetar på något fantastiskt!
            </p>
            <p className="text-sm text-muted-foreground/70">
              Tivly genomgår för närvarande underhåll och uppgraderingar. 
              Vi är snart tillbaka med en ännu bättre upplevelse.
            </p>
          </motion.div>

          {/* Progress bar animation */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="mt-8"
          >
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-primary via-primary/80 to-primary rounded-full"
                initial={{ x: "-100%" }}
                animate={{ x: "100%" }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                style={{ width: "50%" }}
              />
            </div>
            <p className="text-xs text-muted-foreground/50 mt-2">
              Arbete pågår...
            </p>
          </motion.div>

          {/* Contact info */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
            className="mt-8 text-xs text-muted-foreground/50"
          >
            Frågor? Kontakta oss på{" "}
            <a href="mailto:support@tivly.se" className="text-primary/70 hover:text-primary transition-colors">
              support@tivly.se
            </a>
          </motion.p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
