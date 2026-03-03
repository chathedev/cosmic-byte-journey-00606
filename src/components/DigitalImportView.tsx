import { useState, useEffect } from "react";
import { Monitor, Link2, Unlink, Loader2, CheckCircle2, AlertTriangle, FileText, Calendar, Clock, Users, RefreshCw, ChevronRight, Info, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import type { ImportableMeeting, ImportStatus, ImportLastError } from "@/hooks/useDigitalImport";
import { ParticipantsInputDialog } from "./ParticipantsInputDialog";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/lib/api";

interface DigitalImportViewProps {
  importStatus: ImportStatus | null;
  meetings: ImportableMeeting[];
  state: string;
  error: string | null;
  errorCode: string | null;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  onLoadMeetings: () => Promise<void>;
  onImport: (meeting: ImportableMeeting, meetingId?: string, title?: string) => Promise<any>;
  onReset: () => void;
  onClose: () => void;
}

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('sv-SE', { weekday: 'short', month: 'short', day: 'numeric' });
};

const formatTime = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
};

const formatDuration = (start: string, end: string) => {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
};

const ERROR_UI_LABELS: Record<string, { title: string; description: string }> = {
  digital_import_disabled: {
    title: 'Importfunktionen är avstängd',
    description: 'Kontakta din administratör för att aktivera Teams-import.',
  },
  microsoft_graph_not_configured: {
    title: 'Microsoft-integration inte konfigurerad',
    description: 'Backend saknar nödvändig Microsoft Graph-konfiguration.',
  },
  microsoft_account_not_connected: {
    title: 'Microsoft-konto inte kopplat',
    description: 'Du behöver koppla ditt Microsoft-konto för att importera möten.',
  },
  microsoft_token_request_failed: {
    title: 'Autentiseringen misslyckades',
    description: 'Kunde inte autentisera med Microsoft. Försök koppla om ditt konto.',
  },
  microsoft_graph_request_failed: {
    title: 'Microsoft Graph-anrop misslyckades',
    description: 'Kunde inte hämta data från Microsoft. Försök igen om en stund.',
  },
  microsoft_transcript_empty: {
    title: 'Tomt transkript',
    description: 'Transkriptet hittades men innehöll ingen användbar text.',
  },
  missing_graph_identifiers: {
    title: 'Mötes-ID saknas',
    description: 'Nödvändiga identifierare för mötet saknas. Försök uppdatera möteslistan.',
  },
  microsoft_token_storage_unavailable: {
    title: 'Säker tokenlagring ej tillgänglig',
    description: 'Backend saknar säker lagringsmöjlighet för Microsoft-tokens.',
  },
};

