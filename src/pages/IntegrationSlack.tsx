import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, Link2, Unlink, Loader2, AlertTriangle, RefreshCw,
  CheckCircle2, Info, ChevronDown, AlertCircle, Hash, Send, MessageSquare,
} from "lucide-react";
import slackLogo from "@/assets/slack-logo.png";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useSlackIntegration, SLACK_ERROR_CODE_LABELS, type SlackChannel } from "@/hooks/useSlackIntegration";

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

const IntegrationSlack = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const sl = useSlackIntegration();
  const [autoShareLoading, setAutoShareLoading] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [showConnectedConfirm, setShowConnectedConfirm] = useState(false);
  const prevConnected = useRef<boolean | null>(null);
  const hasInitializedConnectionState = useRef(false);
  const hasLoadedChannels = useRef(false);

  const isOAuthSuccessReturn =
    searchParams.get('integration') === 'slack' && searchParams.get('status') === 'success';

  useEffect(() => {
    if (sl.importStatus === null) return;

    if (!hasInitializedConnectionState.current) {
      hasInitializedConnectionState.current = true;
      prevConnected.current = sl.isFullyConnected;

      if (isOAuthSuccessReturn && sl.isFullyConnected) {
        setShowConnectedConfirm(true);
        const timer = setTimeout(() => setShowConnectedConfirm(false), 5000);
        return () => clearTimeout(timer);
      }
      return;
    }

    if (sl.isFullyConnected && !prevConnected.current) {
      setShowConnectedConfirm(true);
      const timer = setTimeout(() => setShowConnectedConfirm(false), 5000);
      prevConnected.current = sl.isFullyConnected;
      return () => clearTimeout(timer);
    }

    prevConnected.current = sl.isFullyConnected;
  }, [sl.importStatus, sl.isFullyConnected, isOAuthSuccessReturn]);

  // Auto-load channels when connected
  useEffect(() => {
    if (sl.isFullyConnected && !hasLoadedChannels.current && sl.channels.length === 0 && sl.state === 'idle') {
      hasLoadedChannels.current = true;
      sl.loadChannels();
    }
  }, [sl.isFullyConnected, sl.state]);

  // Set selected channel from auto-share settings
  useEffect(() => {
    if (sl.importStatus?.autoShare?.channelId && !selectedChannelId) {
      setSelectedChannelId(sl.importStatus.autoShare.channelId);
    }
  }, [sl.importStatus?.autoShare?.channelId]);

  const isEnabled = sl.importStatus?.enabled === true;
  const isConfigured = sl.importStatus?.configured === true;
  const account = sl.importStatus?.account;
  const lastError = sl.importStatus?.lastError;
  const missingScopes = sl.importStatus?.missingScopes;
  const connectionIssue = sl.importStatus?.connectionIssue;
  const autoShare = sl.importStatus?.autoShare;

  const handleConnect = async () => { await sl.connect(); };
  const handleDisconnect = async () => {
    await sl.disconnect();
    toast({ title: 'Slack-workspace bortkopplat' });
  };

  const handleToggleAutoShare = async (enabled: boolean) => {
    if (enabled && !selectedChannelId) {
      toast({ title: 'Välj en kanal', description: 'Du måste välja en kanal för automatisk delning.', variant: 'destructive' });
      return;
    }
    setAutoShareLoading(true);
    const channel = sl.channels.find(c => c.id === selectedChannelId);
    await sl.updateSettings({
      autoShareEnabled: enabled,
      channelId: selectedChannelId || undefined,
      channelName: channel?.name || undefined,
    });
    setAutoShareLoading(false);
    toast({
      title: enabled ? 'Auto-delning aktiverad' : 'Auto-delning inaktiverad',
      description: enabled
        ? `Protokoll delas automatiskt till #${channel?.name || 'vald kanal'}.`
        : 'Automatisk delning har stängts av.',
    });
  };

  const handleChannelChange = async (channelId: string) => {
    setSelectedChannelId(channelId);
    // If auto-share is already enabled, update the channel immediately
    if (autoShare?.enabled) {
      const channel = sl.channels.find(c => c.id === channelId);
      await sl.updateSettings({
        autoShareEnabled: true,
        channelId,
        channelName: channel?.name || undefined,
      });
      toast({ title: 'Kanal uppdaterad', description: `Auto-delning skickar nu till #${channel?.name}.` });
    }
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
            <div className="w-10 h-10 rounded-xl bg-muted/50 border border-border/30 flex items-center justify-center overflow-hidden p-1.5">
              <img src={slackLogo} alt="Slack" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Slack</h1>
              <p className="text-sm text-muted-foreground">Dela protokoll till Slack-kanaler</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* ── Connection Status ── */}
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3.5 sm:px-5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Anslutning</h2>
              {sl.isFullyConnected ? (
                <Badge variant="secondary" className="text-xs bg-green-500/15 text-green-700 dark:text-green-400 gap-1 px-2 py-0.5">
                  <CheckCircle2 className="w-3 h-3" />
                  Kopplad
                </Badge>
              ) : sl.needsReconnect ? (
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
                    {!isEnabled ? 'Slack-integration är inte aktiverad.' : 'Slack OAuth inte konfigurerat. Kontakta support.'}
                  </p>
                </div>
              </div>
            )}

            {/* Reconnect required */}
            {isEnabled && isConfigured && sl.needsReconnect && (
              <div className="px-4 pb-4 sm:px-5 space-y-3">
                <Separator />
                <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    Workspace behöver kopplas om
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {connectionIssue?.message || 'Slack returnerade för få behörigheter. Koppla om och godkänn alla begärda behörigheter.'}
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
                    Senaste fel: {SLACK_ERROR_CODE_LABELS[lastError.code] || lastError.message || lastError.code}
                  </p>
                )}

                <Button onClick={handleConnect} disabled={sl.state === 'connecting'} size="sm" className="gap-1.5 font-semibold">
                  {sl.state === 'connecting' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Koppla om
                </Button>
              </div>
            )}

            {/* Fully connected */}
            {isEnabled && isConfigured && sl.isFullyConnected && account && (
              <div className="px-4 pb-3.5 sm:px-5">
                <Separator className="mb-3" />
                <Collapsible open={accountOpen} onOpenChange={setAccountOpen}>
                  <CollapsibleTrigger className="w-full flex items-center justify-between py-1.5 px-1 -mx-1 rounded-lg cursor-pointer hover:bg-muted/40 transition-colors outline-none">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-foreground truncate">{account.workspaceName}</span>
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
                        {account.lastSharedAt && (
                          <div className="flex items-center justify-between px-3.5 py-2.5">
                            <span className="text-muted-foreground">Senaste delning</span>
                            <span className="text-foreground">{formatDateTime(account.lastSharedAt)}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={handleDisconnect} className="gap-1.5 h-8">
                          <Unlink className="w-3.5 h-3.5" />
                          Koppla bort
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => sl.checkStatus()} className="gap-1.5 h-8">
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
            {isEnabled && isConfigured && !sl.importStatus?.connected && !sl.needsReconnect && (
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
                  {['Koppla ditt Slack-workspace', 'Välj en standardkanal för delning', 'Protokoll delas automatiskt eller manuellt'].map((step, i) => (
                    <div key={i} className="flex items-center gap-3 py-0.5">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-primary">{i + 1}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{step}</p>
                    </div>
                  ))}
                </div>

                <Button onClick={handleConnect} disabled={sl.state === 'connecting'} size="sm" className="gap-1.5 font-semibold">
                  {sl.state === 'connecting' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                  Koppla Slack-workspace
                </Button>

                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/20 border border-border/30">
                  <Info className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Tivly skickar bara meddelanden – vi läser aldrig konversationer.
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* Connection success confirmation */}
          {showConnectedConfirm && (
            <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 flex items-start gap-3 animate-in fade-in-0 slide-in-from-top-2 duration-300">
              <div className="w-9 h-9 rounded-full bg-green-500/15 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-green-700 dark:text-green-300">Slack-workspace anslutet</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Du kan nu dela protokoll till Slack-kanaler.
                </p>
              </div>
            </div>
          )}

          {/* Auto-share settings */}
          {sl.isFullyConnected && (
            <section className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3.5 sm:px-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Send className="w-4 h-4 text-primary" />
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">Automatisk delning</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Skicka protokoll automatiskt till en Slack-kanal
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={autoShare?.enabled ?? false}
                    onCheckedChange={handleToggleAutoShare}
                    disabled={autoShareLoading}
                  />
                </div>

                {/* Channel selector */}
                <div className="mt-3 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-foreground">Standardkanal</span>
                  </div>
                  <Select
                    value={selectedChannelId || ''}
                    onValueChange={handleChannelChange}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Välj kanal..." />
                    </SelectTrigger>
                    <SelectContent>
                      {sl.channels.map(ch => (
                        <SelectItem key={ch.id} value={ch.id}>
                          <span className="flex items-center gap-1.5">
                            <Hash className="w-3 h-3 text-muted-foreground" />
                            {ch.name}
                            {ch.isPrivate && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 ml-1">Privat</Badge>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                      {sl.channels.length === 0 && (
                        <SelectItem value="_empty" disabled>
                          {sl.state === 'loading_channels' ? 'Laddar kanaler...' : 'Inga kanaler hittades'}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>

                  {sl.channels.length === 0 && sl.state !== 'loading_channels' && (
                    <Button variant="ghost" size="sm" onClick={() => sl.loadChannels()} className="gap-1.5 h-7 text-xs">
                      <RefreshCw className="w-3 h-3" />
                      Ladda kanaler
                    </Button>
                  )}
                </div>

                {/* Share stats */}
                {autoShare && (autoShare.manualSharesCount > 0 || autoShare.autoSharesCount > 0) && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-muted/30 px-3 py-2">
                        <p className="text-lg font-semibold tabular-nums">{autoShare.autoSharesCount}</p>
                        <p className="text-[10px] text-muted-foreground">Auto-delningar</p>
                      </div>
                      <div className="rounded-lg bg-muted/30 px-3 py-2">
                        <p className="text-lg font-semibold tabular-nums">{autoShare.manualSharesCount}</p>
                        <p className="text-[10px] text-muted-foreground">Manuella delningar</p>
                      </div>
                    </div>
                    {autoShare.lastSharedAt && (
                      <p className="text-[10px] text-muted-foreground/60 mt-2 flex items-center gap-1">
                        <MessageSquare className="w-2.5 h-2.5" />
                        Senast delad {formatDateTime(autoShare.lastSharedAt)}
                      </p>
                    )}
                  </div>
                )}

                {autoShare?.lastError && (
                  <div className="mt-3 p-2.5 rounded-lg bg-destructive/5 border border-destructive/20">
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {autoShare.lastError.message || autoShare.lastError.code}
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* How it works */}
          {sl.isFullyConnected && (
            <section className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3.5 sm:px-5">
                <h2 className="text-sm font-semibold text-foreground mb-3">Hur det fungerar</h2>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-primary">1</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Protokoll skapas</p>
                      <p className="text-xs text-muted-foreground">När ett mötesprotokoll genereras eller uppdateras i Tivly.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-primary">2</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Sammanfattning skickas</p>
                      <p className="text-xs text-muted-foreground">En sammanfattning med länk till hela protokollet postas i din valda Slack-kanal.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-primary">3</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Publik länk</p>
                      <p className="text-xs text-muted-foreground">Länken är unik och svårgissad — delbar med alla som har den.</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Error */}
          {sl.error && sl.state === 'error' && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm text-destructive flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {sl.error}
              </p>
              <Button variant="ghost" size="sm" onClick={sl.clearError} className="mt-2 text-xs">
                Stäng
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default IntegrationSlack;
