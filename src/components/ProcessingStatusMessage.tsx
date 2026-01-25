import { Mail, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ProcessingStatusMessageProps {
  variant?: 'card' | 'inline';
  className?: string;
}

export const ProcessingStatusMessage = ({ 
  variant = 'card',
  className 
}: ProcessingStatusMessageProps) => {
  if (variant === 'inline') {
    return (
      <div className={cn("flex items-center gap-2 text-muted-foreground", className)}>
        <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        <span className="text-xs">Bearbetar – du får mejl när det är klart</span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex flex-col items-center text-center space-y-6 py-8",
        className
      )}
    >
      {/* Animated icon */}
      <div className="relative">
        <motion.div
          animate={{ 
            scale: [1, 1.1, 1],
            opacity: [0.5, 0.8, 0.5]
          }}
          transition={{ 
            repeat: Infinity, 
            duration: 2.5, 
            ease: "easeInOut" 
          }}
          className="absolute inset-0 bg-primary/20 rounded-full blur-xl"
        />
        <div className="relative w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Mail className="w-7 h-7 text-primary" />
        </div>
      </div>

      {/* Message */}
      <div className="space-y-2 max-w-xs">
        <h3 className="text-lg font-medium text-foreground">
          Transkribering pågår
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Det kan ta några minuter. Du får ett mejl när det är klart – du behöver inte vänta här.
        </p>
      </div>

      {/* Subtle time indicator */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
        <Clock className="w-3.5 h-3.5" />
        <span>Längre inspelningar tar längre tid</span>
      </div>
    </motion.div>
  );
};
