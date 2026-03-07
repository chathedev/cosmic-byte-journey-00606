import { useState, useEffect, useRef } from 'react';
import { Globe, Plus, CheckCircle2, XCircle, Loader2, Trash2, ExternalLink, Shield, AlertTriangle, Copy, RefreshCw, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

const API_BASE_URL = 'https://api.tivly.se';

function getToken(): string | null {
  return localStorage.getItem('authToken');
}

async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err: any = new Error(body.message || body.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = body.code;
    throw err;
  }
  return res.json();
}

export interface DomainEntry {
  hostname: string;
  kind: 'tivly_subdomain' | 'bring_your_own';
  status: 'pending' | 'verified' | 'failed' | 'removing';
  loginEnabled?: boolean;
  appEnabled?: boolean;
  primary?: boolean;
  managedBy?: string;
  verifiedAt?: string | null;
  lastCheckedAt?: string | null;
  lastError?: string | null;
  lastErrorMessage?: string | null;
  dnsRecords?: Array<{ type: string; name: string; value: string; reason?: string }>;
  dnsProvider?: string | { key?: string; label?: string; dashboardUrl?: string } | null;
  nameservers?: string[];
  vercel?: any;
}

export interface CustomDomainsConfig {
  requireCustomDomainForSso?: boolean;
  allowTivlySubdomain?: boolean;
  allowBringYourOwnDomain?: boolean;
  defaultLoginHostname?: string | null;
  domains?: DomainEntry[];
}

interface Props {
  companyId: string;
  customDomains?: CustomDomainsConfig;
  canEdit: boolean;
  onDomainsChanged?: () => void;
}

function formatTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('sv-SE') + ' ' + d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  } catch { return null; }
}

