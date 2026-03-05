import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Link2, Unlink, Loader2, AlertTriangle, RefreshCw,
  CheckCircle2, Info, FileText, Clock, Download,
  ChevronRight, AlertCircle, ChevronDown, Zap
} from "lucide-react";
import googleMeetLogo from "@/assets/google-meet-logo.png";
import { ConnectionSuccessOverlay } from "@/components/ConnectionSuccessOverlay";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useGoogleMeetImport, GOOGLE_MEET_ERROR_CODE_LABELS, type GoogleMeetMeeting } from "@/hooks/useGoogleMeetImport";

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return ''; }
};

const formatDateTime = (dateStr: string) => {
  try {
    const d = new Date(dateStr);
    return `${d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`;
  } catch { return ''; }
};

const IntegrationGoogleMeet = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const gm = useGoogleMeetImport();
  const [importingId, setImportingId] = useState<string | null>(null);
  const [autoImportLoading, setAutoImportLoading] = useState(false);
  const [refreshCooldown, setRefreshCooldown] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const hasAutoLoaded = useRef(false);
  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [showConnectedConfirm, setShowConnectedConfirm] = useState(false);
  const prevConnected = useRef<boolean | null>(null);
  const hasInitializedConnectionState = useRef(false);

  const isOAuthSuccessReturn =
    searchParams.get('integration') === 'google_meet' && searchParams.get('status') === 'success';

  const COOLDOWN_KEY = 'google_meet_refresh_cooldown_until';
  const COOLDOWN_DURATION = 5;

  useEffect(() => {
    if (gm.importStatus === null) return;

    if (!hasInitializedConnectionState.current) {
      hasInitializedConnectionState.current = true;
      prevConnected.current = gm.isFullyConnected;

      if (isOAuthSuccessReturn && gm.isFullyConnected) {
        setShowConnectedConfirm(true);
        return;
      }

      return;
    }

    if (gm.isFullyConnected && !prevConnected.current) {
      setShowConnectedConfirm(true);
      const timer = setTimeout(() => setShowConnectedConfirm(false), 5000);
      prevConnected.current = gm.isFullyConnected;
      return () => clearTimeout(timer);
    }

    prevConnected.current = gm.isFullyConnected;
  }, [gm.importStatus, gm.isFullyConnected, isOAuthSuccessReturn]);

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

  useEffect(() => {
    if (gm.isFullyConnected && !hasAutoLoaded.current && gm.meetings.length === 0 && gm.state === 'idle') {
      hasAutoLoaded.current = true;
      gm.loadMeetings();
    }
  }, [gm.isFullyConnected, gm.state]);

  const startCooldownInterval = (seconds: number) => {
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
  };

  const handleRefreshMeetings = () => {
    if (refreshCooldown || gm.state === 'loading_meetings') return;
    gm.loadMeetings();
    setRefreshCooldown(true);
    setCooldownSeconds(COOLDOWN_DURATION);
    sessionStorage.setItem(COOLDOWN_KEY, String(Date.now() + COOLDOWN_DURATION * 1000));
    startCooldownInterval(COOLDOWN_DURATION);
  };

  const isEnabled = gm.importStatus?.enabled === true;
  const isConfigured = gm.importStatus?.configured === true;
  const account = gm.importStatus?.account;
  const lastError = gm.importStatus?.lastError;
  const missingScopes = gm.importStatus?.missingScopes;
  const connectionIssue = gm.importStatus?.connectionIssue;

  const handleConnect = async () => { await gm.connect(); };
  const handleDisconnect = async () => {
    await gm.disconnect();
    toast({ title: 'Google-konto bortkopplat' });
  };

  const handleImport = async (meeting: GoogleMeetMeeting) => {
    setImportingId(meeting.googleEventId);
    const result = await gm.importMeeting(meeting);
    setImportingId(null);
    if (result?.imported) {
      toast({ title: 'Import klar', description: `"${result.meeting.title}" har importerats.` });
      navigate(`/meeting/${result.meeting.id}`);
    }
  };

  const handleToggleAutoImport = async (enabled: boolean) => {
    setAutoImportLoading(true);
    await gm.toggleAutoImport(enabled);
    setAutoImportLoading(false);
    toast({
      title: enabled ? 'Automatisk import aktiverad' : 'Automatisk import inaktiverad',
      description: enabled
        ? 'Tivly kontrollerar nu automatiskt efter nya Google Meet-möten.'
        : 'Automatisk import har stängts av.',
    });
  };

  const autoImport = gm.importStatus?.autoImport;

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-3xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate('/integrations')}
            className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center overflow-hidden">
              <img src={googleMeetLogo} alt="Google Meet" className="w-8 h-8 object-contain" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Google Meet</h1>
              <p className="text-sm text-muted-foreground">Importera transkript från Google Meet-möten</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* ── Connection Status ── */}
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3.5 sm:px-5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Anslutning</h2>
              {gm.isFullyConnected ? (
                <Badge variant="secondary" className="text-xs bg-green-500/15 text-green-700 dark:text-green-400 gap-1 px-2 py-0.5">
                  <CheckCircle2 className="w-3 h-3" />
                  Kopplad
                </Badge>
              ) : gm.needsReconnect ? (
                <Badge variant="secondary" className="text-xs bg-amber-500/15 text-amber-700 dark:text-amber-400 gap-1 px-2 py-0.5">
                  <AlertCircle className="w-3 h-3" />
                  Kräver omkoppling
                </Badge>
              ) : isEnabled && isConfigured ? (
                <Badge variant="secondary" className="text-xs px-2 py-0.5">Ej kopplad</Badge>
              ) : (
                <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground px-2 py-0.5">Ej tillgänglig</Badge>
              )}
            </div>

            {(!isEnabled || !isConfigured) && (
              <div className="px-4 pb-4 sm:px-5">
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/40 border border-border/50">
                  <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    {!isEnabled ? 'Google Meet-import är inte aktiverat.' : 'Google OAuth inte konfigurerat. Kontakta support.'}
                  </p>
                </div>
              </div>
            )}

            {/* Reconnect required */}
            {isEnabled && isConfigured && gm.needsReconnect && (
              <div className="px-4 pb-4 sm:px-5 space-y-3">
                <Separator />
                <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    Kontot behöver kopplas om
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {connectionIssue?.message || 'Google returnerade för få behörigheter. Koppla om och godkänn alla begärda behörigheter.'}
                  </p>
                </div>

                {missingScopes && missingScopes.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    <span className="text-xs text-muted-foreground mr-1">Saknas:</span>
                    {missingScopes.map(s => (
                      <Badge key={s} variant="outline" className="text-[10px] font-mono border-amber-500/30 text-amber-700 dark:text-amber-400 px-1.5 py-0">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}

                {lastError && (
                  <p className="text-xs text-muted-foreground/60">
                    Senaste fel: {GOOGLE_MEET_ERROR_CODE_LABELS[lastError.code] || lastError.message || lastError.code}
                  </p>
                )}

                <Button onClick={handleConnect} disabled={gm.state === 'connecting'} size="sm" className="gap-1.5 font-semibold">
                  {gm.state === 'connecting' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Koppla om
                </Button>
              </div>
            )}

            {/* Fully connected */}
            {isEnabled && isConfigured && gm.isFullyConnected && account && (
              <div className="px-4 pb-3.5 sm:px-5">
                <Separator className="mb-3" />
                <Collapsible open={accountOpen} onOpenChange={setAccountOpen}>
                  <CollapsibleTrigger className="w-full flex items-center justify-between py-1.5 px-1 -mx-1 rounded-lg cursor-pointer hover:bg-muted/40 transition-colors outline-none">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-foreground truncate">{account.email}</span>
                      {account.displayName && (
                        <span className="text-xs text-muted-foreground hidden sm:inline">({account.displayName})</span>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${accountOpen ? 'rotate-180' : ''}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2.5 space-y-2.5">
                      <div className="rounded-lg border border-border bg-muted/20 divide-y divide-border text-sm">
                        {account.connectedAt && (
                          <div className="flex items-center justify-between px-3.5 py-2.5">
                            <span className="text-muted-foreground">Kopplad sedan</span>
                            <span className="text-foreground">{formatDate(account.connectedAt)}</span>
                          </div>
                        )}
                        {account.lastImportAt && (
                          <div className="flex items-center justify-between px-3.5 py-2.5">
                            <span className="text-muted-foreground">Senaste import</span>
                            <span className="text-foreground">{formatDate(account.lastImportAt)}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={handleDisconnect} className="gap-1.5 h-8">
                          <Unlink className="w-3.5 h-3.5" />
                          Koppla bort
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => gm.checkStatus()} className="gap-1.5 h-8">
                          <RefreshCw className="w-3.5 h-3.5" />
                          Uppdatera
                        </Button>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}

            {/* Not connected */}
            {isEnabled && isConfigured && !gm.importStatus?.connected && !gm.needsReconnect && (
              <div className="px-4 pb-4 sm:px-5 space-y-3">
                <Separator />
                {lastError && (
                  <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                    <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      Kopplingen misslyckades
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {lastError.message || 'Ett okänt fel uppstod. Försök igen.'}
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  {['Koppla ditt Google-konto', 'Välj ett möte med transkript', 'Importera och skapa protokoll i Tivly'].map((step, i) => (
                    <div key={i} className="flex items-center gap-3 py-0.5">
                      <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{i + 1}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{step}</p>
                    </div>
                  ))}
                </div>

                <Button onClick={handleConnect} disabled={gm.state === 'connecting'} size="sm" className="gap-1.5 font-semibold">
                  {gm.state === 'connecting' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                  Koppla Google-konto
                </Button>

                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/20 border border-border/30">
                  <Info className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Kräver Google Workspace-konto med Google Meet-transkribering aktiverat.
                  </p>
                </div>
              </div>
            )}
          </section>

          <ConnectionSuccessOverlay
            show={showConnectedConfirm}
            onClose={() => setShowConnectedConfirm(false)}
            serviceName="Google Meet"
            description="Google-kontot har kopplats. Du kan nu importera möten med transkript."
            logo={googleMeetLogo}
          />

          {/* Auto-import */}
          {gm.isFullyConnected && (
            <section className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3.5 sm:px-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Zap className="w-4 h-4 text-primary" />
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">Automatisk import</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Hämtar möten automatiskt när transkriptet är klart
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={autoImport?.enabled ?? false}
                    onCheckedChange={handleToggleAutoImport}
                    disabled={autoImportLoading}
                  />
                </div>

                {autoImport?.enabled && (
                  <div className="mt-3 space-y-2.5">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="text-[10px] bg-green-500/15 text-green-700 dark:text-green-400 gap-1 px-1.5 py-0">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        Aktiv
                      </Badge>
                      {autoImport.lastRunAt && (
                        <span>Kontrollerad {formatDateTime(autoImport.lastRunAt)}</span>
                      )}
                    </div>

                    {autoImport.lastError && (
                      <div className="p-2.5 rounded-lg border border-destructive/30 bg-destructive/5">
                        <p className="text-xs text-destructive flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          {GOOGLE_MEET_ERROR_CODE_LABELS[autoImport.lastError.code] || autoImport.lastError.message || autoImport.lastError.code}
                        </p>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground/80 leading-relaxed">
                      Kontrollerar nya möten ca varje minut. Du får mejl till din Tivly-adress vid import.
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Importable meetings */}
          {gm.isFullyConnected && (
            <section className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3.5 sm:px-5 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Importerbara möten</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Google Meet-möten med färdigt transkript</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRefreshMeetings}
                    disabled={gm.state === 'loading_meetings' || refreshCooldown}
                    className="gap-1.5 h-8"
                  >
                    {gm.state === 'loading_meetings' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    {refreshCooldown ? `${cooldownSeconds}s` : 'Uppdatera'}
                  </Button>
                </div>
              </div>

              <Separator />

              {gm.state === 'loading_meetings' && gm.meetings.length === 0 && (
                <div className="p-8 flex flex-col items-center gap-3 text-center">
                  <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">Söker efter möten…</p>
                </div>
              )}

              {gm.state !== 'loading_meetings' && gm.meetings.length === 0 && (
                <div className="p-6 flex flex-col items-center gap-3 text-center">
                  <div className="w-11 h-11 rounded-xl bg-muted/50 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-muted-foreground/30" />
                  </div>
                  <div className="max-w-xs space-y-1.5">
                    <p className="text-sm font-medium text-foreground">Inga importerbara möten hittades</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Aktivera transkribering i Google Meet och vänta tills transkriptet är klart.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefreshMeetings}
                    disabled={refreshCooldown}
                    className="gap-1.5 h-8 mt-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    {refreshCooldown ? `Vänta ${cooldownSeconds}s` : 'Sök igen'}
                  </Button>
                </div>
              )}

              {gm.meetings.length > 0 && (
                <div className="divide-y divide-border">
                  {gm.meetings.map((meeting) => {
                    const isImporting = importingId === meeting.googleEventId;
                    return (
                      <div
                        key={`${meeting.googleEventId}-${meeting.transcriptDocumentId}`}
                        className="px-4 py-3 sm:px-5 hover:bg-muted/20 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{meeting.title}</p>
                            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDateTime(meeting.startDateTime)}
                              </span>
                              {meeting.organizerEmail && (
                                <span className="truncate">{meeting.organizerEmail}</span>
                              )}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isImporting}
                            onClick={() => handleImport(meeting)}
                            className="gap-1.5 h-8 shrink-0"
                          >
                            {isImporting ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
                            {isImporting ? 'Importerar…' : 'Importera'}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Guide */}
          {!gm.isFullyConnected && (
            <section className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3.5 sm:px-5">
                <h2 className="text-sm font-semibold text-foreground mb-2">Så fungerar det</h2>
                <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
                  <p>1. Koppla ditt Google-konto</p>
                  <p>2. Håll möten i Google Meet med transkribering aktiverat</p>
                  <p>3. Importera möten med färdigt transkript till Tivly</p>
                  <p>4. Tivly rensar upp transkriptet och skapar protokoll</p>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default IntegrationGoogleMeet;
