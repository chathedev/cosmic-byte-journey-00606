import { useEffect, useState, useCallback } from "react";
import { Check, X } from "lucide-react";
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
  const [phase, setPhase] = useState<"hidden" | "entering" | "visible" | "leaving">("hidden");

  useEffect(() => {
    if (show && phase === "hidden") {
      setPhase("entering");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setPhase("visible"));
      });
    }
  }, [show, phase]);

  const handleClose = useCallback(() => {
    if (phase === "leaving") return;
    setPhase("leaving");
    setTimeout(() => {
      setPhase("hidden");
      onClose();
    }, 250);
  }, [phase, onClose]);

  if (phase === "hidden" && !show) return null;

  const isActive = phase === "visible";

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-end justify-center sm:items-center p-4 transition-opacity duration-250",
        isActive ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/60 backdrop-blur-[6px]" />

      {/* Card */}
      <div
        className={cn(
          "relative w-full max-w-[320px] rounded-2xl border border-border/60 bg-card/95 backdrop-blur-xl shadow-xl transition-all duration-250 ease-out",
          isActive ? "scale-100 translate-y-0 opacity-100" : "scale-[0.97] translate-y-3 opacity-0"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 flex flex-col items-center gap-4 text-center">
          {/* Logo + check badge */}
          <div className="relative">
            {logo ? (
              <div className="w-14 h-14 rounded-2xl bg-muted/60 border border-border/40 flex items-center justify-center p-2">
                <img src={logo} alt={serviceName} className="w-full h-full object-contain" />
              </div>
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-muted/60 border border-border/40 flex items-center justify-center">
                <Check className="w-7 h-7 text-foreground" />
              </div>
            )}
            <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center ring-2 ring-card">
              <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
            </div>
          </div>

          {/* Text */}
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">
              {serviceName} anslutet
            </h2>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              {description || `Ditt ${serviceName}-konto har kopplats till Tivly.`}
            </p>
          </div>

          {/* Dismiss button */}
          <button
            onClick={handleClose}
            className="w-full mt-1 py-2.5 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 active:scale-[0.98] transition-all"
          >
            Stäng
          </button>
        </div>
      </div>
    </div>
  );
};
