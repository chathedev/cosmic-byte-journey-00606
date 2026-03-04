import { useState, useEffect, useRef } from "react";
import { Link2, Unlink, Loader2, CheckCircle2, AlertTriangle, FileText, Calendar, Clock, RefreshCw, ChevronRight, Info, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import googleMeetLogo from "@/assets/google-meet-logo.png";
import type { GoogleMeetMeeting, GoogleMeetImportStatus, GoogleMeetImportWarning } from "@/hooks/useGoogleMeetImport";
import { GOOGLE_MEET_ERROR_CODE_LABELS } from "@/hooks/useGoogleMeetImport";

interface GoogleMeetImportViewProps {
  importStatus: GoogleMeetImportStatus | null;
  meetings: GoogleMeetMeeting[];
  warnings?: GoogleMeetImportWarning[];
  state: string;
  error: string | null;
  errorCode: string | null;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  onLoadMeetings: () => Promise<void>;
  onImport: (meeting: GoogleMeetMeeting, meetingId?: string, title?: string) => Promise<any>;
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
  google_meet_import_disabled: {
    title: 'Google Meet-import är avstängd',
    description: 'Kontakta din administratör för att aktivera Google Meet-import.',
  },
  google_meet_not_configured: {
    title: 'Google Meet inte konfigurerat',
    description: 'Backend saknar nödvändig Google-konfiguration.',
  },
  google_meet_account_not_connected: {
    title: 'Google-konto inte kopplat',
    description: 'Du behöver koppla ditt Google-konto för att importera möten.',
  },
  google_meet_reconnect_required: {
    title: 'Google-kontot behöver kopplas om',
    description: 'Din Google-koppling har blivit ogiltig. Koppla om ditt konto.',
  },
  google_meet_missing_scopes: {
    title: 'Saknade behörigheter',
    description: 'Google returnerade för få behörigheter. Koppla om ditt konto.',
  },
  google_meet_transcript_not_found: {
    title: 'Transkriptet hittades inte',
    description: 'Google Meet-transkriptet finns inte längre tillgängligt.',
  },
  google_meet_transcript_empty: {
    title: 'Tomt transkript',
    description: 'Transkriptet hittades men innehöll ingen användbar text.',
  },
  meeting_already_imported: {
    title: 'Redan importerat',
    description: 'Det här mötet har redan importerats till Tivly.',
  },
};

export const GoogleMeetImportView = ({
  importStatus,
  meetings,
  warnings = [],
  state,
  error,
  errorCode,
  onConnect,
  onDisconnect,
  onLoadMeetings,
  onImport,
  onToggleAutoImport,
  onReset,
  onClose,
  isFullyConnected,
  needsReconnect,
}: GoogleMeetImportViewProps) => {
  const navigate = useNavigate();
  const [importingId, setImportingId] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (isFullyConnected && !hasLoadedRef.current && meetings.length === 0 && state === 'idle') {
      hasLoadedRef.current = true;
      onLoadMeetings();
    }
  }, [isFullyConnected, meetings.length, state, onLoadMeetings]);

  const handleImport = async (meeting: GoogleMeetMeeting) => {
    setImportingId(meeting.googleEventId);
    const result = await onImport(meeting);
    setImportingId(null);
    if (result?.meeting?.id) {
      navigate(`/meetings/${result.meeting.id}`);
    }
  };

  if (!isFullyConnected) {
    const isConnecting = state === 'connecting';
    const hasError = state === 'error' && error;
    const errorInfo = errorCode ? ERROR_UI_LABELS[errorCode] : null;

    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-8">
        <div className="max-w-sm w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto overflow-hidden">
            <img src={googleMeetLogo} alt="Google Meet" className="w-10 h-10 object-contain" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">
              {needsReconnect ? 'Koppla om Google' : 'Koppla Google-konto'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {needsReconnect
                ? 'Din Google-koppling behöver förnyas. Koppla om ditt konto.'
                : 'Koppla ditt Google-konto för att importera transkript från Google Meet.'}
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
            {isConnecting ? 'Ansluter...' : needsReconnect ? 'Koppla om Google' : 'Koppla Google-konto'}
          </Button>

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span>Kräver Google Workspace med Meet-transkribering</span>
          </div>
        </div>
      </div>
    );
  }

  const account = importStatus?.account;
  const autoImport = importStatus?.autoImport;
  const isLoadingMeetings = state === 'loading_meetings';

  return (
    <div className="flex-1 flex flex-col">
      {/* Account bar */}
      <div className="px-4 py-3 border-b border-border/50 bg-card/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 overflow-hidden">
              <img src={googleMeetLogo} alt="Google Meet" className="w-5 h-5 object-contain" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {account?.displayName || account?.email || 'Google-konto'}
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
            <p className="text-xs text-muted-foreground">Importera nya möten automatiskt</p>
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

      {/* Meetings list */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">
            Importerbara möten
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={onLoadMeetings}
            disabled={isLoadingMeetings}
            className="h-8 text-xs gap-1.5"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isLoadingMeetings && "animate-spin")} />
            Uppdatera
          </Button>
        </div>

        {isLoadingMeetings && meetings.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : meetings.length === 0 ? (
          <div className="text-center py-12 px-6">
            <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Inga importerbara möten hittades</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Möten med transkript visas här
            </p>
          </div>
        ) : (
          <div className="px-4 pb-4 space-y-2">
            {meetings.map((meeting) => {
              const isImporting = importingId === meeting.googleEventId;

              return (
                <button
                  key={`${meeting.googleEventId}-${meeting.transcriptDocumentId}`}
                  onClick={() => !isImporting && handleImport(meeting)}
                  disabled={isImporting}
                  className={cn(
                    "w-full text-left rounded-xl border border-border p-3 sm:p-4 transition-all",
                    "hover:border-primary/50 hover:bg-primary/5",
                    isImporting && "opacity-70 cursor-wait"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5 overflow-hidden">
                      {isImporting ? (
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      ) : (
                        <img src={googleMeetLogo} alt="" className="w-5 h-5 object-contain" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{meeting.title}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(meeting.startDateTime)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTime(meeting.startDateTime)}
                        </span>
                      </div>
                      {meeting.organizerEmail && (
                        <p className="text-xs text-muted-foreground/70 mt-0.5 truncate">{meeting.organizerEmail}</p>
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