function VercelStatusBadge({ vercel }: { vercel?: any }) {
  if (!vercel) return null;
  const verified = vercel.verified === true || vercel.verification?.length === 0;
  return (
    <Badge variant="outline" className={`text-[10px] gap-0.5 ${verified ? 'border-green-300 text-green-700 dark:border-green-800 dark:text-green-400' : 'border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400'}`}>
      {verified ? <CheckCircle2 className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
      {verified ? 'DNS OK' : 'DNS väntar'}
    </Badge>
  );
}

export function EnterpriseSettingsDomains({ companyId, customDomains, canEdit, onDomainsChanged }: Props) {
  const { toast } = useToast();
  const [domains, setDomains] = useState<DomainEntry[]>(customDomains?.domains || []);
  const [defaultLogin, setDefaultLogin] = useState<string | null>(customDomains?.defaultLoginHostname || null);
  const [adding, setAdding] = useState(false);
  const [addMode, setAddMode] = useState<'tivly' | 'custom' | null>(null);
  const [hostnameInput, setHostnameInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [verifyingHost, setVerifyingHost] = useState<string | null>(null);
  const [deletingHost, setDeletingHost] = useState<string | null>(null);
  const [addResponse, setAddResponse] = useState<Record<string, any>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setDomains(customDomains?.domains || []);
    setDefaultLogin(customDomains?.defaultLoginHostname || null);
  }, [customDomains]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const hasVerifiedDomain = domains.some(d => d.status === 'verified');

  const loadDomains = async () => {
    try {
      const res = await apiFetch(`/enterprise/companies/${companyId}/settings/domains`);
      if (res.domains) setDomains(res.domains);
      if (res.defaultLoginHostname !== undefined) setDefaultLogin(res.defaultLoginHostname);
      onDomainsChanged?.();
      return res.domains as DomainEntry[];
    } catch {
      return null;
    }
  };

  const handleAddDomain = async () => {
    if (!hostnameInput.trim()) return;
    const hostname = addMode === 'tivly'
      ? (hostnameInput.trim().toLowerCase().replace(/\.tivly\.se$/, '') + '.tivly.se')
      : hostnameInput.trim().toLowerCase();

    setSaving(true);
    try {
      const res = await apiFetch(`/enterprise/companies/${companyId}/settings/domains`, {
        method: 'POST',
        body: JSON.stringify({ hostname }),
      });
      toast({ title: 'Domän tillagd', description: `${hostname} har lagts till.` });

      // Store add response for DNS instructions
      if (res.instructions || res.domain?.dnsRecords) {
        setAddResponse(prev => ({ ...prev, [hostname]: res }));
      }

      setHostnameInput('');
      setAddMode(null);
      setAdding(false);
      await loadDomains();

      // For Tivly subdomains, auto-verify after a short delay
      if (addMode === 'tivly') {
        startVerificationPoll(hostname);
      }
    } catch (err: any) {
      toast({ title: 'Fel', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const startVerificationPoll = (hostname: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 12) { // Stop after ~1 minute
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        return;
      }
      const updated = await loadDomains();
      if (updated) {
        const d = updated.find((dom: DomainEntry) => dom.hostname === hostname);
        if (d?.status === 'verified') {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          toast({ title: 'Domän verifierad!', description: `${hostname} är nu verifierad.` });
        }
      }
    }, 5000);
  };

  const handleVerify = async (hostname: string) => {
    setVerifyingHost(hostname);
    try {
      const res = await apiFetch(`/enterprise/companies/${companyId}/settings/domains/${encodeURIComponent(hostname)}/verify`, {
        method: 'POST',
      });

      const domain = res.domain;
      if (domain?.status === 'verified') {
        toast({ title: 'Domän verifierad!', description: `${hostname} är nu verifierad och redo att användas.` });
      } else if (domain?.status === 'pending') {
        const hint = domain.lastError || 'DNS har inte propagerats ännu.';
        toast({
          title: 'Verifiering ej klar',
          description: `${hint} DNS-propagering kan ta upp till 72 timmar. Försök igen om en stund.`,
        });
        // Start polling for this domain
        startVerificationPoll(hostname);
      } else if (domain?.status === 'failed') {
        toast({
          title: 'Verifiering misslyckades',
          description: domain.lastError || 'Kontrollera att DNS-posterna är korrekt konfigurerade.',
          variant: 'destructive',
        });
      }

      await loadDomains();
    } catch (err: any) {
      toast({ title: 'Verifiering misslyckades', description: err.message, variant: 'destructive' });
    } finally {
      setVerifyingHost(null);
    }
  };

  const handleDelete = async (hostname: string) => {
    setDeletingHost(hostname);
    try {
      await apiFetch(`/enterprise/companies/${companyId}/settings/domains/${encodeURIComponent(hostname)}`, {
        method: 'DELETE',
      });
      toast({ title: 'Domän borttagen' });
      setAddResponse(prev => {
        const next = { ...prev };
        delete next[hostname];
        return next;
      });
      await loadDomains();
    } catch (err: any) {
      toast({ title: 'Fel', description: err.message, variant: 'destructive' });
    } finally {
      setDeletingHost(null);
    }
  };

  const handleSetPrimary = async (hostname: string) => {
    setSaving(true);
    try {
      await apiFetch(`/enterprise/companies/${companyId}/settings/domains/${encodeURIComponent(hostname)}`, {
        method: 'PATCH',
        body: JSON.stringify({ primary: true, loginEnabled: true }),
      });
      toast({ title: 'Primär inloggningsvärd uppdaterad', description: `${hostname} är nu den primära inloggningsadressen.` });
      await loadDomains();
    } catch (err: any) {
      toast({ title: 'Fel', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: 'Kopierad till urklipp' });
    });
  };

  // Merge DNS records from domain object and add-response instructions
  const getDnsRecords = (domain: DomainEntry): Array<{ type: string; name: string; value: string; reason?: string }> => {
    // Prefer domain.dnsRecords from backend
    if (domain.dnsRecords && domain.dnsRecords.length > 0) return domain.dnsRecords;
    // Fall back to add-response instructions
    const resp = addResponse[domain.hostname];
    if (resp?.instructions?.records) return resp.instructions.records;
    if (resp?.domain?.dnsRecords) return resp.domain.dnsRecords;
    // Check Vercel verification records
    if (domain.vercel?.verification?.length > 0) {
      return domain.vercel.verification.map((v: any) => ({
        type: v.type || 'TXT',
        name: v.domain || domain.hostname,
        value: v.value || '',
        reason: v.reason || 'Vercel-verifiering',
      }));
    }
    return [];
  };

  const getDnsProvider = (domain: DomainEntry): { name: string | null; dashboardUrl: string | null } => {
    const resp = addResponse[domain.hostname];
    const dp = domain.dnsProvider;
    // dnsProvider can be a string or an object {key, label, dashboardUrl}
    const providerName = typeof dp === 'object' && dp ? (dp.label || dp.key || null) : (dp || null);
    const providerDashboard = typeof dp === 'object' && dp ? (dp.dashboardUrl || null) : null;
    return {
      name: providerName || resp?.instructions?.provider?.name || null,
      dashboardUrl: providerDashboard || resp?.instructions?.provider?.dashboardUrl || null,
    };
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Globe className="w-5 h-5 text-primary" /></div>
          <div>
            <h3 className="font-medium text-sm">Anpassade domäner</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Konfigurera arbetsytans inloggningsadress. SSO kräver en verifierad domän.
            </p>
          </div>
        </div>
        {domains.length > 0 && canEdit && (
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={loadDomains}>
            <RefreshCw className="w-3 h-3" />
          </Button>
        )}
      </div>

      {/* Info banner */}
      {!hasVerifiedDomain && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-700 dark:text-amber-300">
            <p className="font-medium">Ingen verifierad domän</p>
            <p className="mt-0.5">Lägg till och verifiera en domän för att kunna aktivera Enterprise SSO. SSO är inte tillgängligt på app.tivly.se.</p>
          </div>
        </div>
      )}

      {/* Current default login host */}
      {defaultLogin && (
        <div className="flex items-center gap-2 text-xs p-2.5 rounded-lg bg-primary/5 border border-primary/10">
          <Shield className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-muted-foreground">Primär inloggningsvärd:</span>
          <a href={`https://${defaultLogin}`} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground hover:text-primary transition-colors flex items-center gap-1">
            {defaultLogin}
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* Domain list */}
      {domains.length > 0 && (
        <div className="space-y-3">
          {domains.map(domain => {
            const isVerified = domain.status === 'verified';
            const isPending = domain.status === 'pending';
            const isFailed = domain.status === 'failed';
            const isPrimary = domain.primary || defaultLogin === domain.hostname;
            const dnsRecords = getDnsRecords(domain);
            const provider = getDnsProvider(domain);
            const lastChecked = formatTime(domain.lastCheckedAt);
            const verifiedAt = formatTime(domain.verifiedAt);
            const isPolling = verifyingHost === domain.hostname;

            return (
              <div key={domain.hostname} className={`rounded-xl border p-4 space-y-3 transition-colors ${
                isVerified ? 'border-green-200 bg-green-50/30 dark:border-green-900/50 dark:bg-green-950/10' :
                isFailed ? 'border-destructive/30 bg-destructive/5' :
                'border-border'
              }`}>
                {/* Header row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="text-sm font-medium truncate">{domain.hostname}</span>

                    {/* Status badge */}
                    {isVerified && (
                      <Badge variant="outline" className="text-[10px] gap-0.5 border-green-300 text-green-700 dark:border-green-800 dark:text-green-400">
                        <CheckCircle2 className="w-2.5 h-2.5" />Verifierad
                      </Badge>
                    )}
                    {isPending && (
                      <Badge variant="outline" className="text-[10px] gap-0.5 border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400">
                        <Clock className="w-2.5 h-2.5" />Väntar på verifiering
                      </Badge>
                    )}
                    {isFailed && (
                      <Badge variant="outline" className="text-[10px] gap-0.5 border-destructive/50 text-destructive">
                        <XCircle className="w-2.5 h-2.5" />Misslyckad
                      </Badge>
                    )}
                    {domain.status === 'removing' && (
                      <Badge variant="outline" className="text-[10px] gap-0.5 text-muted-foreground">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />Tas bort
                      </Badge>
                    )}

                    {isPrimary && isVerified && (
                      <Badge className="text-[9px] px-1.5 py-0 h-4 bg-primary/15 text-primary border-0">Primär</Badge>
                    )}

                    <Badge variant="outline" className="text-[10px] text-muted-foreground border-border">
                      {domain.kind === 'tivly_subdomain' ? 'Tivly-subdomän' : 'Egen domän'}
                    </Badge>

                    <VercelStatusBadge vercel={domain.vercel} />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {!isVerified && canEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => handleVerify(domain.hostname)}
                        disabled={isPolling}
                      >
                        {isPolling ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        Verifiera
                      </Button>
                    )}
                    {isVerified && !isPrimary && canEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => handleSetPrimary(domain.hostname)}
                        disabled={saving}
                      >
                        <Shield className="w-3 h-3" />
                        Sätt som primär
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(domain.hostname)}
                        disabled={deletingHost === domain.hostname}
                      >
                        {deletingHost === domain.hostname ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Verification metadata */}
                {(verifiedAt || lastChecked) && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                    {verifiedAt && <span>Verifierad: {verifiedAt}</span>}
                    {lastChecked && <span>Senast kontrollerad: {lastChecked}</span>}
                  </div>
                )}

                {/* Error message */}
                {domain.lastError && (
                  <div className="flex items-start gap-2 p-2.5 rounded-lg border border-destructive/20 bg-destructive/5">
                    <XCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                    <div className="text-[11px] text-destructive space-y-1">
                      <p>{domain.lastError}</p>
                      {isFailed && domain.kind === 'bring_your_own' && (
                        <p className="text-muted-foreground">Kontrollera att DNS-posterna nedan är korrekt konfigurerade hos din domänleverantör.</p>
                      )}
                    </div>
                  </div>
                )}

                {/* DNS Records — show for all non-verified domains that have records */}
                {!isVerified && dnsRecords.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-medium text-muted-foreground">
                      {domain.kind === 'tivly_subdomain' ? 'Verifieringsposter:' : 'DNS-poster att konfigurera:'}
                    </p>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <table className="w-full text-[11px]">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left px-2.5 py-1.5 font-medium text-muted-foreground w-16">Typ</th>
                            <th className="text-left px-2.5 py-1.5 font-medium text-muted-foreground">Namn</th>
                            <th className="text-left px-2.5 py-1.5 font-medium text-muted-foreground">Värde</th>
                            {domain.kind === 'bring_your_own' && (
                              <th className="text-left px-2.5 py-1.5 font-medium text-muted-foreground w-20">Syfte</th>
                            )}
                            <th className="w-8"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {dnsRecords.map((rec, i) => (
                            <tr key={i} className="border-t border-border">
                              <td className="px-2.5 py-2 font-mono font-medium">{rec.type}</td>
                              <td className="px-2.5 py-2 font-mono text-muted-foreground truncate max-w-[140px]" title={rec.name}>{rec.name}</td>
                              <td className="px-2.5 py-2 font-mono truncate max-w-[200px]" title={rec.value}>{rec.value}</td>
                              {domain.kind === 'bring_your_own' && (
                                <td className="px-2.5 py-2 text-muted-foreground">{rec.reason || '—'}</td>
                              )}
                              <td className="px-1 py-2">
                                <button onClick={() => copyToClipboard(rec.value)} className="p-1 hover:bg-muted rounded transition-colors" title="Kopiera värde">
                                  <Copy className="w-3 h-3 text-muted-foreground" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* DNS provider info */}
                    {(provider.name || provider.dashboardUrl) && (
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        {provider.name && <span>DNS-leverantör: <span className="font-medium text-foreground">{provider.name}</span></span>}
                        {provider.dashboardUrl && (
                          <a
                            href={provider.dashboardUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
                          >
                            Öppna DNS-hantering <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                    )}

                    {/* Nameservers */}
                    {domain.nameservers && domain.nameservers.length > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        Namnservrar: {domain.nameservers.join(', ')}
                      </p>
                    )}

                    {/* Help text */}
                    {domain.kind === 'bring_your_own' && (
                      <div className="flex items-start gap-1.5 p-2.5 rounded-lg bg-muted/30 border border-border">
                        <AlertTriangle className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                          Lägg till ovanstående DNS-poster hos din domänleverantör. DNS-propagering kan ta upp till 72 timmar. Klicka på "Verifiera" efter att posterna lagts till.
                        </p>
                      </div>
                    )}

                    {domain.kind === 'tivly_subdomain' && isPending && (
                      <p className="text-[10px] text-muted-foreground italic">
                        Tivly-subdomäner verifieras vanligtvis automatiskt inom några minuter.
                      </p>
                    )}
                  </div>
                )}

                {/* Verified success state */}
                {isVerified && (
                  <div className="flex items-center gap-2 text-[11px] text-green-700 dark:text-green-400">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Domänen är verifierad och redo att användas{isPrimary ? ' som primär inloggningsvärd' : ''}.</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add domain */}
      {canEdit && !adding && (
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setAdding(true)}>
          <Plus className="w-3.5 h-3.5" />Lägg till domän
        </Button>
      )}

      {adding && !addMode && (
        <div className="space-y-3 p-4 rounded-xl border border-border bg-muted/20">
          <p className="text-xs font-medium">Välj domäntyp</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setAddMode('tivly')}
              className="p-3 rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-colors text-left space-y-1"
            >
              <p className="text-xs font-medium">Tivly-subdomän</p>
              <p className="text-[10px] text-muted-foreground">foretag.tivly.se — ingen DNS-ändring behövs</p>
            </button>
            <button
              onClick={() => setAddMode('custom')}
              className="p-3 rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-colors text-left space-y-1"
            >
              <p className="text-xs font-medium">Egen domän</p>
              <p className="text-[10px] text-muted-foreground">workspace.foretag.se — kräver DNS-konfiguration</p>
            </button>
          </div>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setAdding(false)}>
            Avbryt
          </Button>
        </div>
      )}

      {adding && addMode && (
        <div className="space-y-3 p-4 rounded-xl border border-border bg-muted/20">
          <Label className="text-xs font-medium">
            {addMode === 'tivly' ? 'Välj subdomännamn' : 'Ange domännamn'}
          </Label>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-0">
              <Input
                value={hostnameInput}
                onChange={e => setHostnameInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddDomain()}
                placeholder={addMode === 'tivly' ? 'foretag' : 'workspace.foretag.se'}
                className="h-9 text-sm rounded-r-none"
                autoFocus
              />
              {addMode === 'tivly' && (
                <span className="h-9 px-3 flex items-center text-xs text-muted-foreground bg-muted border border-l-0 border-border rounded-r-md">.tivly.se</span>
              )}
            </div>
            <Button size="sm" className="h-9 text-xs px-4" onClick={handleAddDomain} disabled={saving || !hostnameInput.trim()}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Lägg till'}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            {addMode === 'tivly'
              ? 'Tivly-subdomäner konfigureras automatiskt. Ingen DNS-ändring behövs. Verifiering sker inom några minuter.'
              : 'Du behöver lägga till DNS-poster hos din domänleverantör. Instruktioner visas efter att domänen lagts till.'}
          </p>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setAddMode(null); setAdding(false); setHostnameInput(''); }}>
            Avbryt
          </Button>
        </div>
      )}
    </div>
  );
}
