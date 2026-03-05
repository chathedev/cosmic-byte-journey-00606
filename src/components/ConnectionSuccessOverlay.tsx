import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConnectionSuccessOverlayProps {
  show: boolean;
  onClose: () => void;
  serviceName: string;
  description?: string;
  logo?: string;
}

export const ConnectionSuccessOverlay = ({
  show,
  onClose,
  serviceName,
  description,
  logo,
}: ConnectionSuccessOverlayProps) => {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (show) {
      // Small delay for mount animation
      requestAnimationFrame(() => setVisible(true));
      const timer = setTimeout(() => handleClose(), 4000);
      return () => clearTimeout(timer);
    }
  }, [show]);

  const handleClose = () => {
    setLeaving(true);
    setTimeout(() => {
      setVisible(false);
      setLeaving(false);
      onClose();
    }, 300);
  };

  if (!show) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-300",
        visible && !leaving ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div className={cn(
        "absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity duration-300",
        visible && !leaving ? "opacity-100" : "opacity-0"
      )} />

      {/* Card */}
      <div
        className={cn(
          "relative w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl p-8 flex flex-col items-center gap-5 text-center transition-all duration-300",
          visible && !leaving ? "scale-100 translate-y-0" : "scale-95 translate-y-4"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-muted transition-colors text-muted-foreground"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Success icon with logo */}
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-green-500/10 border-2 border-green-500/20 flex items-center justify-center">
            {logo ? (
              <img src={logo} alt={serviceName} className="w-10 h-10 object-contain" />
            ) : (
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            )}
          </div>
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
            <CheckCircle2 className="w-4 h-4 text-white" />
          </div>
        </div>

        {/* Text */}
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold text-foreground">
            {serviceName} anslutet
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {description || `Ditt ${serviceName}-konto har kopplats till Tivly.`}
          </p>
        </div>

        {/* Progress bar auto-close indicator */}
        <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full"
            style={{
              animation: visible && !leaving ? "shrink-bar 4s linear forwards" : "none",
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes shrink-bar {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
};
