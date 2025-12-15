import { useSupport } from "@/contexts/SupportContext";
import { Eye, Clock, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export const SupportBanner = () => {
  const { isSupportMode, supportSession, exitSupportMode, timeRemaining } = useSupport();
  const { toast } = useToast();

  if (!isSupportMode) return null;

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleExit = () => {
    exitSupportMode();
    toast({
      title: "Supportläge avslutat",
      description: "Du har återvänt till normal vy.",
    });
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-center gap-4 shadow-lg">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4" />
        <span className="font-medium text-sm">
          Supportvy – tillfällig åtkomst
        </span>
        {supportSession?.userEmail && (
          <span className="text-sm opacity-80">
            ({supportSession.userEmail})
          </span>
        )}
      </div>
      
      {timeRemaining !== null && (
        <div className="flex items-center gap-1 bg-amber-600/30 rounded px-2 py-0.5">
          <Clock className="h-3 w-3" />
          <span className="text-sm font-mono">{formatTime(timeRemaining)}</span>
        </div>
      )}
      
      <Button
        variant="ghost"
        size="sm"
        onClick={handleExit}
        className="bg-amber-600/30 hover:bg-amber-600/50 text-amber-950 h-7 px-2"
      >
        <LogOut className="h-3 w-3 mr-1" />
        Avsluta
      </Button>
    </div>
  );
};
