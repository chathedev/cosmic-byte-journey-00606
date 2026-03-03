import { useState, useEffect, useRef } from "react";
import { Pause, Play, Square, Clock, AlertTriangle, CheckCircle2, Loader2, ArrowLeft, RefreshCw, Radio, ShieldAlert, Timer, Mic, MicOff, UserCheck, Info, Volume2, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
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

const ERROR_CODE_LABELS: Record<string, string> = {
  teams_bot_credentials_missing: 'Saknade inloggningsuppgifter',
  teams_join_button_not_found: 'Kunde inte hitta "Gå med"-knappen',
  teams_call_ui_not_detected: 'Teams svarade inte i tid',
  teams_prejoin_timeout: 'Fastnade på föranslutningsskärmen',
  teams_lobby_timeout: 'Ingen släppte in boten i lobbyn',
  teams_join_denied: 'Åtkomst nekad av mötesvärden',
  digital_bot_removed: 'Boten togs bort från mötet',
  teams_reconnect_exhausted: 'Alla återanslutningsförsök misslyckades',
  digital_session_already_active: 'En annan session är redan aktiv',
  digital_audio_silent: 'Inget användbart mötesljud fångades',
};

const PROCESSING_STAGE_LABELS: Record<string, string> = {
  finalizing_recording: 'Förbereder inspelningen...',
  stopping_capture: 'Stoppar inspelningen...',
  assembling_recording: 'Slutför ljudfilen...',
  analyzing_recording: 'Analyserar ljudfilen...',
  handoff_to_asr: 'Skickar till transkribering...',
  queued: 'Väntar i kö...',
  preparing_audio: 'Förbereder ljudet...',
  transcribing: 'Transkriberar...',
  diarizing: 'Identifierar talare...',
  cleanup: 'Rensar transcript...',
  sis_processing: 'Bearbetar talare...',
  done: 'Nästan klart...',
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

const formatElapsedMs = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getJoinStageLabel = (stage?: string): string => {
  switch (stage) {
    case 'navigating': return 'Öppnar möteslänk...';
    case 'prejoin': return 'Förbereder anslutning...';
    case 'clicking_join': return 'Ansluter till mötet...';
    case 'lobby_waiting': return 'Väntar i lobbyn...';
    case 'call_detected': return 'Möte hittat, ansluter ljud...';
    case 'in_call': return 'I mötet, förbereder inspelning...';
    default: return 'Ansluter till mötet...';
  }
};

const CONNECTION_STEPS = [
  { key: 'pending', label: 'Skapar session' },
  { key: 'starting', label: 'Initierar' },
  { key: 'joining', label: 'Ansluter' },
  { key: 'listening', label: 'Live' },
];

const getStepIndex = (status: DigitalSessionStatus): number => {
  switch (status) {
    case 'pending': return 0;
    case 'starting': return 1;
    case 'joining': return 2;
    case 'listening': return 3;
    default: return -1;
  }
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
  const [isStartingRecording, setIsStartingRecording] = useState(false);
  const hasAutoNavigated = useRef(false); // kept for potential future use

  const isTerminal = ['completed', 'failed', 'timed_out', 'cancelled', 'interrupted'].includes(status);
  const isConnecting = ['pending', 'starting', 'joining'].includes(status);
  const isStopping = status === 'stopping';
  const isListening = status === 'listening';
  const isPaused = status === 'paused';
  const isInterrupted = status === 'interrupted';
  const isProcessing = status === 'processing';
  const stepIndex = getStepIndex(status);

  const metadata = session?.metadata;
  const isLobby = metadata?.joinStage === 'lobby_waiting';
  const awaitingHost = metadata?.awaitingHostAdmission || metadata?.joinUiState === 'await_host_admission';
  const hostActionText = metadata?.hostActionText;
  const botName = metadata?.botDisplayName || 'Tivly Assistant';
  const meetingEndedByHost = metadata?.meetingEndedByHost;
  const endedReason = metadata?.endedReason;

  // Key flags from the guide
  const awaitingRecordingStart = metadata?.awaitingRecordingStart === true;
  const recordingStartedAt = metadata?.recordingStartedAt || null;
  const audioCaptureActive = metadata?.audioCaptureActive === true;
  const capturePaused = metadata?.capturePaused === true;

  // Timer should only run from recordingStartedAt (actual recording), not session.startedAt
  const timerReference = recordingStartedAt || (isListening ? session?.startedAt : null);
  const showTimer = !!timerReference && !awaitingRecordingStart;

  // No auto-navigate — redirect handled by TranscriptionInterface

  // Timer effect – use recordingStartedAt when available
  useEffect(() => {
    if (!timerReference || isTerminal || awaitingRecordingStart) {
      if (!timerReference) setElapsed('00:00');
      return;
    }
    setElapsed(formatDuration(timerReference));
    const interval = setInterval(() => {
      setElapsed(formatDuration(timerReference));
    }, 1000);
    return () => clearInterval(interval);
  }, [timerReference, isTerminal, awaitingRecordingStart]);

  // Reset the starting flag when status changes away from paused
  useEffect(() => {
    if (status !== 'paused') {
      setIsStartingRecording(false);
    }
  }, [status]);

  const handleStopConfirm = () => {
    setShowStopConfirm(false);
    onStop();
  };

  const handleGoToMeeting = () => {
    if (session?.meetingId) {
      navigate(`/meetings/${session.meetingId}`, { replace: true });
    }
  };

  const handleStartRecording = async () => {
    setIsStartingRecording(true);
    onResume();
  };

  const sessionError = session?.error?.message || error;
  const friendlyErrorCode = errorCode ? ERROR_CODE_LABELS[errorCode] : null;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border/50">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 -ml-1" disabled={isStopping}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {session?.meetingTitle || 'Digital session'}
          </p>
          {showTimer && (isListening || isPaused) && (
            <p className="text-xs text-muted-foreground font-mono">{elapsed}</p>
          )}
        </div>
        {isListening && audioCaptureActive && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500/10">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[11px] font-medium text-green-600 dark:text-green-400">LIVE</span>
          </div>
        )}
        {isPaused && awaitingRecordingStart && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            <span className="text-[11px] font-medium text-primary">REDO</span>
          </div>
        )}
        {isPaused && !awaitingRecordingStart && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-yellow-500/10">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
            <span className="text-[11px] font-medium text-yellow-600 dark:text-yellow-400">PAUSAD</span>
          </div>
        )}
        {isProcessing && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10">
            <Loader2 className="w-3 h-3 text-primary animate-spin" />
            <span className="text-[11px] font-medium text-primary">BEARBETAR</span>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
        
        {/* Connecting states (pending → starting → joining) */}
        {isConnecting && (
          <div className="flex flex-col items-center gap-6 w-full max-w-xs">
            <div className="relative w-20 h-20 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-primary/5 animate-ping" style={{ animationDuration: '3s' }} />
              <div className="absolute inset-1 rounded-full bg-primary/5 animate-pulse" style={{ animationDuration: '2s' }} />
              <Loader2 className="w-7 h-7 text-primary animate-spin" style={{ animationDuration: '2s' }} />
            </div>

            <div className="text-center space-y-1.5">
              {status === 'joining' ? (
                <>
                  <p className="text-base font-semibold text-foreground">
                    {awaitingHost ? 'Väntar på att bli insläppt' : isLobby ? 'Väntar i lobbyn' : getJoinStageLabel(metadata?.joinStage)}
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {awaitingHost
                      ? (hostActionText || `${botName} väntar på att bli insläppt i mötet.`)
                      : isLobby 
                      ? `${botName} väntar i lobbyn. Mötesvärden behöver släppa in den.`
                      : `${botName} ansluter till mötet. Det kan ta upp till en minut.`}
                  </p>
                  {/* Host admission callout */}
                  {awaitingHost && (
                    <div className="mt-3 mx-auto max-w-[280px] flex items-start gap-2.5 p-3 rounded-xl bg-primary/5 border border-primary/15 text-left">
                      <UserCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium text-foreground">
                          Släpp in {botName}
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {hostActionText || `Godkänn ${botName} i Teams-mötet för att fortsätta.`}
                        </p>
                      </div>
                    </div>
                  )}
                  {metadata?.joinElapsedMs != null && metadata.joinElapsedMs > 10000 && (
                    <div className="flex items-center justify-center gap-1.5 mt-2">
                      <Timer className="w-3.5 h-3.5 text-muted-foreground/60" />
                      <span className="text-xs text-muted-foreground/60 font-mono">
                        {formatElapsedMs(metadata.joinElapsedMs)}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="text-base font-semibold text-foreground">
                    {status === 'pending' ? 'Startar Digital Mode...' : 'Initierar Teams-bot...'}
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Det här kan ta några sekunder.
                  </p>
                </>
              )}
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-1 w-full max-w-[200px]">
              {CONNECTION_STEPS.slice(0, 3).map((step, i) => (
                <div key={step.key} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className={cn(
                    "h-1 w-full rounded-full transition-all duration-700",
                    i < stepIndex ? "bg-primary" :
                    i === stepIndex ? "bg-primary/60 animate-pulse" :
                    "bg-muted-foreground/15"
                  )} />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between w-full max-w-[200px] -mt-4">
              {CONNECTION_STEPS.slice(0, 3).map((step, i) => (
                <span key={step.key} className={cn(
                  "text-[10px] transition-colors",
                  i <= stepIndex ? "text-muted-foreground" : "text-muted-foreground/30"
                )}>
                  {step.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Stopping – redirect happens automatically */}
        {isStopping && (
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-16 h-16 flex items-center justify-center">
              <Loader2 className="w-7 h-7 text-muted-foreground animate-spin" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-base font-semibold text-foreground">
                {meetingEndedByHost ? 'Mötet avslutades av värden' : 'Avslutar mötet...'}
              </p>
              <p className="text-sm text-muted-foreground">
                {metadata?.processingStage
                  ? PROCESSING_STAGE_LABELS[metadata.processingStage] || 'Skickar inspelningen till transkribering...'
                  : 'Inspelningen skickas till transkribering.'}
              </p>
              {(metadata?.autoSubmitAudioFile || metadata?.batchFileAutoSubmitted) && (
                <p className="text-xs text-muted-foreground/60">Automatisk överlämning till batchpipeline</p>
              )}
            </div>
          </div>
        )}

        {/* Listening – bot is in meeting and recording */}
        {isListening && session?.joinedAt && (
          <div className="flex flex-col items-center gap-5 w-full">
            <div className="relative w-24 h-24 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-green-500/8 animate-ping" style={{ animationDuration: '2.5s' }} />
              <div className="absolute inset-2 rounded-full bg-green-500/5 animate-pulse" style={{ animationDuration: '1.5s' }} />
              <div className="absolute inset-4 rounded-full bg-green-500/5" />
              <Radio className="w-8 h-8 text-green-500" />
            </div>
            <div className="text-center space-y-0.5">
              <p className="text-lg font-semibold text-foreground">Inspelning pågår</p>
              <p className="text-xs text-muted-foreground">Transkribering sker efter mötet</p>
              {showTimer && (
                <div className="flex items-center justify-center gap-1.5 mt-1">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="font-mono text-sm text-muted-foreground">{elapsed}</span>
                </div>
              )}
            </div>
            {/* Audio capture indicator */}
            {audioCaptureActive && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/8 border border-green-500/15">
                <Mic className="w-3.5 h-3.5 text-green-500" />
                <span className="text-[11px] font-medium text-green-600 dark:text-green-400">Lyssnar</span>
              </div>
            )}
            {/* Bot media muted trust signal */}
            {metadata?.botMediaMuted && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted">
                <MicOff className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">Botens mic & kamera av</span>
              </div>
            )}
          </div>
        )}

        {/* Listening but not yet joined (edge case) */}
        {isListening && !session?.joinedAt && (
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-20 h-20 flex items-center justify-center">
              <Loader2 className="w-7 h-7 text-primary animate-spin" style={{ animationDuration: '2s' }} />
            </div>
            <p className="text-base font-semibold text-foreground">Ansluter...</p>
          </div>
        )}

        {/* Paused – Awaiting Recording Start (bot is in meeting, waiting for user to press start) */}
        {isPaused && awaitingRecordingStart && (
          <div className="flex flex-col items-center gap-5 w-full max-w-xs">
            <div className="relative w-24 h-24 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-primary/8 animate-pulse" style={{ animationDuration: '2s' }} />
              <div className="absolute inset-2 rounded-full bg-primary/5" />
              <CheckCircle2 className="w-10 h-10 text-primary" />
            </div>
            <div className="text-center space-y-1.5">
              <p className="text-lg font-semibold text-foreground">{botName} är redo i mötet</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Tryck på <span className="font-semibold text-foreground">Starta inspelning</span> för att börja spela in.
              </p>
            </div>
            {metadata?.botMediaMuted && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted">
                <MicOff className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">Botens mic & kamera är avstängda</span>
              </div>
            )}
            {metadata?.botArrivedAt && (
              <p className="text-[11px] text-muted-foreground/50">
                Boten gick med {new Date(metadata.botArrivedAt).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
        )}

        {/* Paused – Normal pause (user paused during recording) */}
        {isPaused && !awaitingRecordingStart && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-yellow-500/10 border-2 border-yellow-500/20 flex items-center justify-center">
              <Pause className="w-8 h-8 text-yellow-500" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-base font-semibold text-yellow-600 dark:text-yellow-400">Pausad</p>
              <p className="text-sm text-muted-foreground">Boten är kvar i mötet. Inspelning pausad.</p>
            </div>
            {capturePaused && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-yellow-500/8 border border-yellow-500/15">
                <MicOff className="w-3.5 h-3.5 text-yellow-500" />
                <span className="text-[11px] font-medium text-yellow-600 dark:text-yellow-400">Ljud pausat</span>
              </div>
            )}
            {showTimer && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="font-mono text-sm text-muted-foreground">{elapsed}</span>
              </div>
            )}
          </div>
        )}

        {/* Completed */}
        {status === 'completed' && (
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-base font-semibold text-foreground">Klart</p>
              <p className="text-sm text-muted-foreground">Transkription sparad</p>
            </div>
            {session?.transcriptChunkCount != null && session.transcriptChunkCount > 0 && (
              <p className="text-xs text-muted-foreground">{session.transcriptChunkCount} delar transkriberade</p>
            )}
            <p className="text-xs text-muted-foreground/50 animate-pulse">Går till mötet...</p>
          </div>
        )}

        {/* Error terminal states (failed, timed_out, cancelled) */}
        {isTerminal && status !== 'completed' && !isInterrupted && (
          <div className="flex flex-col items-center gap-4 max-w-xs">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              {status === 'timed_out' ? (
                <Timer className="w-8 h-8 text-destructive" />
              ) : errorCode === 'digital_audio_silent' ? (
                <MicOff className="w-8 h-8 text-destructive" />
              ) : (
                <AlertTriangle className="w-8 h-8 text-destructive" />
              )}
            </div>
            <div className="text-center space-y-1.5">
              <p className="text-base font-semibold text-foreground">
                {status === 'failed' && errorCode === 'digital_audio_silent' ? 'Inget ljud fångades' :
                 status === 'failed' ? 'Något gick fel' :
                 status === 'timed_out' ? 'Tidsgräns nådd' :
                 'Sessionen avbröts'}
              </p>
              {friendlyErrorCode && (
                <p className="text-sm font-medium text-destructive">{friendlyErrorCode}</p>
              )}
              {sessionError && (
                <p className="text-sm text-muted-foreground leading-relaxed">{sessionError}</p>
              )}
              {errorCode === 'digital_audio_silent' && (
                <p className="text-xs text-muted-foreground/70 leading-relaxed mt-1">
                  Inspelningen skapades men mötesljudet var för svagt eller helt tyst.
                  {metadata?.recordingDurationMs != null && metadata.recordingDurationMs < 5000 && (
                    <span className="block mt-0.5">Inspelningstiden var mycket kort ({(metadata.recordingDurationMs / 1000).toFixed(0)}s).</span>
                  )}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Interrupted – offer retry */}
        {isInterrupted && (
          <div className="flex flex-col items-center gap-4 max-w-xs">
            <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center">
              <ShieldAlert className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div className="text-center space-y-1.5">
              <p className="text-base font-semibold text-foreground">Anslutningen avbröts</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {sessionError || 'Servern startade om medan sessionen var aktiv. Du kan försöka igen.'}
              </p>
            </div>
          </div>
        )}

        {/* Processing state (batch transcription after meeting) */}
        {isProcessing && (
          <div className="flex flex-col items-center gap-5 w-full max-w-sm">
            <div className="relative w-20 h-20 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-primary/5 animate-pulse" style={{ animationDuration: '2s' }} />
              <Loader2 className="w-7 h-7 text-primary animate-spin" style={{ animationDuration: '2.5s' }} />
            </div>
            <div className="text-center space-y-1.5">
              <p className="text-base font-semibold text-foreground">Bearbetar inspelning</p>
              {meetingEndedByHost && (
                <p className="text-xs text-muted-foreground/70">Mötet avslutades av värden</p>
              )}
              {!meetingEndedByHost && endedReason === 'stopped' && (
                <p className="text-xs text-muted-foreground/70">Sessionen avslutades manuellt</p>
              )}
              <p className="text-sm text-muted-foreground leading-relaxed">
                {metadata?.processingStage
                  ? PROCESSING_STAGE_LABELS[metadata.processingStage] || 'Bearbetar...'
                  : 'Det här kan ta några minuter. Du behöver inte vänta här.'}
              </p>
              {metadata?.processingStage === 'diarizing' && metadata?.speakerDiarizationAfterTranscript && (
                <p className="text-xs text-muted-foreground/60">Transkript klart – separerar talare</p>
              )}
              {metadata?.processingStage === 'diarizing' && metadata?.speakerDiarizationEngine && (
                <p className="text-[10px] text-muted-foreground/40">via {metadata.speakerDiarizationEngine}</p>
              )}
              {metadata?.sharedAsrPipeline && (
                <p className="text-[10px] text-muted-foreground/40">Samma batchpipeline som övriga möteslägen</p>
              )}
            </div>
            {metadata?.processingProgressPercent != null && (
              <div className="w-full space-y-1.5">
                <Progress value={metadata.processingProgressPercent} className="h-1.5" />
                <p className="text-[11px] text-muted-foreground text-center">{metadata.processingProgressPercent}%</p>
              </div>
            )}

            {/* Transcript preview during processing */}
            {session?.transcriptPreview && (
              <div className="w-full mt-2 space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground">Preliminärt transkript</p>
                <div className="max-h-[200px] overflow-y-auto rounded-lg bg-muted/30 border border-border/40 p-3">
                  <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">
                    {session.transcriptPreview}
                  </p>
                </div>
                {metadata?.transcriptionFirst && (
                  <p className="text-[10px] text-muted-foreground/50 text-center">
                    Talarnamn förfinas efter att transkriptet är klart
                  </p>
                )}
              </div>
            )}

            {/* Audio stats */}
            {(metadata?.recordedAudioBytes != null || metadata?.audioMeanVolumeDb != null) && (
              <div className="flex flex-wrap items-center justify-center gap-3 mt-1">
                {metadata?.recordedAudioBytes != null && (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                    <HardDrive className="w-3 h-3" />
                    <span>{formatBytes(metadata.recordedAudioBytes)}</span>
                  </div>
                )}
                {metadata?.audioMeanVolumeDb != null && (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                    <Volume2 className="w-3 h-3" />
                    <span>{metadata.audioMeanVolumeDb.toFixed(0)} dB medel</span>
                  </div>
                )}
              </div>
            )}
            {/* Speaker role suggestions */}
            {metadata?.speakerRoleSuggestions && Object.keys(metadata.speakerRoleSuggestions).length > 0 && (
              <div className="w-full space-y-1 mt-1">
                <p className="text-[11px] text-muted-foreground/60 text-center">Identifierade roller</p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {Object.entries(metadata.speakerRoleSuggestions).map(([speaker, role]) => (
                    <span key={speaker} className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {metadata?.speakerNames?.[speaker] || speaker}: {role}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-4 space-y-2 border-t border-border/50">

        {/* Awaiting recording start – big Start button */}
        {isPaused && awaitingRecordingStart && (
          <div className="space-y-2">
            <Button
              onClick={handleStartRecording}
              disabled={isStartingRecording}
              className="w-full h-14 gap-3 rounded-xl text-base font-semibold"
            >
              {isStartingRecording ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Radio className="w-5 h-5" />
              )}
              {isStartingRecording ? 'Startar...' : 'Starta inspelning'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowStopConfirm(true)}
              className="w-full h-10 text-sm text-muted-foreground"
            >
              Avsluta utan att spela in
            </Button>
          </div>
        )}

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

        {/* Normal pause controls (not awaiting start) */}
        {isPaused && !awaitingRecordingStart && (
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

        {/* Stopping – all controls locked */}
        {isStopping && (
          <Button disabled className="w-full h-11 gap-2 rounded-xl">
            <Loader2 className="w-4 h-4 animate-spin" />
            Avslutar...
          </Button>
        )}

        {status === 'completed' && (
          <div className="space-y-2">
            <Button onClick={handleGoToMeeting} className="w-full h-11 gap-2 rounded-xl">
              <CheckCircle2 className="w-4 h-4" />
              Visa möte & protokoll
            </Button>
          </div>
        )}

        {isProcessing && (
          <div className="space-y-2">
            <Button variant="outline" onClick={handleGoToMeeting} className="w-full h-11 gap-2 rounded-xl">
              <Clock className="w-4 h-4" />
              Gå till mötet
            </Button>
            <p className="text-[11px] text-muted-foreground/50 text-center">
              Du behöver inte vänta här. Transkriberingen fortsätter i bakgrunden.
            </p>
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
          <div className="space-y-2">
            {(status === 'failed' || status === 'timed_out') && (
              <Button onClick={onRetry} variant="outline" className="w-full h-11 gap-2 rounded-xl">
                <RefreshCw className="w-4 h-4" />
                Försök igen
              </Button>
            )}
            <Button variant="ghost" onClick={() => { onReset(); onBack(); }} className="w-full h-10 text-sm text-muted-foreground">
              Tillbaka
            </Button>
          </div>
        )}

        {isConnecting && (
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
              Boten lämnar mötet. Inspelningen bearbetas efteråt.
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