export const DigitalImportView = ({
  importStatus,
  meetings,
  state,
  error,
  errorCode,
  onConnect,
  onDisconnect,
  onLoadMeetings,
  onImport,
  onReset,
  onClose,
}: DigitalImportViewProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedMeeting, setSelectedMeeting] = useState<ImportableMeeting | null>(null);
  const [showParticipants, setShowParticipants] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importedMeetingId, setImportedMeetingId] = useState<string | null>(null);

  const isConnected = importStatus?.connected === true;
  const isConfigured = importStatus?.configured === true;
  const isEnabled = importStatus?.enabled === true;

  // Auto-load meetings when connected
  useEffect(() => {
    if (isConnected && meetings.length === 0 && state === 'idle') {
      onLoadMeetings();
    }
  }, [isConnected, meetings.length, state, onLoadMeetings]);

  const handleSelectMeeting = (meeting: ImportableMeeting) => {
    setSelectedMeeting(meeting);
    setShowParticipants(true);
  };

  const handleParticipantsConfirm = async (participants: string[]) => {
    setShowParticipants(false);
    if (!selectedMeeting) return;

    setIsImporting(true);
    try {
      // Create a meeting stub first if we have participants to attach
      let meetingId: string | undefined;
      if (participants.length > 0) {
        const now = new Date().toISOString();
        const result = await apiClient.createMeeting({
          title: selectedMeeting.title || 'Importerat möte',
          createdAt: now,
          transcript: '',
          participants,
          ...(user?.uid ? { userId: user.uid } : {}),
        });
        meetingId = result.meeting?.id;
      }

      const result = await onImport(selectedMeeting, meetingId, selectedMeeting.title);
      if (result?.meeting?.id) {
        setImportedMeetingId(result.meeting.id);
      }
    } catch (err) {
      console.error('Import failed:', err);
    } finally {
      setIsImporting(false);
    }
  };

  const handleGoToMeeting = () => {
    if (importedMeetingId) {
      navigate(`/meetings/${importedMeetingId}`, { replace: true });
    }
  };

  // Not enabled or not configured
  if (!isEnabled || !isConfigured) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
          <Monitor className="w-8 h-8 text-muted-foreground" />
        </div>
        <div className="space-y-1.5">
          <p className="text-base font-semibold text-foreground">Teams-import inte tillgänglig</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            {!isEnabled
              ? 'Importfunktionen är för tillfället avstängd.'
              : 'Microsoft Graph-integrationen är inte konfigurerad ännu.'}
          </p>
        </div>
        <Button variant="outline" onClick={onClose}>Stäng</Button>
      </div>
    );
  }

  // Import done
  if (state === 'done' && importedMeetingId) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center space-y-5">
        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-green-500" />
        </div>
        <div className="space-y-1.5">
          <p className="text-lg font-semibold text-foreground">Import klar!</p>
          <p className="text-sm text-muted-foreground">
            Mötet har importerats och transkriptet är sparat.
          </p>
        </div>
        <Button onClick={handleGoToMeeting} className="gap-2">
          <FileText className="w-4 h-4" />
          Visa möte
        </Button>
      </div>
    );
  }

  // Error state
  if (state === 'error' && error) {
    const errorInfo = errorCode ? ERROR_UI_LABELS[errorCode] : null;
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center space-y-5">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-destructive" />
        </div>
        <div className="space-y-1.5">
          <p className="text-base font-semibold text-foreground">
            {errorInfo?.title || 'Något gick fel'}
          </p>
          <p className="text-sm text-muted-foreground max-w-xs">
            {errorInfo?.description || error}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onReset}>Försök igen</Button>
          <Button variant="ghost" onClick={onClose}>Stäng</Button>
        </div>
      </div>
    );
  }

  // Not connected - show connect prompt
  if (!isConnected) {
    const lastError = importStatus?.lastError;
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Monitor className="w-8 h-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Importera från Teams</h2>
          <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
            Koppla ditt Microsoft-konto för att importera transkript från Teams-möten direkt till Tivly.
          </p>
        </div>

        {lastError && (
          <div className="w-full max-w-xs rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-left space-y-1">
            <p className="text-xs font-semibold text-destructive flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {lastError.code === 'microsoft_token_request_failed'
                ? 'Microsoft-autentiseringen misslyckades'
                : 'Senaste kopplingen misslyckades'}
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {lastError.message?.includes('AADSTS7000215')
                ? 'Felaktig klienthemlighet i backend. Kontrollera att MICROSOFT_CLIENT_SECRET är satt till secret Value (inte secret ID) i Azure.'
                : lastError.message || 'Försök koppla kontot igen.'}
            </p>
          </div>
        )}

        <div className="space-y-3 w-full max-w-xs text-left">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/30">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-xs font-bold text-primary">1</span>
            </div>
            <p className="text-sm text-muted-foreground">Koppla ditt Microsoft 365-konto</p>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/30">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-xs font-bold text-primary">2</span>
            </div>
            <p className="text-sm text-muted-foreground">Välj ett möte med färdigt transkript</p>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/30">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-xs font-bold text-primary">3</span>
            </div>
            <p className="text-sm text-muted-foreground">Importera och skapa protokoll</p>
          </div>
        </div>

        <Button
          onClick={onConnect}
          disabled={state === 'connecting'}
          className="w-full max-w-xs h-12 gap-2 rounded-xl text-sm font-semibold"
        >
          {state === 'connecting' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Link2 className="w-4 h-4" />
          )}
          Koppla Microsoft-konto
        </Button>

        <div className="flex items-start gap-2 max-w-xs text-left">
          <Info className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground/50">
            Teams-transkribering måste vara aktiverat för mötet. Du behöver vara organisatör för att kunna importera.
          </p>
        </div>
      </div>
    );
  }

  // Connected - show meeting list
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border/50 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Monitor className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Teams-import</p>
              <p className="text-xs text-muted-foreground">{importStatus?.account?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={onLoadMeetings}
              disabled={state === 'loading_meetings'}
              className="h-8 w-8"
            >
              <RefreshCw className={cn("w-4 h-4", state === 'loading_meetings' && "animate-spin")} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDisconnect}
              className="h-8 text-xs text-muted-foreground gap-1"
            >
              <Unlink className="w-3 h-3" />
              Koppla bort
            </Button>
          </div>
        </div>
      </div>

      {/* Loading */}
      {state === 'loading_meetings' && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-3">
            <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Hämtar möten med transkript...</p>
          </div>
        </div>
      )}

      {/* Importing */}
      {isImporting && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-3">
            <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" />
            <p className="text-sm font-medium text-foreground">Importerar möte...</p>
            <p className="text-xs text-muted-foreground">Hämtar transkript och deltagare från Microsoft 365</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {state === 'idle' && meetings.length === 0 && !isImporting && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-3 max-w-xs">
            <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto" />
            <p className="text-sm font-medium text-foreground">Inga importbara möten</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Här visas möten där Teams-transkribering redan har slutförts. Se till att transkribering är aktiverat i Teams och att du är organisatör.
            </p>
            <Button variant="outline" size="sm" onClick={onLoadMeetings} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              Uppdatera
            </Button>
          </div>
        </div>
      )}

      {/* Meeting list */}
      {state === 'idle' && meetings.length > 0 && !isImporting && (
        <div className="flex-1 overflow-y-auto">
          <div className="px-3 pt-2 pb-1">
            <p className="text-xs text-muted-foreground">
              {meetings.length} {meetings.length === 1 ? 'möte' : 'möten'} med färdigt transkript
            </p>
          </div>
          <div className="p-3 space-y-2">
            {meetings.map((meeting) => (
              <button
                key={`${meeting.meetingId}-${meeting.transcriptId}`}
                onClick={() => handleSelectMeeting(meeting)}
                className="w-full p-3.5 rounded-xl border border-border/50 bg-card hover:border-primary/40 hover:bg-primary/5 transition-all text-left group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-primary/15 transition-colors">
                    <FileText className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                      {meeting.title || 'Namnlöst möte'}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(meeting.startDateTime)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTime(meeting.startDateTime)}
                      </span>
                      <span>{formatDuration(meeting.startDateTime, meeting.endDateTime)}</span>
                    </div>
                    {meeting.hasAttendanceReport && (
                      <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground/60 bg-muted/50 px-1.5 py-0.5 rounded-full">
                        <Users className="w-2.5 h-2.5" />
                        Deltagarlista finns
                      </span>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary/50 transition-colors shrink-0 mt-2.5" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Participants dialog */}
      <ParticipantsInputDialog
        open={showParticipants}
        onOpenChange={setShowParticipants}
        onConfirm={handleParticipantsConfirm}
        title="Mötesdeltagare"
        subtitle="Ange deltagarnas namn för bättre transkribering"
        confirmLabel="Importera möte"
        allowSkip={true}
      />
    </div>
  );
};
