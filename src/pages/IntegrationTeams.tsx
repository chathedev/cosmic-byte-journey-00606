import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Monitor, Link2, Unlink, Loader2, AlertTriangle, RefreshCw,
  CheckCircle2, Shield, Info, FileText, Clock, Users, Download, Sparkles,
  ChevronRight, AlertCircle, ExternalLink, Zap, ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  const [autoImportLoading, setAutoImportLoading] = useState(false);
  const [refreshCooldown, setRefreshCooldown] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const hasAutoLoaded = useRef(false);
  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const COOLDOWN_KEY = 'teams_refresh_cooldown_until';
  const COOLDOWN_DURATION = 5;

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

  const handleConnect = async () => { await di.connect(); };
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
      navigate(`/meeting/${result.meeting.id}`);
    }
  };

  const handleToggleAutoImport = async (enabled: boolean) => {
    setAutoImportLoading(true);
    await di.toggleAutoImport(enabled);
    setAutoImportLoading(false);
    toast({
      title: enabled ? 'Automatisk import aktiverad' : 'Automatisk import inaktiverad',
      description: enabled
        ? 'Tivly kontrollerar nu automatiskt efter nya Teams-möten.'
        : 'Automatisk import har stängts av.',
    });
  };

  const autoImport = di.importStatus?.autoImport;

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
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center">
              <Monitor className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Microsoft Teams</h1>
              <p className="text-xs text-muted-foreground">Importera transkript från Teams-möten</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* ── Connection Status ── */}
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 sm:px-5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Anslutning</h2>
              {di.isFullyConnected ? (
                <Badge variant="secondary" className="text-[10px] bg-green-500/15 text-green-700 dark:text-green-400 gap-1 px-1.5 py-0">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  Kopplad
                </Badge>
              ) : di.needsReconnect ? (
                <Badge variant="secondary" className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 gap-1 px-1.5 py-0">
                  <AlertCircle className="w-2.5 h-2.5" />
                  Kräver omkoppling
                </Badge>
              ) : isEnabled && isConfigured ? (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Ej kopplad</Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0">Ej tillgänglig</Badge>
              )}
            </div>

            {/* Not enabled / not configured */}
            {(!isEnabled || !isConfigured) && (
              <div className="px-4 pb-4 sm:px-5">
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/40 border border-border/50">
                  <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    {!isEnabled ? 'Teams-import är inte aktiverat. Kontakta din administratör.' : 'Microsoft Graph inte konfigurerat. Kontakta support.'}
                  </p>
                </div>
              </div>
            )}

            {/* ── Reconnect required ── */}
            {isEnabled && isConfigured && di.needsReconnect && (
              <div className="px-4 pb-4 sm:px-5 space-y-3">
                <Separator />
                {connectionIssue?.reason === 'personal_account_not_supported_for_transcripts' && (
                  <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                    <p className="text-xs font-medium text-destructive flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      Personligt Microsoft-konto stöds inte
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                      Teams-transkript kräver ett Microsoft 365 arbets- eller skolkonto.
                    </p>
                  </div>
                )}

                {connectionIssue?.reason === 'admin_consent_required_or_missing_permissions' && (
                  <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 shrink-0" />
                      Administratörsgodkännande krävs
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                      Din IT-administratör behöver godkänna Tivlys behörigheter i Microsoft Entra.
                    </p>
                  </div>
                )}

                {connectionIssue?.reason !== 'personal_account_not_supported_for_transcripts' && 
                 connectionIssue?.reason !== 'admin_consent_required_or_missing_permissions' && (
                  <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      Kontot behöver kopplas om
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                      {connectionIssue?.message || 'Microsoft returnerade för få behörigheter. Koppla om och godkänn alla begärda behörigheter.'}
                    </p>
                  </div>
                )}

                {missingScopes && missingScopes.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    <span className="text-[10px] text-muted-foreground mr-1">Saknas:</span>
                    {missingScopes.map(s => (
                      <Badge key={s} variant="outline" className="text-[9px] font-mono border-amber-500/30 text-amber-700 dark:text-amber-400 px-1 py-0">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}

                {lastError && (
                  <p className="text-[10px] text-muted-foreground/60">
                    Senaste fel: {ERROR_CODE_LABELS[lastError.code] || lastError.message || lastError.code}
                  </p>
                )}

                <Button onClick={handleConnect} disabled={di.state === 'connecting'} size="sm" className="gap-1.5 text-xs font-semibold">
                  {di.state === 'connecting' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Koppla om
                </Button>
              </div>
            )}

            {/* ── Fully connected ── */}
            {isEnabled && isConfigured && di.isFullyConnected && account && (
              <div className="px-4 pb-3 sm:px-5">
                <Separator className="mb-3" />
                <Collapsible open={accountOpen} onOpenChange={setAccountOpen}>
                  <CollapsibleTrigger className="w-full flex items-center justify-between py-1 group cursor-pointer">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-medium text-foreground truncate">{account.email}</span>
                      {account.displayName && (
                        <span className="text-[11px] text-muted-foreground hidden sm:inline">({account.displayName})</span>
                      )}
                    </div>
                    <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${accountOpen ? 'rotate-180' : ''}`} />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 space-y-2">
                      <div className="rounded-lg border border-border bg-muted/20 divide-y divide-border text-xs">
                        {account.connectedAt && (
                          <div className="flex items-center justify-between px-3 py-2">
                            <span className="text-muted-foreground">Kopplad sedan</span>
                            <span className="text-foreground">{formatDate(account.connectedAt)}</span>
                          </div>
                        )}
                        {account.lastImportAt && (
                          <div className="flex items-center justify-between px-3 py-2">
                            <span className="text-muted-foreground">Senaste import</span>
                            <span className="text-foreground">{formatDate(account.lastImportAt)}</span>
                          </div>
                        )}
                      </div>

                      {scopes && scopes.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {scopes.map((scope) => (
                            <Badge key={scope} variant="outline" className="text-[9px] font-mono px-1 py-0">
                              {scope}
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={handleDisconnect} className="gap-1 text-xs h-7 px-2.5">
                          <Unlink className="w-3 h-3" />
                          Koppla bort
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => di.checkStatus()} className="gap-1 text-xs h-7 px-2.5">
                          <RefreshCw className="w-3 h-3" />
                          Uppdatera
                        </Button>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}

            {/* ── Not connected (fresh) ── */}
            {isEnabled && isConfigured && !di.importStatus?.connected && !di.needsReconnect && (
              <div className="px-4 pb-4 sm:px-5 space-y-3">
                <Separator />
                {lastError && (
                  <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                    <p className="text-xs font-medium text-destructive flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      {lastError.code === 'microsoft_token_request_failed' ? 'Autentiseringen misslyckades' : 'Kopplingen misslyckades'}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                      {lastError.message?.includes('AADSTS7000215')
                        ? 'Felaktig klienthemlighet i backend. Kontrollera att MICROSOFT_CLIENT_SECRET är satt till secret Value.'
                        : lastError.message || 'Ett okänt fel uppstod. Försök igen.'}
                    </p>
                  </div>
                )}

                <div className="space-y-1.5">
                  {['Koppla ditt Microsoft 365-konto', 'Välj ett Teams-möte med färdigt transkript', 'Importera och skapa protokoll i Tivly'].map((step, i) => (
                    <div key={i} className="flex items-center gap-2.5 py-1">
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-bold text-primary">{i + 1}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{step}</p>
                    </div>
                  ))}
                </div>

                <Button onClick={handleConnect} disabled={di.state === 'connecting'} size="sm" className="gap-1.5 text-xs font-semibold">
                  {di.state === 'connecting' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                  Koppla Microsoft-konto
                </Button>

                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/20 border border-border/30">
                  <Shield className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Kräver Microsoft 365 arbets-/skolkonto med Teams-transkribering. Du behöver vara organisatör.
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* ── Auto-import ── */}
          {di.isFullyConnected && (
            <section className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 sm:px-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Zap className="w-4 h-4 text-primary" />
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">Automatisk import</h2>
                      <p className="text-[11px] text-muted-foreground">Hämtar möten automatiskt när transkriptet är klart</p>
                    </div>
                  </div>
                  <Switch
                    checked={autoImport?.enabled ?? false}
                    onCheckedChange={handleToggleAutoImport}
                    disabled={autoImportLoading}
                  />
                </div>

                {autoImport?.enabled && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <Badge variant="secondary" className="text-[9px] bg-green-500/15 text-green-700 dark:text-green-400 gap-0.5 px-1.5 py-0">
                        <CheckCircle2 className="w-2 h-2" />
                        Aktiv
                      </Badge>
                      {autoImport.lastRunAt && (
                        <span>Kontrollerad {formatDateTime(autoImport.lastRunAt)}</span>
                      )}
                      {autoImport.lastImportAt && (
                        <span>· Import {formatDateTime(autoImport.lastImportAt)}</span>
                      )}
                    </div>

                    {autoImport.lastError && (
                      <div className="p-2 rounded-lg border border-destructive/30 bg-destructive/5">
                        <p className="text-[11px] text-destructive flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          {ERROR_CODE_LABELS[autoImport.lastError.code] || autoImport.lastError.message || autoImport.lastError.code}
                        </p>
                      </div>
                    )}

                    <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
                      Kontrollerar nya möten ca varje minut. Du får mejl till din Tivly-adress vid import. Raderade möten importeras inte igen automatiskt.
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ── Importable meetings ── */}
          {di.isFullyConnected && (
            <section className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 sm:px-5 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Importerbara möten</h2>
                  <p className="text-[11px] text-muted-foreground">Möten med färdigt transkript i Microsoft 365</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRefreshMeetings}
                    disabled={di.state === 'loading_meetings' || refreshCooldown}
                    className="gap-1 text-xs h-7 px-2"
                  >
                    {di.state === 'loading_meetings' ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    {refreshCooldown ? `${cooldownSeconds}s` : 'Uppdatera'}
                  </Button>
                  {refreshCooldown && (
                    <div className="h-1 w-12 rounded-full bg-muted overflow-hidden">
                      <div 
                        className="h-full bg-primary/40 rounded-full transition-all duration-1000 ease-linear"
                        style={{ width: `${(cooldownSeconds / COOLDOWN_DURATION) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {di.state === 'loading_meetings' && di.meetings.length === 0 && (
                <div className="p-8 flex flex-col items-center gap-3 text-center">
                  <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                  <p className="text-xs text-muted-foreground">Söker efter möten…</p>
                </div>
              )}

              {di.state !== 'loading_meetings' && di.meetings.length === 0 && (
                <div className="p-6 flex flex-col items-center gap-3 text-center">
                  <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-muted-foreground/30" />
                  </div>
                  <div className="max-w-xs space-y-1.5">
                    <p className="text-xs font-medium text-foreground">Inga importerbara möten hittades</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Aktivera transkribering i Teams och vänta tills transkriptet är klart efter mötet.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefreshMeetings}
                    disabled={refreshCooldown}
                    className="gap-1 text-xs h-7 mt-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    {refreshCooldown ? `Vänta ${cooldownSeconds}s` : 'Sök igen'}
                  </Button>
                </div>
              )}

              {di.meetings.length > 0 && (
                <div className="divide-y divide-border">
                  {di.warnings && di.warnings.length > 0 && (
                    <div className="px-4 py-2 sm:px-5 space-y-1">
                      {di.warnings.map((w, i) => (
                        <div key={i} className="flex items-start gap-1.5 p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
                          <Info className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                          <p className="text-[10px] text-muted-foreground leading-relaxed">{w.message || w.code}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {di.meetings.map((meeting) => {
                    const isImporting = importingId === meeting.meetingId;
                    return (
                      <div
                        key={`${meeting.meetingId}-${meeting.transcriptId}`}
                        className="px-4 py-3 sm:px-5 hover:bg-muted/20 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{meeting.title}</p>
                            <div className="flex items-center gap-2.5 mt-0.5 text-[11px] text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" />
                                {formatDateTime(meeting.startDateTime)}
                              </span>
                              {meeting.hasAttendanceReport && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0">Närvaro</Badge>
                              )}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isImporting || di.state === 'importing'}
                            onClick={() => handleImport(meeting)}
                            className="gap-1 shrink-0 text-xs h-7 px-2.5"
                          >
                            {isImporting ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Download className="w-3 h-3" />
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
                <div className="p-3 mx-4 mb-3 rounded-lg border border-destructive/30 bg-destructive/5">
                  <p className="text-xs text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    {di.error}
                  </p>
                </div>
              )}
            </section>
          )}

          {/* ── Guide (collapsible) ── */}
          {isEnabled && isConfigured && (
            <Collapsible open={guideOpen} onOpenChange={setGuideOpen}>
              <section className="rounded-xl border border-border bg-card overflow-hidden">
                <CollapsibleTrigger className="w-full px-4 py-3 sm:px-5 flex items-center justify-between cursor-pointer hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <Info className="w-4 h-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold text-foreground">Så använder du Teams med Tivly</h2>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${guideOpen ? 'rotate-180' : ''}`} />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Separator />
                  <div className="px-4 py-3 sm:px-5 space-y-2">
                    {[
                      { step: '1', title: 'Gå med i mötet', desc: 'Öppna Teams och anslut till det schemalagda mötet.' },
                      { step: '2', title: 'Klicka "Mer" (⋯)', desc: 'I verktygsfältet högst upp.' },
                      { step: '3', title: '"Spela in och transkribera"', desc: 'Välj det första alternativet i menyn.' },
                      { step: '4', title: 'Välj "Transkribera"', desc: 'Klicka på Transkribera i undermenyn.' },
                      { step: '5', title: 'Välj språk (svenska)', desc: 'Svenska rekommenderas för bästa resultat.' },
                      { step: '6', title: 'Bekräfta & håll mötet', desc: 'Transkriberingen sker i bakgrunden.' },
                      { step: '7', title: 'Importera till Tivly', desc: 'Gå till Tivly efteråt, eller aktivera auto-import.' },
                    ].map((item) => (
                      <div key={item.step} className="flex items-start gap-2.5 py-1">
                        <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[10px] font-bold text-primary">{item.step}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground">{item.title}</p>
                          <p className="text-[10px] text-muted-foreground leading-relaxed">{item.desc}</p>
                        </div>
                      </div>
                    ))}

                    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/20 border border-border/30 mt-2">
                      <Info className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        Transkriberingen utförs av Microsoft Teams. Tivly kör en automatisk förbättringsrunda på importerat transkript.
                      </p>
                    </div>
                  </div>
                </CollapsibleContent>
              </section>
            </Collapsible>
          )}
        </div>
      </div>
    </div>
  );
};

export default IntegrationTeams;
