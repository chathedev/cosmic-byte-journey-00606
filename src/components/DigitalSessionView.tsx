import { useState, useEffect } from "react";
import { Monitor, Pause, Play, Square, Clock, Wifi, WifiOff, AlertTriangle, CheckCircle2, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { DigitalSession, DigitalSessionStatus } from "@/hooks/useDigitalSession";

interface DigitalSessionViewProps {
  session: DigitalSession | null;
  status: DigitalSessionStatus;
  error: string | null;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onReset: () => void;
  onBack: () => void;
}

const STATUS_LABELS: Record<DigitalSessionStatus, string> = {
  idle: 'Inaktiv',
  pending: 'Väntar...',
  starting: 'Startar bot...',
  joining: 'Går med i mötet...',
  listening: 'Lyssnar & transkriberar',
  paused: 'Pausad',
  stopping: 'Avslutar...',
  completed: 'Klart!',
  failed: 'Fel uppstod',
  timed_out: 'Tidsgräns nådd',
  cancelled: 'Avbruten',
  interrupted: 'Avbruten',
};

const STATUS_COLORS: Record<DigitalSessionStatus, string> = {
  idle: 'text-muted-foreground',
  pending: 'text-primary',
  starting: 'text-primary',
  joining: 'text-primary',
  listening: 'text-green-500',
  paused: 'text-yellow-500',
  stopping: 'text-muted-foreground',
  completed: 'text-green-500',
  failed: 'text-destructive',
  timed_out: 'text-yellow-500',
  cancelled: 'text-muted-foreground',
  interrupted: 'text-destructive',
};

const formatDuration = (startedAt: string | null): string => {
  if (!startedAt) return '00:00';
  const seconds = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export const DigitalSessionView = ({
  session,
  status,
  error,
  onPause,
  onResume,
  onStop,
  onReset,
  onBack,
}: DigitalSessionViewProps) => {
  const navigate = useNavigate();
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [elapsed, setElapsed] = useState('00:00');

  const isTerminal = ['completed', 'failed', 'timed_out', 'cancelled', 'interrupted'].includes(status);
  const isWorking = ['pending', 'starting', 'joining', 'stopping'].includes(status);
  const isListening = status === 'listening';
  const isPaused = status === 'paused';

  // Update elapsed timer
  useEffect(() => {
    const interval = setInterval(() => {
      if (session?.startedAt && !isTerminal) {
        setElapsed(formatDuration(session.startedAt));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [session?.startedAt, isTerminal]);

  const handleStopConfirm = () => {
    setShowStopConfirm(false);
    onStop();
  };

  const handleGoToMeeting = () => {
    if (session?.meetingId) {
      navigate(`/meetings/${session.meetingId}`);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="text-center flex-1">
          <p className="text-sm font-medium text-foreground truncate max-w-[200px] mx-auto">
            {session?.meetingTitle || 'Digital session'}
          </p>
        </div>
        <div className="w-10" /> {/* spacer */}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-8">
        {/* Status orb */}
        <div className="relative">
          <div className={cn(
            "w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500",
            isListening && "bg-green-500/10 ring-2 ring-green-500/30",
            isPaused && "bg-yellow-500/10 ring-2 ring-yellow-500/30",
            isWorking && "bg-primary/10 ring-2 ring-primary/30",
            isTerminal && status === 'completed' && "bg-green-500/10 ring-2 ring-green-500/30",
            isTerminal && status !== 'completed' && "bg-destructive/10 ring-2 ring-destructive/30",
          )}>
            {isListening && (
              <div className="absolute inset-0 rounded-full bg-green-500/5 animate-ping" />
            )}
            {isWorking ? (
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
            ) : isListening ? (
              <Wifi className="w-12 h-12 text-green-500" />
            ) : isPaused ? (
              <Pause className="w-12 h-12 text-yellow-500" />
            ) : status === 'completed' ? (
              <CheckCircle2 className="w-12 h-12 text-green-500" />
            ) : isTerminal ? (
              <AlertTriangle className="w-12 h-12 text-destructive" />
            ) : (
              <Monitor className="w-12 h-12 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Status text */}
        <div className="text-center space-y-2">
          <h2 className={cn("text-2xl font-bold", STATUS_COLORS[status])}>
            {STATUS_LABELS[status]}
          </h2>
          {(isListening || isPaused) && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span className="font-mono text-lg">{elapsed}</span>
            </div>
          )}
        </div>

        {/* Transcript preview */}
        {session?.transcriptPreview && (
          <div className="w-full max-w-md bg-muted/50 rounded-xl p-4 border border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">Transkription</span>
              {session.transcriptChunkCount > 0 && (
                <span className="text-xs text-muted-foreground">{session.transcriptChunkCount} delar</span>
              )}
            </div>
            <p className="text-sm text-foreground line-clamp-4 break-words">
              {session.transcriptPreview}
            </p>
          </div>
        )}

        {/* Error display */}
        {(error || session?.error) && (
          <div className="w-full max-w-md p-4 rounded-xl bg-destructive/10 border border-destructive/20">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">
                {session?.error?.message || error}
              </p>
            </div>
          </div>
        )}

        {/* Progress bar for starting phases */}
        {isWorking && (
          <div className="w-full max-w-xs">
            <Progress value={status === 'pending' ? 15 : status === 'starting' ? 40 : status === 'joining' ? 70 : 90} className="h-2" />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-6 space-y-3 border-t border-border">
        {isListening && (
          <div className="flex gap-3">
            <Button variant="outline" onClick={onPause} className="flex-1 h-12 gap-2">
              <Pause className="w-5 h-5" />
              Pausa
            </Button>
            <Button variant="destructive" onClick={() => setShowStopConfirm(true)} className="flex-1 h-12 gap-2">
              <Square className="w-5 h-5" />
              Avsluta
            </Button>
          </div>
        )}

        {isPaused && (
          <div className="flex gap-3">
            <Button onClick={onResume} className="flex-1 h-12 gap-2">
              <Play className="w-5 h-5" />
              Återuppta
            </Button>
            <Button variant="destructive" onClick={() => setShowStopConfirm(true)} className="flex-1 h-12 gap-2">
              <Square className="w-5 h-5" />
              Avsluta
            </Button>
          </div>
        )}

        {status === 'completed' && (
          <div className="space-y-3">
            <Button onClick={handleGoToMeeting} className="w-full h-12 gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Visa möte & protokoll
            </Button>
            <Button variant="outline" onClick={() => { onReset(); onBack(); }} className="w-full h-12">
              Tillbaka
            </Button>
          </div>
        )}

        {isTerminal && status !== 'completed' && (
          <Button variant="outline" onClick={() => { onReset(); onBack(); }} className="w-full h-12">
            Tillbaka
          </Button>
        )}

        {isWorking && (
          <Button variant="outline" onClick={() => setShowStopConfirm(true)} className="w-full h-12 gap-2">
            <Square className="w-5 h-5" />
            Avbryt
          </Button>
        )}
      </div>

      {/* Stop confirmation */}
      <AlertDialog open={showStopConfirm} onOpenChange={setShowStopConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Avsluta digital session?</AlertDialogTitle>
            <AlertDialogDescription>
              Boten lämnar mötet. Transkriptionen sparas om något har hunnit transkriberas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleStopConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Avsluta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
