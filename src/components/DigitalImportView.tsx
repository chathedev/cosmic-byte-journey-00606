import { useState, useEffect, useRef, useCallback } from "react";
import { Monitor, Link2, Unlink, Loader2, CheckCircle2, AlertTriangle, FileText, Calendar, Clock, Users, RefreshCw, ChevronRight, Info, ExternalLink, Shield, AlertCircle, Copy, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import type { ImportableMeeting, ImportStatus, ImportLastError, ImportWarning } from "@/hooks/useDigitalImport";
import { useAuth } from "@/contexts/AuthContext";

interface DigitalImportViewProps {
  importStatus: ImportStatus | null;
  meetings: ImportableMeeting[];
  warnings?: ImportWarning[];
  state: string;
  error: string | null;
  errorCode: string | null;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  onLoadMeetings: () => Promise<void>;
  onImport: (meeting: ImportableMeeting, meetingId?: string, title?: string) => Promise<any>;
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
  microsoft_missing_scopes: {
    title: 'Saknade behörigheter',
    description: 'Microsoft returnerade för få behörigheter. Koppla om ditt konto och godkänn alla begärda behörigheter.',
  },
  microsoft_personal_account_unsupported: {
    title: 'Personligt konto stöds inte',
    description: 'Teams-transkript kräver ett Microsoft 365 arbets- eller skolkonto.',
  },
  microsoft_admin_consent_required: {
    title: 'Administratörsgodkännande krävs',
    description: 'Din organisations IT-administratör behöver godkänna appens behörigheter i Microsoft Entra.',
  },
  microsoft_calendar_meetings_only: {
    title: 'Endast kalenderbaserade möten stöds',
    description: 'Ad hoc-/chatmöten utan kalenderhändelse stöds inte. Endast schemalagda Teams-möten kan importeras.',
  },
};

const ADMIN_CONSENT_URL = 'https://login.microsoftonline.com/common/adminconsent?client_id=ac5fc254-0617-43db-b53a-7a0a65b17a5c&redirect_uri=https://api.tivly.se/auth/microsoft/callback';

const AdminConsentLinkBox = () => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(ADMIN_CONSENT_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {}
  };
  return (
    <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-2 text-left">
      <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
        <Send className="w-3.5 h-3.5 text-primary" />
        Skicka denna länk till din IT-admin
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-[10px] bg-background border rounded px-2 py-1.5 break-all text-muted-foreground select-all">
          {ADMIN_CONSENT_URL}
        </code>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="shrink-0 gap-1.5 h-8"
        >
          {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Kopierad!' : 'Kopiera'}
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
        Admins klickar på länken, loggar in och godkänner behörigheterna. Därefter kan du koppla ditt konto.
      </p>
    </div>
  );
};

export const DigitalImportView = ({
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
  onReset,
  onClose,
  isFullyConnected,
  needsReconnect,
}: DigitalImportViewProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedMeeting, setSelectedMeeting] = useState<ImportableMeeting | null>(null);
  
  const [isImporting, setIsImporting] = useState(false);
  const [importedMeetingId, setImportedMeetingId] = useState<string | null>(null);
  const [refreshCooldown, setRefreshCooldown] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const hasAutoLoaded = useRef(false);
  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const COOLDOWN_KEY = 'diview_refresh_cooldown_until';
  const COOLDOWN_DURATION = 5;

  const isConnected = importStatus?.connected === true;
  const isConfigured = importStatus?.configured === true;
  const isEnabled = importStatus?.enabled === true;
  const lastError = importStatus?.lastError;
  const connectionIssue = importStatus?.connectionIssue;
  const missingScopes = importStatus?.missingScopes;

  // Restore cooldown from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem(COOLDOWN_KEY);
    if (stored) {
      const remaining = Math.ceil((parseInt(stored, 10) - Date.now()) / 1000);
      if (remaining > 0) {
        setRefreshCooldown(true);
        setCooldownSeconds(remaining);
        startCooldownInterval(remaining);
      } else {
        sessionStorage.removeItem(COOLDOWN_KEY);
      }
    }
    return () => {
      if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
    };
  }, []);

  // Auto-load meetings once when fully connected
  useEffect(() => {
    if (isFullyConnected && !hasAutoLoaded.current && meetings.length === 0 && state === 'idle') {
      hasAutoLoaded.current = true;
      onLoadMeetings();
    }
  }, [isFullyConnected, state]);

  const startCooldownInterval = useCallback((seconds: number) => {
    if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
    let remaining = seconds;
    cooldownIntervalRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(cooldownIntervalRef.current!);
        cooldownIntervalRef.current = null;
        setRefreshCooldown(false);
        setCooldownSeconds(0);
        sessionStorage.removeItem(COOLDOWN_KEY);
      } else {
        setCooldownSeconds(remaining);
      }
    }, 1000);
  }, []);

  const handleRefreshMeetings = useCallback(() => {
    if (refreshCooldown || state === 'loading_meetings') return;
    onLoadMeetings();
    setRefreshCooldown(true);
    setCooldownSeconds(COOLDOWN_DURATION);
    sessionStorage.setItem(COOLDOWN_KEY, String(Date.now() + COOLDOWN_DURATION * 1000));
    startCooldownInterval(COOLDOWN_DURATION);
  }, [refreshCooldown, state, onLoadMeetings, startCooldownInterval]);

  const handleSelectMeeting = async (meeting: ImportableMeeting) => {
    setSelectedMeeting(meeting);
    setIsImporting(true);
    try {
      const result = await onImport(meeting, undefined, meeting.title);
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

  // Needs reconnect
  if (needsReconnect) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-amber-600 dark:text-amber-400" />
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Microsoft-kontot behöver kopplas om</h2>
          
          {connectionIssue?.reason === 'personal_account_not_supported_for_transcripts' ? (
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              Personliga Microsoft-konton stöds inte för transkript-import. Koppla om med ett Microsoft 365 arbets- eller skolkonto.
            </p>
          ) : connectionIssue?.reason === 'admin_consent_required_or_missing_permissions' ? (
            <div className="space-y-3 max-w-xs">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Din organisations IT-administratör behöver godkänna Tivlys behörigheter i Microsoft Entra för att transkript-import ska fungera.
              </p>
              <AdminConsentLinkBox />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              {connectionIssue?.message || 'Microsoft returnerade för få behörigheter. Koppla om ditt konto och godkänn alla begärda behörigheter.'}
            </p>
          )}
        </div>

        {missingScopes && missingScopes.length > 0 && (
          <div className="flex flex-wrap gap-1 justify-center max-w-xs">
            {missingScopes.map(s => (
              <Badge key={s} variant="outline" className="text-[10px] font-mono border-amber-500/30 text-amber-700 dark:text-amber-400">
                {s}
              </Badge>
            ))}
          </div>
        )}

        {lastError && (
          <p className="text-[10px] text-muted-foreground/60 max-w-xs">
            Senaste fel: {lastError.message || lastError.code}
          </p>
        )}

        <Button
          onClick={onConnect}
          disabled={state === 'connecting'}
          className="w-full max-w-xs h-11 gap-2 rounded-xl text-sm font-semibold"
        >
          {state === 'connecting' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Koppla om Microsoft-konto
        </Button>
      </div>
    );
  }

  // Not connected - show connect prompt
  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Monitor className="w-8 h-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Importera från Teams</h2>
          <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
            Koppla ditt Microsoft 365-konto för att importera transkript från Teams-möten direkt till Tivly.
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
          {[
            'Koppla ditt Microsoft 365-konto',
            'Välj ett möte med färdigt transkript',
            'Importera och skapa protokoll',
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/30">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-xs font-bold text-primary">{i + 1}</span>
              </div>
              <p className="text-sm text-muted-foreground">{step}</p>
            </div>
          ))}
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
            Kräver Microsoft 365 arbets- eller skolkonto med Teams-transkribering. Du behöver vara organisatör för mötet.
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
            <div className="flex flex-col items-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefreshMeetings}
                disabled={state === 'loading_meetings' || refreshCooldown}
                className="h-8 w-8"
                title={refreshCooldown ? `Vänta ${cooldownSeconds}s…` : 'Uppdatera möteslistan'}
              >
                {state === 'loading_meetings' ? (
                  <div className="w-4 h-4 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </Button>
              {refreshCooldown && (
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-[9px] text-muted-foreground tabular-nums">{cooldownSeconds}s</span>
                  <div className="h-0.5 w-6 rounded-full bg-muted overflow-hidden">
                    <div 
                      className="h-full bg-primary/40 rounded-full transition-all duration-1000 ease-linear"
                      style={{ width: `${(cooldownSeconds / COOLDOWN_DURATION) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
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
          <div className="text-center space-y-4">
            <div className="relative mx-auto w-10 h-10">
              <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Söker efter möten…</p>
              <p className="text-xs text-muted-foreground">Kontrollerar dina Teams-möten i Microsoft 365</p>
            </div>
          </div>
        </div>
      )}

      {/* Importing */}
      {isImporting && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-4">
            <div className="relative mx-auto w-10 h-10">
              <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            </div>
            <p className="text-sm font-medium text-foreground">Importerar möte…</p>
            <p className="text-xs text-muted-foreground">Hämtar transkript och deltagare från Microsoft 365</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {state === 'idle' && meetings.length === 0 && !isImporting && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-4 max-w-xs">
            <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto">
              <FileText className="w-7 h-7 text-muted-foreground/30" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Inga möten med transkribering hittades</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Dina senaste Teams-möten kontrollerades men inget av dem hade transkribering aktiverat eller färdigställt i Microsoft 365.
              </p>
              <div className="space-y-2 text-left">
                <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 border border-border/30">
                  <Info className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    <span className="font-medium text-foreground">Varför visas inga möten?</span> Endast möten där Teams-transkribering var aktiverad och har slutförts visas här. Du behöver vara organisatör för mötet.
                  </p>
                </div>
                <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 border border-border/30">
                  <Clock className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Det kan ta några minuter efter avslutat möte innan transkriptet blir tillgängligt i Microsoft 365.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefreshMeetings} 
                disabled={refreshCooldown}
                className="gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {refreshCooldown ? `Vänta ${cooldownSeconds}s…` : 'Sök igen'}
              </Button>
              {refreshCooldown && (
                <div className="h-1 w-16 rounded-full bg-muted overflow-hidden">
                  <div 
                    className="h-full bg-primary/40 rounded-full transition-all duration-1000 ease-linear"
                    style={{ width: `${(cooldownSeconds / COOLDOWN_DURATION) * 100}%` }}
                  />
                </div>
              )}
            </div>
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

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="px-3 pb-1 space-y-1">
              {warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <Info className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                   {w.message || w.code}
                  </p>
                </div>
              ))}
            </div>
          )}

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

    </div>
  );
};
