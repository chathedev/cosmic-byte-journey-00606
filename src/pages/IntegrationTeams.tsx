import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Monitor, Link2, Unlink, Loader2, AlertTriangle, RefreshCw,
  CheckCircle2, Shield, Info, FileText, Clock, Users, Download, Sparkles,
  ChevronRight, AlertCircle, ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useDigitalImport, ImportableMeeting, ERROR_CODE_LABELS, type ImportWarning } from "@/hooks/useDigitalImport";

const formatDate = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return ''; }
};

const formatTime = (dateStr: string) => {
  try {
    return new Date(dateStr).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};

const formatDateTime = (dateStr: string) => {
  try {
    const d = new Date(dateStr);
    return `${d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`;
  } catch { return ''; }
};

const IntegrationTeams = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const di = useDigitalImport();
  const [importingId, setImportingId] = useState<string | null>(null);
  const [refreshCooldown, setRefreshCooldown] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const hasAutoLoaded = useRef(false);
  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const COOLDOWN_KEY = 'teams_refresh_cooldown_until';
  const COOLDOWN_DURATION = 5;

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
    if (di.isFullyConnected && !hasAutoLoaded.current && di.meetings.length === 0 && di.state === 'idle') {
      hasAutoLoaded.current = true;
      di.loadMeetings();
    }
  }, [di.isFullyConnected, di.state]);

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
    if (refreshCooldown || di.state === 'loading_meetings') return;
    di.loadMeetings();
    setRefreshCooldown(true);
    setCooldownSeconds(COOLDOWN_DURATION);
    sessionStorage.setItem(COOLDOWN_KEY, String(Date.now() + COOLDOWN_DURATION * 1000));
    startCooldownInterval(COOLDOWN_DURATION);
  };

  const isEnabled = di.importStatus?.enabled === true;
  const isConfigured = di.importStatus?.configured === true;
  const account = di.importStatus?.account;
  const lastError = di.importStatus?.lastError;
  const scopes = di.importStatus?.scopes;
  const missingScopes = di.importStatus?.missingScopes;
  const connectionIssue = di.importStatus?.connectionIssue;

  const handleConnect = async () => {
    await di.connect();
  };

  const handleDisconnect = async () => {
    await di.disconnect();
    toast({ title: 'Microsoft-konto bortkopplat' });
  };

  const handleImport = async (meeting: ImportableMeeting) => {
    setImportingId(meeting.meetingId);
    const result = await di.importMeeting(meeting);
    setImportingId(null);
    if (result?.imported) {
      toast({ title: 'Import klar', description: `"${result.meeting.title}" har importerats.` });
      // Navigate to the imported meeting
      navigate(`/meeting/${result.meeting.id}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-3xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate('/integrations')}
            className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center">
              <Monitor className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Microsoft Teams</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Importera transkript från Teams-möten</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* ── Connection Status ── */}
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-5 sm:p-6 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Anslutningsstatus</h2>
              {di.isFullyConnected ? (
                <Badge variant="secondary" className="text-xs bg-green-500/15 text-green-700 dark:text-green-400 gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Kopplad
                </Badge>
              ) : di.needsReconnect ? (
                <Badge variant="secondary" className="text-xs bg-amber-500/15 text-amber-700 dark:text-amber-400 gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Kräver omkoppling
                </Badge>
              ) : isEnabled && isConfigured ? (
                <Badge variant="secondary" className="text-xs">Ej kopplad</Badge>
              ) : (
                <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground">Ej tillgänglig</Badge>
              )}
            </div>

            <Separator />

            {/* Not enabled / not configured */}
            {(!isEnabled || !isConfigured) && (
              <div className="p-5 sm:p-6">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/40 border border-border/50">
                  <Info className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {!isEnabled ? 'Teams-import är inte aktiverat' : 'Microsoft Graph inte konfigurerat'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {!isEnabled
                        ? 'Kontakta din administratör för att aktivera Teams-import.'
                        : 'Backend saknar nödvändig Microsoft Graph-konfiguration. Kontakta support.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Reconnect required ── */}
            {isEnabled && isConfigured && di.needsReconnect && (
              <div className="p-5 sm:p-6 space-y-5">
                {/* Personal account not supported */}
                {connectionIssue?.reason === 'personal_account_not_supported_for_transcripts' && (
                  <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5 space-y-2">
                    <p className="text-sm font-medium text-destructive flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      Personligt Microsoft-konto stöds inte
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Teams-transkript kräver ett Microsoft 365 arbets- eller skolkonto. 
                      Koppla bort och anslut igen med rätt kontotyp.
                    </p>
                  </div>
                )}

                {/* Admin consent required */}
                {connectionIssue?.reason === 'admin_consent_required_or_missing_permissions' && (
                  <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-2">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-2">
                      <Shield className="w-4 h-4 shrink-0" />
                      Administratörsgodkännande krävs
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Din organisations IT-administratör behöver godkänna Tivlys behörigheter i Microsoft Entra 
                      (Azure AD) för att transkript-import ska fungera. Kontakta din IT-avdelning och be dem 
                      bevilja admin-consent för appen.
                    </p>
                    {connectionIssue.message && (
                      <p className="text-[10px] text-muted-foreground/60 mt-1">{connectionIssue.message}</p>
                    )}
                  </div>
                )}

                {/* Generic reconnect (legacy bot, missing scopes, etc.) */}
                {connectionIssue?.reason !== 'personal_account_not_supported_for_transcripts' && 
                 connectionIssue?.reason !== 'admin_consent_required_or_missing_permissions' && (
                  <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-2">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      Microsoft-kontot behöver kopplas om
                    </p>
                    {connectionIssue?.message ? (
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {connectionIssue.message}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Microsoft returnerade för få behörigheter för att kunna importera Teams-transkript. 
                        Backend försökte automatiskt begära rätt behörigheter men det lyckades inte. 
                        Koppla om ditt konto och godkänn alla begärda behörigheter.
                      </p>
                    )}
                  </div>
                )}

                {missingScopes && missingScopes.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">Saknade behörigheter:</p>
                    <div className="flex flex-wrap gap-1">
                      {missingScopes.map(s => (
                        <Badge key={s} variant="outline" className="text-[10px] font-mono border-amber-500/30 text-amber-700 dark:text-amber-400">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {lastError && (
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                    <p className="text-[10px] text-muted-foreground/70">
                      Senaste fel: {ERROR_CODE_LABELS[lastError.code] || lastError.message || lastError.code}
                      {lastError.updatedAt && ` · ${formatDate(lastError.updatedAt)}`}
                    </p>
                  </div>
                )}

                <Button
                  onClick={handleConnect}
                  disabled={di.state === 'connecting'}
                  className="w-full sm:w-auto h-11 gap-2 text-sm font-semibold"
                >
                  {di.state === 'connecting' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Koppla om Microsoft-konto
                </Button>
              </div>
            )}

            {/* ── Fully connected ── */}
            {isEnabled && isConfigured && di.isFullyConnected && account && (
              <div className="p-5 sm:p-6 space-y-5">
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Kopplat konto</h3>
                  <div className="rounded-lg border border-border bg-muted/20 divide-y divide-border">
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-muted-foreground">E-post</span>
                      <span className="text-sm font-medium text-foreground">{account.email}</span>
                    </div>
                    {account.displayName && (
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm text-muted-foreground">Namn</span>
                        <span className="text-sm text-foreground">{account.displayName}</span>
                      </div>
                    )}
                    {account.connectedAt && (
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm text-muted-foreground">Kopplad sedan</span>
                        <span className="text-sm text-foreground">{formatDate(account.connectedAt)}</span>
                      </div>
                    )}
                    {account.lastImportAt && (
                      <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm text-muted-foreground">Senaste import</span>
                        <span className="text-sm text-foreground">{formatDate(account.lastImportAt)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {scopes && scopes.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Behörigheter</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {scopes.map((scope) => (
                        <Badge key={scope} variant="outline" className="text-[10px] font-mono">
                          {scope}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={handleDisconnect} className="gap-1.5">
                    <Unlink className="w-3.5 h-3.5" />
                    Koppla bort
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => di.checkStatus()} className="gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5" />
                    Uppdatera
                  </Button>
                </div>
              </div>
            )}

            {/* ── Not connected (fresh) ── */}
            {isEnabled && isConfigured && !di.importStatus?.connected && !di.needsReconnect && (
              <div className="p-5 sm:p-6 space-y-5">
                {lastError && (
                  <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5 space-y-1.5">
                    <p className="text-sm font-medium text-destructive flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {lastError.code === 'microsoft_token_request_failed'
                        ? 'Microsoft-autentiseringen misslyckades'
                        : 'Kopplingen misslyckades'}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {lastError.message?.includes('AADSTS7000215')
                        ? 'Felaktig klienthemlighet i backend. Kontrollera att MICROSOFT_CLIENT_SECRET är satt till secret Value (inte secret ID) i Azure-appregistreringen.'
                        : lastError.message || 'Ett okänt fel uppstod. Försök koppla kontot igen.'}
                    </p>
                    {lastError.updatedAt && (
                      <p className="text-[10px] text-muted-foreground/60 mt-1">{formatDate(lastError.updatedAt)}</p>
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-foreground">Så fungerar det</h3>
                  <div className="space-y-2">
                    {[
                      'Koppla ditt Microsoft 365-konto med ett klick',
                      'Välj ett Teams-möte med färdigt transkript',
                      'Importera transkriptet och skapa protokoll i Tivly',
                    ].map((step, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/30">
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-xs font-bold text-primary">{i + 1}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  onClick={handleConnect}
                  disabled={di.state === 'connecting'}
                  className="w-full sm:w-auto h-11 gap-2 text-sm font-semibold"
                >
                  {di.state === 'connecting' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Link2 className="w-4 h-4" />
                  )}
                  Koppla Microsoft-konto
                </Button>

                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/20 border border-border/30">
                  <Shield className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <span className="font-medium text-foreground">Krav:</span> Microsoft 365 arbets- eller skolkonto med Teams-transkribering aktiverat. 
                    Du behöver vara organisatör för mötet. Kräver behörigheterna Calendars.Read och OnlineMeetingTranscript.Read.All.
                  </p>
                </div>

                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/20 border border-border/30">
                  <Info className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <span className="font-medium text-foreground">Om kvalitet:</span> Transkriberingen utförs av Microsoft Teams – inte av Tivly. 
                    Vi ansvarar inte för eventuella fel i text eller talarnamn, men vi kör en automatisk förbättringsrunda för att rätta till det mesta.
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* ── Guide: Så använder du Teams med Tivly ── */}
          {isEnabled && isConfigured && (
            <section className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="p-5 sm:p-6">
                <h2 className="text-base font-semibold text-foreground mb-1">Så använder du Teams med Tivly</h2>
                <p className="text-xs text-muted-foreground mb-5">Följ stegen nedan för att aktivera transkribering i ditt Teams-möte och sedan importera det till Tivly.</p>

                <div className="space-y-3">
                  {[
                    {
                      step: '1',
                      title: 'Gå med i ditt Teams-möte',
                      desc: 'Öppna Microsoft Teams och anslut till det schemalagda mötet som vanligt.',
                    },
                    {
                      step: '2',
                      title: 'Klicka på "Mer" i toppfältet',
                      desc: 'I mötets verktygsfält högst upp, klicka på de tre prickarna (⋯) som heter "Mer".',
                    },
                    {
                      step: '3',
                      title: 'Välj "Spela in och transkribera"',
                      desc: 'Välj det första alternativet i menyn: "Spela in och transkribera" (Record and Transcribe).',
                    },
                    {
                      step: '4',
                      title: 'Välj "Transkribera"',
                      desc: 'I undermenyn som öppnas, klicka på "Transkribera" (Transcribe) för att starta transkriberingen.',
                    },
                    {
                      step: '5',
                      title: 'Välj språk',
                      desc: 'Välj önskat språk för transkriberingen. Svenska rekommenderas för bästa resultat med Tivly.',
                    },
                    {
                      step: '6',
                      title: 'Bekräfta och genomför mötet',
                      desc: 'Klicka på "Bekräfta" (Confirm) och håll sedan ditt möte som vanligt. Transkriberingen sker i bakgrunden.',
                    },
                    {
                      step: '7',
                      title: 'Importera till Tivly',
                      desc: 'Efter mötet, gå till Tivly och importera transkriptet. Det kan ta några minuter innan det blir tillgängligt i Microsoft 365.',
                    },
                  ].map((item) => (
                    <div key={item.step} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/30">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs font-bold text-primary">{item.step}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{item.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex items-start gap-2.5 p-3 rounded-lg bg-primary/5 border border-primary/15">
                  <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <span className="font-medium text-foreground">Automatisk import (kommer snart):</span> Vi arbetar på att automatiskt importera dina Teams-möten till Tivly direkt efter avslutat möte — utan att du behöver göra något manuellt.
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* ── Quality disclaimer (always visible) ── */}
          {isEnabled && isConfigured && (
            <div className="flex items-start gap-2.5 p-4 rounded-xl bg-muted/30 border border-border/50">
              <Info className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="font-medium text-foreground">Om kvalitet:</span> Transkriberingen utförs av Microsoft Teams – inte av Tivly. 
                Vi ansvarar inte för eventuella fel i text eller talarnamn, men vi kör en automatisk förbättringsrunda för att rätta till det mesta.
              </p>
            </div>
          )}

          {di.isFullyConnected && (
            <section className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="p-5 sm:p-6 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Importerbara möten</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Möten med färdigt transkript i Microsoft 365</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRefreshMeetings}
                    disabled={di.state === 'loading_meetings' || refreshCooldown}
                    className="gap-1.5"
                  >
                    {di.state === 'loading_meetings' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    {refreshCooldown ? `${cooldownSeconds}s` : 'Uppdatera'}
                  </Button>
                  {refreshCooldown && (
                    <div className="h-1 w-16 rounded-full bg-muted overflow-hidden">
                      <div 
                        className="h-full bg-primary/40 rounded-full transition-all duration-1000 ease-linear"
                        style={{ width: `${(cooldownSeconds / 5) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {di.state === 'loading_meetings' && di.meetings.length === 0 && (
                <div className="p-10 flex flex-col items-center gap-4 text-center">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">Söker efter möten…</p>
                    <p className="text-xs text-muted-foreground">Kontrollerar dina Teams-möten i Microsoft 365</p>
                  </div>
                </div>
              )}

              {di.state !== 'loading_meetings' && di.meetings.length === 0 && (
                <div className="p-10 flex flex-col items-center gap-4 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center">
                    <FileText className="w-7 h-7 text-muted-foreground/30" />
                  </div>
                  <div className="max-w-sm space-y-2">
                    <p className="text-sm font-medium text-foreground">Inga möten med transkribering hittades</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Dina senaste Teams-möten kontrollerades men inget av dem hade transkribering aktiverat eller färdigställt i Microsoft 365.
                    </p>
                    <div className="space-y-2 text-left mt-3">
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
                  <div className="flex flex-col items-center gap-1.5 mt-1">
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
                      <div className="h-1 w-20 rounded-full bg-muted overflow-hidden">
                        <div 
                          className="h-full bg-primary/40 rounded-full transition-all duration-1000 ease-linear"
                          style={{ width: `${(cooldownSeconds / COOLDOWN_DURATION) * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {di.meetings.length > 0 && (
                <div className="divide-y divide-border">
                  {/* Warnings */}
                  {di.warnings && di.warnings.length > 0 && (
                    <div className="p-4 sm:px-6 space-y-1.5">
                      {di.warnings.map((w, i) => (
                        <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
                          <Info className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                           {w.message || w.code}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {di.meetings.map((meeting) => {
                    const isImporting = importingId === meeting.meetingId;
                    return (
                      <div
                        key={`${meeting.meetingId}-${meeting.transcriptId}`}
                        className="p-4 sm:px-6 hover:bg-muted/20 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-lg bg-primary/5 border border-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                            <FileText className="w-4 h-4 text-primary/70" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{meeting.title}</p>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDateTime(meeting.startDateTime)}
                              </span>
                              {meeting.organizerEmail && (
                                <span className="flex items-center gap-1 truncate">
                                  <Users className="w-3 h-3" />
                                  {meeting.organizerEmail}
                                </span>
                              )}
                              {meeting.hasAttendanceReport && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  Närvaro
                                </Badge>
                              )}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isImporting || di.state === 'importing'}
                            onClick={() => handleImport(meeting)}
                            className="gap-1.5 shrink-0"
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

              {di.error && di.state === 'error' && (
                <div className="p-4 mx-5 mb-5 rounded-lg border border-destructive/30 bg-destructive/5">
                  <p className="text-sm text-destructive flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {di.error}
                  </p>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default IntegrationTeams;
