import { useState, useEffect, useRef, useCallback } from "react";
import { Video, Link2, Unlink, Loader2, CheckCircle2, AlertTriangle, FileText, Calendar, Clock, RefreshCw, ChevronRight, Info, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import type { ZoomRecording, ZoomImportStatus, ZoomImportWarning } from "@/hooks/useZoomImport";
import { ZOOM_ERROR_CODE_LABELS } from "@/hooks/useZoomImport";

interface ZoomImportViewProps {
  importStatus: ZoomImportStatus | null;
  recordings: ZoomRecording[];
  warnings?: ZoomImportWarning[];
  state: string;
  error: string | null;
  errorCode: string | null;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  onLoadRecordings: () => Promise<void>;
  onImport: (recording: ZoomRecording, meetingId?: string, title?: string) => Promise<any>;
  onToggleAutoImport: (enabled: boolean) => Promise<void>;
  onReset: () => void;
  onClose: () => void;
  isFullyConnected: boolean;
  needsReconnect: boolean;
}

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('sv-SE', { weekday: 'short', month: 'short', day: 'numeric' });
};

const formatTime = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
};

const ERROR_UI_LABELS: Record<string, { title: string; description: string }> = {
  zoom_import_disabled: {
    title: 'Zoom-import är avstängd',
    description: 'Kontakta din administratör för att aktivera Zoom-import.',
  },
  zoom_not_configured: {
    title: 'Zoom inte konfigurerat',
    description: 'Backend saknar nödvändig Zoom-konfiguration.',
  },
  zoom_account_not_connected: {
    title: 'Zoom-konto inte kopplat',
    description: 'Du behöver koppla ditt Zoom-konto för att importera inspelningar.',
  },
  zoom_reconnect_required: {
    title: 'Zoom-kontot behöver kopplas om',
    description: 'Din Zoom-koppling har blivit ogiltig. Koppla om ditt konto.',
  },
  zoom_missing_scopes: {
    title: 'Saknade behörigheter',
    description: 'Zoom returnerade för få behörigheter. Koppla om ditt konto.',
  },
  zoom_transcript_not_found: {
    title: 'Transkriptet hittades inte',
    description: 'Zoom-transkriptet finns inte längre tillgängligt.',
  },
  zoom_transcript_empty: {
    title: 'Tomt transkript',
    description: 'Transkriptet hittades men innehöll ingen användbar text.',
  },
  meeting_already_imported: {
    title: 'Redan importerat',
    description: 'Det här mötet har redan importerats till Tivly.',
  },
};

