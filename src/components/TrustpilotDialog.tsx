import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TrustpilotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const TrustpilotDialog = ({ open, onOpenChange }: TrustpilotDialogProps) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Reload Trustpilot widget when dialog opens
      if (window.Trustpilot) {
        window.Trustpilot.loadFromElement(document.getElementById('trustpilot-widget'), true);
      }
    }
  }, [open]);

  const handleClose = () => {
    onOpenChange(false);
    // Mark as seen in localStorage
    localStorage.setItem('trustpilot-review-shown', 'true');
  };

  const handleMaybeLater = () => {
    handleClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={handleClose}
          />

          {/* Dialog */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full p-6 relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Header */}
              <div className="mb-6 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring" }}
                  className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4"
                >
                  <Star className="w-8 h-8 text-primary fill-primary" />
                </motion.div>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  Gillar du Tivly?
                </h2>
                <p className="text-muted-foreground text-sm">
                  Ditt första möte är klart! Hjälp oss genom att dela din upplevelse på Trustpilot.
                </p>
              </div>

              {/* Trustpilot Widget */}
              <div className="mb-6">
                <div
                  id="trustpilot-widget"
                  className="trustpilot-widget"
                  data-locale="sv-SE"
                  data-template-id="56278e9abfbbba0bdcd568bc"
                  data-businessunit-id="690ce3a1fb3fc94434b55778"
                  data-style-height="52px"
                  data-style-width="100%"
                  data-token="f2100f7e-8564-4cce-bce0-f303fd0ad8a2"
                >
                  <a
                    href="https://se.trustpilot.com/review/tivly.se"
                    target="_blank"
                    rel="noopener"
                    className="text-primary hover:underline"
                  >
                    Lämna recension på Trustpilot
                  </a>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleMaybeLater}
                >
                  Kanske senare
                </Button>
                <Button
                  className="flex-1 bg-primary hover:bg-primary/90"
                  onClick={handleClose}
                >
                  Tack för förfrågan!
                </Button>
              </div>

              {/* Small note */}
              <p className="text-xs text-muted-foreground text-center mt-4">
                Vi uppskattar verkligen din feedback ⭐
              </p>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

// Extend Window interface for TypeScript
declare global {
  interface Window {
    Trustpilot?: any;
  }
}
