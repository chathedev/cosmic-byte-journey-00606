import { useState, useEffect } from "react";
import { Pause, Play, Square, Clock, AlertTriangle, CheckCircle2, Loader2, ArrowLeft, RefreshCw, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { DigitalSession, DigitalSessionStatus } from "@/hooks/useDigitalSession";

interface DigitalSessionViewProps {
  session: DigitalSession | null;
  status: DigitalSessionStatus;
  error: string | null;
  errorCode: string | null;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onRetry: () => void;
  onReset: () => void;
  onBack: () => void;
}

const STATUS_CONFIG: Record<DigitalSessionStatus, { label: string; sublabel?: string }> = {
  idle: { label: 'Inaktiv' },
  pending: { label: 'Startar session', sublabel: 'Initierar...' },
  starting: { label: 'Initierar', sublabel: 'Startar browser och ljud...' },
  joining: { label: 'Ansluter till Teams', sublabel: 'Väntar på att bli insläppt...' },
  listening: { label: 'Live', sublabel: 'Transkriberar...' },
  paused: { label: 'Pausad', sublabel: 'Boten är kvar i mötet' },
  stopping: { label: 'Avslutar', sublabel: 'Sparar transkription...' },
  completed: { label: 'Klart', sublabel: 'Transkription sparad' },
  failed: { label: 'Fel uppstod' },
  timed_out: { label: 'Tidsgräns nådd' },
  cancelled: { label: 'Avbruten' },
  interrupted: { label: 'Anslutningen bröts', sublabel: 'Sessionen avbröts oväntat' },
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
  errorCode,
  onPause,
  onResume,
  onStop,
  onRetry,
  onReset,
  onBack,
}: DigitalSessionViewProps) => {
  const navigate = useNavigate();
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [elapsed, setElapsed] = useState('00:00');

  const isTerminal = ['completed', 'failed', 'timed_out', 'cancelled', 'interrupted'].includes(status);
  const isWorking = ['pending', 'starting', 'joining', 'stopping'].includes(status);
  const isStopping = status === 'stopping';
  const isListening = status === 'listening';
  const isPaused = status === 'paused';
  const isInterrupted = status === 'interrupted';

  useEffect(() => {
    if (!session?.startedAt || isTerminal) return;
    setElapsed(formatDuration(session.startedAt));
    const interval = setInterval(() => {
      setElapsed(formatDuration(session.startedAt));
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

  const config = STATUS_CONFIG[status];
  const sessionError = session?.error?.message || error;

  // Progress steps for the working phase
  const workingStep = status === 'pending' ? 0 : status === 'starting' ? 1 : status === 'joining' ? 2 : 3;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border/50">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 -ml-1">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {session?.meetingTitle || 'Digital session'}
          </p>
          {(isListening || isPaused) && (
            <p className="text-xs text-muted-foreground font-mono">{elapsed}</p>
          )}
        </div>
        {isListening && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500/10">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[11px] font-medium text-green-600 dark:text-green-400">LIVE</span>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        
        {/* Working / connecting states */}
        {isWorking && !isStopping && (
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-16 h-16 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-base font-semibold text-foreground">{config.label}</p>
              {config.sublabel && (
                <p className="text-sm text-muted-foreground">{config.sublabel}</p>
              )}
            </div>
            {/* Step dots */}
            <div className="flex items-center gap-2">
              {[0, 1, 2].map(i => (
                <div key={i} className={cn(
                  "w-2 h-2 rounded-full transition-all duration-300",
                  i <= workingStep ? "bg-primary" : "bg-muted-foreground/20"
                )} />
              ))}
            </div>
          </div>
        )}

        {/* Stopping */}
        {isStopping && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
            <p className="text-sm text-muted-foreground">{config.label}...</p>
          </div>
        )}

        {/* Listening */}
        {isListening && (
          <div className="flex flex-col items-center gap-4 w-full">
            <div className="relative w-20 h-20 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-green-500/10 animate-ping" style={{ animationDuration: '2s' }} />
              <div className="absolute inset-2 rounded-full bg-green-500/5" />
              <Radio className="w-8 h-8 text-green-500" />
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="font-mono text-lg text-foreground">{elapsed}</span>
            </div>
          </div>
        )}

        {/* Paused */}
        {isPaused && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-yellow-500/10 border-2 border-yellow-500/20 flex items-center justify-center">
              <Pause className="w-8 h-8 text-yellow-500" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-base font-semibold text-yellow-600 dark:text-yellow-400">{config.label}</p>
              <p className="text-sm text-muted-foreground">{config.sublabel}</p>
            </div>
          </div>
        )}

        {/* Completed */}
        {status === 'completed' && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-base font-semibold text-foreground">{config.label}</p>
              <p className="text-sm text-muted-foreground">{config.sublabel}</p>
            </div>
            {session?.transcriptChunkCount != null && session.transcriptChunkCount > 0 && (
              <p className="text-xs text-muted-foreground">{session.transcriptChunkCount} delar transkriberade</p>
            )}
          </div>
        )}

        {/* Error terminal states */}
        {isTerminal && status !== 'completed' && !isInterrupted && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-base font-semibold text-foreground">{config.label}</p>
              {sessionError && (
                <p className="text-sm text-muted-foreground max-w-xs">{sessionError}</p>
              )}
            </div>
          </div>
        )}

        {/* Interrupted – offer retry */}
        {isInterrupted && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center">
              <RefreshCw className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-base font-semibold text-foreground">{config.label}</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                {sessionError || config.sublabel}
              </p>
            </div>
          </div>
        )}

        {/* Transcript preview */}
        {session?.transcriptPreview && !isTerminal && (
          <div className="w-full max-w-md bg-muted/30 rounded-xl p-4 border border-border/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Transkription</span>
              {session.transcriptChunkCount > 0 && (
                <span className="text-[11px] text-muted-foreground">{session.transcriptChunkCount} delar</span>
              )}
            </div>
            <p className="text-sm text-foreground/80 line-clamp-3 leading-relaxed">
              {session.transcriptPreview}
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-4 space-y-2 border-t border-border/50">
        {isListening && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={onPause} className="flex-1 h-11 gap-2 rounded-xl">
              <Pause className="w-4 h-4" />
              Pausa
            </Button>
            <Button variant="destructive" onClick={() => setShowStopConfirm(true)} className="flex-1 h-11 gap-2 rounded-xl">
              <Square className="w-4 h-4" />
              Avsluta
            </Button>
          </div>
        )}

        {isPaused && (
          <div className="flex gap-2">
            <Button onClick={onResume} className="flex-1 h-11 gap-2 rounded-xl">
              <Play className="w-4 h-4" />
              Återuppta
            </Button>
            <Button variant="destructive" onClick={() => setShowStopConfirm(true)} className="flex-1 h-11 gap-2 rounded-xl">
              <Square className="w-4 h-4" />
              Avsluta
            </Button>
          </div>
        )}

        {status === 'completed' && (
          <div className="space-y-2">
            <Button onClick={handleGoToMeeting} className="w-full h-11 gap-2 rounded-xl">
              <CheckCircle2 className="w-4 h-4" />
              Visa möte & protokoll
            </Button>
            <Button variant="ghost" onClick={() => { onReset(); onBack(); }} className="w-full h-10 text-sm text-muted-foreground">
              Tillbaka
            </Button>
          </div>
        )}

        {isInterrupted && (
          <div className="space-y-2">
            <Button onClick={onRetry} className="w-full h-11 gap-2 rounded-xl">
              <RefreshCw className="w-4 h-4" />
              Försök igen
            </Button>
            <Button variant="ghost" onClick={() => { onReset(); onBack(); }} className="w-full h-10 text-sm text-muted-foreground">
              Tillbaka
            </Button>
          </div>
        )}

        {isTerminal && !['completed', 'interrupted'].includes(status) && (
          <Button variant="ghost" onClick={() => { onReset(); onBack(); }} className="w-full h-10 text-sm text-muted-foreground">
            Tillbaka
          </Button>
        )}

        {isWorking && !isStopping && (
          <Button variant="ghost" onClick={() => setShowStopConfirm(true)} className="w-full h-10 text-sm text-muted-foreground gap-2">
            Avbryt
          </Button>
        )}
      </div>

      {/* Stop confirmation */}
      <AlertDialog open={showStopConfirm} onOpenChange={setShowStopConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Avsluta sessionen?</AlertDialogTitle>
            <AlertDialogDescription>
              Boten lämnar mötet. Eventuell transkription sparas.
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
