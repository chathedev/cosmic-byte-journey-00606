import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Monitor, Link2, Unlink, Loader2, AlertTriangle, RefreshCw,
  CheckCircle2, Shield, Info, FileText, Clock, Users, Download, Sparkles,
  ChevronRight, AlertCircle, ExternalLink, Zap, ChevronDown, Copy, Send
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
  const [copiedLink, setCopiedLink] = useState(false);
  const hasAutoLoaded = useRef(false);
  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [showConnectedConfirm, setShowConnectedConfirm] = useState(false);
  const prevConnected = useRef(di.isFullyConnected);

  // Detect teams_admin_required from URL (OAuth callback redirect)
  const teamsAdminRequired = searchParams.get('teams_admin_required') === 'true';
  const tenantFromUrl = searchParams.get('tenant');

  // Clean up URL params after reading
  useEffect(() => {
    if (teamsAdminRequired) {
      const url = new URL(window.location.href);
      url.searchParams.delete('teams_admin_required');
      url.searchParams.delete('tenant');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  // Show confirmation when transitioning to connected
  useEffect(() => {
    if (di.isFullyConnected && !prevConnected.current) {
      setShowConnectedConfirm(true);
      const timer = setTimeout(() => setShowConnectedConfirm(false), 5000);
      return () => clearTimeout(timer);
    }
    prevConnected.current = di.isFullyConnected;
  }, [di.isFullyConnected]);

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
  const adminConsent = di.importStatus?.adminConsent;
  const isAdminConsentApproved = adminConsent?.approved === true;
  const isAdminConsentPending = adminConsent?.pending === true;
  const isAdminConsentRequired = adminConsent?.required === true ||
    connectionIssue?.reason === 'admin_consent_required_or_missing_permissions' ||
    connectionIssue?.adminConsentLikelyRequired ||
    teamsAdminRequired;

  // Use backend's adminConsentUrl — NOT a hardcoded global URL
  const adminConsentUrl = adminConsent?.adminConsentUrl || null;

  const handleCopyAdminLink = async () => {
    if (!adminConsentUrl) return;
    try {
      await navigator.clipboard.writeText(adminConsentUrl);
      setCopiedLink(true);
      toast({ title: 'Länk kopierad', description: 'Skicka den till din IT-administratör.' });
      setTimeout(() => setCopiedLink(false), 3000);
    } catch {
      toast({ title: 'Kunde inte kopiera', variant: 'destructive' });
    }
  };

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

  // Build admin consent block content
  const renderAdminConsentBlock = (context: 'reconnect' | 'fresh' | 'url_param') => {
    // If consent is already approved, don't show the block
    if (isAdminConsentApproved) return null;

    return (
      <div className="space-y-3">
        <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            <Shield className="w-4 h-4 shrink-0" />
            {context === 'url_param'
              ? 'Organisationens administratör måste godkänna Tivly'
              : 'Administratörsgodkännande krävs'}
          </p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {context === 'url_param'
              ? 'Microsoft kräver att din organisations IT-administratör godkänner Tivly innan Teams-transkript kan importeras. Detta är inte ett vanligt anslutningsfel.'
              : 'Din IT-administratör behöver godkänna Tivlys behörigheter i Microsoft Entra innan transkript kan importeras.'}
          </p>
          {tenantFromUrl && context === 'url_param' && (
            <p className="text-[10px] font-mono text-muted-foreground mt-1.5">
              Tenant: {tenantFromUrl}
            </p>
          )}
          {isAdminConsentPending && (
            <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600 gap-1 mt-2">
              <Clock className="w-2.5 h-2.5" /> Väntar på godkännande
            </Badge>
          )}
        </div>

        {adminConsentUrl && (
          <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-2">
            <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5 text-primary" />
              Skicka denna länk till din IT-admin
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[10px] bg-background border rounded px-2 py-1.5 break-all text-muted-foreground select-all">
                {adminConsentUrl}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyAdminLink}
                className="shrink-0 gap-1.5 h-8"
              >
                {copiedLink ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedLink ? 'Kopierad!' : 'Kopiera'}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
              IT-admins klickar på länken, loggar in med sitt Microsoft-konto och godkänner behörigheterna. Därefter kan du koppla ditt konto.
            </p>
          </div>
        )}

        {!adminConsentUrl && (
          <div className="p-2.5 rounded-lg bg-muted/20 border border-border/30">
            <p className="text-xs text-muted-foreground leading-relaxed flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0" />
              Admin consent-länken är inte tillgänglig ännu. Försök koppla ditt Microsoft-konto först.
            </p>
          </div>
        )}
      </div>
    );
  };

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
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center">
              <Monitor className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Microsoft Teams</h1>
              <p className="text-sm text-muted-foreground">Importera transkript från Teams-möten</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* ── Admin consent required from URL param ── */}
          {teamsAdminRequired && !di.isFullyConnected && (
            <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden p-4">
              {renderAdminConsentBlock('url_param')}
            </section>
          )}

          {/* ── Admin consent approved banner ── */}
          {isAdminConsentApproved && !di.isFullyConnected && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Admin consent är godkänt</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Din organisations IT-administratör har godkänt Tivly. Du kan nu koppla ditt eget Microsoft-konto nedan.
                </p>
                {adminConsent?.approvedAt && (
                  <p className="text-[10px] text-muted-foreground/60">
                    Godkänt {new Date(adminConsent.approvedAt).toLocaleString('sv-SE')}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Connection Status ── */}
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3.5 sm:px-5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Anslutning</h2>
              {di.isFullyConnected ? (
                <Badge variant="secondary" className="text-xs bg-green-500/15 text-green-700 dark:text-green-400 gap-1 px-2 py-0.5">
                  <CheckCircle2 className="w-3 h-3" />
                  Kopplad
                </Badge>
              ) : di.needsReconnect ? (
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

            {/* Not enabled / not configured */}
            {(!isEnabled || !isConfigured) && (
              <div className="px-4 pb-4 sm:px-5">
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/40 border border-border/50">
                  <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">
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
                    <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      Personligt Microsoft-konto stöds inte
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Teams-transkript kräver ett Microsoft 365 arbets- eller skolkonto.
                    </p>
                  </div>
                )}

                {(connectionIssue?.reason === 'admin_consent_required_or_missing_permissions' || connectionIssue?.adminConsentLikelyRequired) && (
                  renderAdminConsentBlock('reconnect')
                )}

                {connectionIssue?.reason !== 'personal_account_not_supported_for_transcripts' && 
                 connectionIssue?.reason !== 'admin_consent_required_or_missing_permissions' &&
                 !connectionIssue?.adminConsentLikelyRequired && (
                  <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      Kontot behöver kopplas om
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {connectionIssue?.message || 'Microsoft returnerade för få behörigheter. Koppla om och godkänn alla begärda behörigheter.'}
                    </p>
                  </div>
                )}

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
                    Senaste fel: {ERROR_CODE_LABELS[lastError.code] || lastError.message || lastError.code}
                  </p>
                )}

                <Button onClick={handleConnect} disabled={di.state === 'connecting'} size="sm" className="gap-1.5 font-semibold">
                  {di.state === 'connecting' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Koppla om
                </Button>
              </div>
            )}

            {/* ── Fully connected ── */}
            {isEnabled && isConfigured && di.isFullyConnected && account && (
              <div className="px-4 pb-3.5 sm:px-5">
                <Separator className="mb-3" />
                <Collapsible open={accountOpen} onOpenChange={setAccountOpen}>
                  <CollapsibleTrigger className="w-full flex items-center justify-between py-1.5 px-1 -mx-1 rounded-lg cursor-pointer hover:bg-muted/40 transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1">
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
                        {isAdminConsentApproved && (
                          <div className="flex items-center justify-between px-3.5 py-2.5">
                            <span className="text-muted-foreground">Admin consent</span>
                            <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600 gap-1">
                              <CheckCircle2 className="w-2.5 h-2.5" /> Godkänd
                            </Badge>
                          </div>
                        )}
                      </div>

                      {scopes && scopes.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {scopes.map((scope) => (
                            <Badge key={scope} variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                              {scope}
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={handleDisconnect} className="gap-1.5 h-8">
                          <Unlink className="w-3.5 h-3.5" />
                          Koppla bort
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => di.checkStatus()} className="gap-1.5 h-8">
                          <RefreshCw className="w-3.5 h-3.5" />
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
                    <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {lastError.code === 'microsoft_token_request_failed' ? 'Autentiseringen misslyckades' : 'Kopplingen misslyckades'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {lastError.message?.includes('AADSTS7000215')
                        ? 'Felaktig klienthemlighet i backend. Kontrollera att MICROSOFT_CLIENT_SECRET är satt till secret Value.'
                        : lastError.message || 'Ett okänt fel uppstod. Försök igen.'}
                    </p>
                  </div>
                )}

                {/* Admin consent notice — use adminConsent from status, not old lastError */}
                {!isAdminConsentApproved && !teamsAdminRequired && (isAdminConsentRequired || isAdminConsentPending) && (
                  renderAdminConsentBlock('fresh')
                )}

                {/* Soft admin consent hint when not yet known */}
                {!isAdminConsentApproved && !isAdminConsentRequired && !isAdminConsentPending && !teamsAdminRequired && (
                  <div className="p-3.5 rounded-xl border border-amber-500/25 bg-amber-500/5 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-1.5">
                        <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                          Administratörsgodkännande kan krävas
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Er organisations IT-administratör kan behöva godkänna Tivly i Microsoft Entra innan transkript kan importeras.
                        </p>
                      </div>
                    </div>

                    {adminConsentUrl && (
                      <div className="p-3 rounded-lg border border-border bg-background/50 space-y-2">
                        <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                          <Send className="w-3.5 h-3.5 text-primary" />
                          Skicka denna länk till din IT-admin
                        </p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 text-[10px] bg-muted border rounded px-2 py-1.5 break-all text-muted-foreground select-all">
                            {adminConsentUrl}
                          </code>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCopyAdminLink}
                            className="shrink-0 gap-1.5 h-8"
                          >
                            {copiedLink ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                            {copiedLink ? 'Kopierad!' : 'Kopiera'}
                          </Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
                          IT-admins klickar på länken, loggar in med sitt Microsoft-konto och godkänner behörigheterna. Därefter kan du koppla ditt konto nedan.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  {['Koppla ditt Microsoft 365-konto', 'Välj ett Teams-möte med färdigt transkript', 'Importera och skapa protokoll i Tivly'].map((step, i) => (
                    <div key={i} className="flex items-center gap-3 py-0.5">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-primary">{i + 1}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{step}</p>
                    </div>
                  ))}
                </div>

                <Button onClick={handleConnect} disabled={di.state === 'connecting'} size="sm" className="gap-1.5 font-semibold">
                  {di.state === 'connecting' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                  Koppla Microsoft-konto
                </Button>

                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/20 border border-border/30">
                  <Info className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Kräver Microsoft 365 arbets-/skolkonto med Teams-transkribering. Du behöver vara organisatör av mötet.
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* ── Connection success confirmation ── */}
          {showConnectedConfirm && (
            <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 flex items-start gap-3 animate-in fade-in-0 slide-in-from-top-2 duration-300">
              <div className="w-9 h-9 rounded-full bg-green-500/15 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-green-700 dark:text-green-300">Kontot är anslutet och godkänt</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Microsoft-kontot har kopplats och alla behörigheter har verifierats. Du kan nu importera Teams-möten.
                </p>
              </div>
            </div>
          )}
          {di.isFullyConnected && (
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
                      {autoImport.lastImportAt && (
                        <span>· Import {formatDateTime(autoImport.lastImportAt)}</span>
                      )}
                    </div>

                    {autoImport.lastError && (
                      <div className="p-2.5 rounded-lg border border-destructive/30 bg-destructive/5">
                        <p className="text-xs text-destructive flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          {ERROR_CODE_LABELS[autoImport.lastError.code] || autoImport.lastError.message || autoImport.lastError.code}
                        </p>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground/80 leading-relaxed">
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
              <div className="px-4 py-3.5 sm:px-5 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Importerbara möten</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Möten med färdigt transkript i Microsoft 365</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRefreshMeetings}
                    disabled={di.state === 'loading_meetings' || refreshCooldown}
                    className="gap-1.5 h-8"
                  >
                    {di.state === 'loading_meetings' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    {refreshCooldown ? `${cooldownSeconds}s` : 'Uppdatera'}
                  </Button>
                  {refreshCooldown && (
                    <div className="h-1 w-14 rounded-full bg-muted overflow-hidden">
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
                  <p className="text-sm text-muted-foreground">Söker efter möten…</p>
                </div>
              )}

              {di.state !== 'loading_meetings' && di.meetings.length === 0 && (
                <div className="p-6 flex flex-col items-center gap-3 text-center">
                  <div className="w-11 h-11 rounded-xl bg-muted/50 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-muted-foreground/30" />
                  </div>
                  <div className="max-w-xs space-y-1.5">
                    <p className="text-sm font-medium text-foreground">Inga importerbara möten hittades</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Aktivera transkribering i Teams och vänta tills transkriptet är klart efter mötet.
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

              {di.meetings.length > 0 && (
                <div className="divide-y divide-border">
                  {di.warnings && di.warnings.length > 0 && (
                    <div className="px-4 py-2.5 sm:px-5 space-y-1.5">
                      {di.warnings.map((w, i) => (
                        <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
                          <Info className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                          <p className="text-xs text-muted-foreground leading-relaxed">{w.message || w.code}</p>
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
                            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDateTime(meeting.startDateTime)}
                              </span>
                              {meeting.hasAttendanceReport && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">Närvaro</Badge>
                              )}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isImporting || di.state === 'importing'}
                            onClick={() => handleImport(meeting)}
                            className="gap-1.5 shrink-0 h-8"
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
                <div className="p-3 mx-4 mb-3 rounded-lg border border-destructive/30 bg-destructive/5">
                  <p className="text-sm text-destructive flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
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
                <CollapsibleTrigger className="w-full px-4 py-3.5 sm:px-5 flex items-center justify-between cursor-pointer hover:bg-muted/20 transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset">
                  <div className="flex items-center gap-2.5">
                    <Info className="w-4 h-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold text-foreground">Så använder du Teams med Tivly</h2>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${guideOpen ? 'rotate-180' : ''}`} />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Separator />
                  <div className="px-4 py-3.5 sm:px-5 space-y-2.5">
                    {[
                      { step: '1', title: 'Gå med i mötet', desc: 'Öppna Teams och anslut till det schemalagda mötet.' },
                      { step: '2', title: 'Klicka "Mer" (⋯)', desc: 'I verktygsfältet högst upp.' },
                      { step: '3', title: '"Spela in och transkribera"', desc: 'Välj det första alternativet i menyn.' },
                      { step: '4', title: 'Välj "Transkribera"', desc: 'Klicka på Transkribera i undermenyn.' },
                      { step: '5', title: 'Välj språk (svenska)', desc: 'Svenska rekommenderas för bästa resultat.' },
                      { step: '6', title: 'Bekräfta & håll mötet', desc: 'Transkriberingen sker i bakgrunden.' },
                      { step: '7', title: 'Importera till Tivly', desc: 'Gå till Tivly efteråt, eller aktivera auto-import.' },
                    ].map((item) => (
                      <div key={item.step} className="flex items-start gap-3 py-1">
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-xs font-bold text-primary">{item.step}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{item.title}</p>
                          <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                        </div>
                      </div>
                    ))}

                    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/20 border border-border/30 mt-1">
                      <Info className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />
                      <p className="text-xs text-muted-foreground leading-relaxed">
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