export const ZoomImportView = ({
  importStatus,
  recordings,
  warnings = [],
  state,
  error,
  errorCode,
  onConnect,
  onDisconnect,
  onLoadRecordings,
  onImport,
  onToggleAutoImport,
  onReset,
  onClose,
  isFullyConnected,
  needsReconnect,
}: ZoomImportViewProps) => {
  const navigate = useNavigate();
  const [importingId, setImportingId] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  // Auto-load recordings when connected
  useEffect(() => {
    if (isFullyConnected && !hasLoadedRef.current && recordings.length === 0 && state === 'idle') {
      hasLoadedRef.current = true;
      onLoadRecordings();
    }
  }, [isFullyConnected, recordings.length, state, onLoadRecordings]);

  const handleImport = async (recording: ZoomRecording) => {
    setImportingId(recording.transcriptFileId);
    const result = await onImport(recording);
    setImportingId(null);
    if (result?.meeting?.id) {
      navigate(`/meetings/${result.meeting.id}`);
    }
  };

  // Not connected state
  if (!isFullyConnected) {
    const isConnecting = state === 'connecting';
    const hasError = state === 'error' && error;
    const errorInfo = errorCode ? ERROR_UI_LABELS[errorCode] : null;

    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-8">
        <div className="max-w-sm w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Video className="w-8 h-8 text-primary" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">
              {needsReconnect ? 'Koppla om Zoom' : 'Koppla Zoom-konto'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {needsReconnect
                ? 'Din Zoom-koppling behöver förnyas. Koppla om ditt konto.'
                : 'Koppla ditt Zoom-konto för att importera transkript från Cloud Recordings.'}
            </p>
          </div>

          {hasError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-left">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive">{errorInfo?.title || 'Anslutningsfel'}</p>
                  <p className="text-xs text-muted-foreground mt-1">{errorInfo?.description || error}</p>
                </div>
              </div>
            </div>
          )}

          <Button
            onClick={onConnect}
            disabled={isConnecting}
            className="w-full h-12 gap-2"
          >
            {isConnecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Link2 className="w-4 h-4" />
            )}
            {isConnecting ? 'Ansluter...' : needsReconnect ? 'Koppla om Zoom' : 'Koppla Zoom-konto'}
          </Button>

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span>Kräver Zoom Cloud Recording med transkribering</span>
          </div>
        </div>
      </div>
    );
  }

  // Connected state
  const account = importStatus?.account;
  const autoImport = importStatus?.autoImport;
  const isLoadingRecordings = state === 'loading_recordings';

  return (
    <div className="flex-1 flex flex-col">
      {/* Account bar */}
      <div className="px-4 py-3 border-b border-border/50 bg-card/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Video className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {account?.displayName || account?.email || 'Zoom-konto'}
              </p>
              {account?.email && account?.displayName && (
                <p className="text-xs text-muted-foreground truncate">{account.email}</p>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onDisconnect} className="text-xs text-muted-foreground hover:text-destructive gap-1.5">
            <Unlink className="w-3.5 h-3.5" />
            Koppla bort
          </Button>
        </div>
      </div>

      {/* Auto-import toggle */}
      {autoImport && (
        <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Automatisk import</p>
            <p className="text-xs text-muted-foreground">Importera nya inspelningar automatiskt</p>
          </div>
          <Switch
            checked={autoImport.enabled}
            onCheckedChange={(checked) => onToggleAutoImport(checked)}
          />
        </div>
      )}

      {/* Error banner */}
      {state === 'error' && error && (
        <div className="mx-4 mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="ghost" size="sm" onClick={onReset} className="mt-1 h-7 text-xs">
                Försök igen
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Recordings list */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">
            Importbara inspelningar
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={onLoadRecordings}
            disabled={isLoadingRecordings}
            className="h-8 text-xs gap-1.5"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoadingRecordings && "animate-spin")} />
            Uppdatera
          </Button>
        </div>

        {isLoadingRecordings && recordings.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : recordings.length === 0 ? (
          <div className="text-center py-12 px-6">
            <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Inga importbara inspelningar hittades</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Inspelningar med transkript visas här
            </p>
          </div>
        ) : (
          <div className="px-4 pb-4 space-y-2">
            {recordings.map((rec) => {
              const isImporting = importingId === rec.transcriptFileId;

              return (
                <button
                  key={`${rec.meetingUuid}-${rec.transcriptFileId}`}
                  onClick={() => !isImporting && handleImport(rec)}
                  disabled={isImporting}
                  className={cn(
                    "w-full text-left rounded-xl border border-border p-3 sm:p-4 transition-all",
                    "hover:border-primary/50 hover:bg-primary/5",
                    isImporting && "opacity-70 cursor-wait"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                      {isImporting ? (
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      ) : (
                        <Video className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{rec.title}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(rec.startDateTime)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTime(rec.startDateTime)}
                        </span>
                        {rec.durationMinutes && (
                          <span>{rec.durationMinutes} min</span>
                        )}
                      </div>
                      {rec.hostEmail && (
                        <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{rec.hostEmail}</p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-1" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="px-4 pb-3">
          {warnings.map((w, i) => (
            <div key={i} className="text-xs text-amber-600 flex items-center gap-1.5 mt-1">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span>{w.message || w.code}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
