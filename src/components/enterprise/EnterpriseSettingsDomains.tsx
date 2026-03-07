import { useState, useEffect } from 'react';
import { Globe, Plus, CheckCircle2, XCircle, Loader2, Trash2, ExternalLink, Shield, AlertTriangle, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
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
  dnsRecords?: Array<{ type: string; name: string; value: string; reason?: string }>;
  dnsProvider?: string | null;
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

const STATUS_MAP: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  verified: { label: 'Verifierad', color: 'border-green-300 text-green-700 dark:border-green-800 dark:text-green-400', icon: CheckCircle2 },
  pending: { label: 'Väntar', color: 'border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400', icon: Loader2 },
  failed: { label: 'Misslyckad', color: 'border-destructive/50 text-destructive', icon: XCircle },
  removing: { label: 'Tas bort', color: 'border-muted-foreground text-muted-foreground', icon: Loader2 },
};

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
  const [dnsInstructions, setDnsInstructions] = useState<Record<string, any>>({});

  useEffect(() => {
    setDomains(customDomains?.domains || []);
    setDefaultLogin(customDomains?.defaultLoginHostname || null);
  }, [customDomains]);

  const hasVerifiedDomain = domains.some(d => d.status === 'verified');

  const loadDomains = async () => {
    try {
      const res = await apiFetch(`/enterprise/companies/${companyId}/settings/domains`);
      if (res.domains) setDomains(res.domains);
      if (res.defaultLoginHostname !== undefined) setDefaultLogin(res.defaultLoginHostname);
      onDomainsChanged?.();
    } catch {}
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
      if (res.domain?.dnsRecords) {
        setDnsInstructions(prev => ({ ...prev, [hostname]: res }));
      }
      setHostnameInput('');
      setAddMode(null);
      setAdding(false);
      await loadDomains();
    } catch (err: any) {
      toast({ title: 'Fel', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async (hostname: string) => {
    setVerifyingHost(hostname);
    try {
      const res = await apiFetch(`/enterprise/companies/${companyId}/settings/domains/${encodeURIComponent(hostname)}/verify`, {
        method: 'POST',
      });
      if (res.domain?.status === 'verified') {
        toast({ title: 'Domän verifierad!', description: `${hostname} är nu verifierad och redo att användas.` });
      } else {
        toast({ title: 'Verifiering pågår', description: res.domain?.lastError || 'DNS har inte propagerats ännu. Försök igen om en stund.' });
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
      toast({ title: 'Primär inloggningsvärd uppdaterad' });
      await loadDomains();
    } catch (err: any) {
      toast({ title: 'Fel', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: 'Kopierad!' });
    });
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
          <span className="font-medium text-foreground">{defaultLogin}</span>
        </div>
      )}

      {/* Domain list */}
      {domains.length > 0 && (
        <div className="space-y-3">
          {domains.map(domain => {
            const status = STATUS_MAP[domain.status] || STATUS_MAP.pending;
            const StatusIcon = status.icon;
            const isVerified = domain.status === 'verified';
            const isPrimary = domain.primary || defaultLogin === domain.hostname;
            const instructions = dnsInstructions[domain.hostname];

            return (
              <div key={domain.hostname} className={`rounded-lg border p-3 space-y-2 ${isVerified ? 'border-green-200 dark:border-green-900/50' : 'border-border'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{domain.hostname}</span>
                    <Badge variant="outline" className={`text-[10px] gap-0.5 ${status.color}`}>
                      <StatusIcon className={`w-2.5 h-2.5 ${domain.status === 'pending' ? 'animate-spin' : ''}`} />
                      {status.label}
                    </Badge>
                    {isPrimary && (
                      <Badge className="text-[9px] px-1.5 py-0 h-4 bg-primary/15 text-primary border-0">Primär</Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] text-muted-foreground border-border">
                      {domain.kind === 'tivly_subdomain' ? 'Tivly-subdomän' : 'Egen domän'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    {!isVerified && canEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => handleVerify(domain.hostname)}
                        disabled={verifyingHost === domain.hostname}
                      >
                        {verifyingHost === domain.hostname ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
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

                {/* DNS records for bring-your-own */}
                {domain.kind === 'bring_your_own' && !isVerified && domain.dnsRecords && domain.dnsRecords.length > 0 && (
                  <div className="mt-2 space-y-2">
                    <p className="text-[11px] font-medium text-muted-foreground">DNS-poster att lägga till:</p>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <table className="w-full text-[11px]">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Typ</th>
                            <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Namn</th>
                            <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Värde</th>
                            <th className="w-8"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {domain.dnsRecords.map((rec, i) => (
                            <tr key={i} className="border-t border-border">
                              <td className="px-2 py-1.5 font-mono">{rec.type}</td>
                              <td className="px-2 py-1.5 font-mono truncate max-w-[120px]">{rec.name}</td>
                              <td className="px-2 py-1.5 font-mono truncate max-w-[180px]">{rec.value}</td>
                              <td className="px-1 py-1.5">
                                <button onClick={() => copyToClipboard(rec.value)} className="p-1 hover:bg-muted rounded">
                                  <Copy className="w-3 h-3 text-muted-foreground" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {domain.dnsProvider && (
                      <p className="text-[10px] text-muted-foreground">
                        DNS-leverantör: <span className="font-medium">{domain.dnsProvider}</span>
                      </p>
                    )}
                  </div>
                )}

                {/* Inline DNS from add response */}
                {instructions?.instructions?.records && !isVerified && (
                  <div className="mt-2 space-y-2">
                    <p className="text-[11px] font-medium text-muted-foreground">Lägg till dessa DNS-poster:</p>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <table className="w-full text-[11px]">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Typ</th>
                            <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Namn</th>
                            <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Värde</th>
                          </tr>
                        </thead>
                        <tbody>
                          {instructions.instructions.records.map((rec: any, i: number) => (
                            <tr key={i} className="border-t border-border">
                              <td className="px-2 py-1.5 font-mono">{rec.type}</td>
                              <td className="px-2 py-1.5 font-mono">{rec.name}</td>
                              <td className="px-2 py-1.5 font-mono truncate max-w-[180px]">
                                <button onClick={() => copyToClipboard(rec.value)} className="hover:text-primary flex items-center gap-1">
                                  {rec.value} <Copy className="w-2.5 h-2.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {instructions.instructions?.provider?.dashboardUrl && (
                      <a
                        href={instructions.instructions.provider.dashboardUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80"
                      >
                        Öppna DNS-hantering <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                )}

                {domain.lastError && (
                  <div className="flex items-start gap-1.5 text-[11px] text-destructive">
                    <XCircle className="w-3 h-3 mt-0.5 shrink-0" />
                    {domain.lastError}
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
        <div className="space-y-2 p-3 rounded-lg border border-border bg-muted/20">
          <p className="text-xs font-medium">Välj typ</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="text-xs flex-1" onClick={() => setAddMode('tivly')}>
              Tivly-subdomän (*.tivly.se)
            </Button>
            <Button variant="outline" size="sm" className="text-xs flex-1" onClick={() => setAddMode('custom')}>
              Egen domän
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setAdding(false)}>
            Avbryt
          </Button>
        </div>
      )}

      {adding && addMode && (
        <div className="space-y-2 p-3 rounded-lg border border-border bg-muted/20">
          <Label className="text-xs text-muted-foreground">
            {addMode === 'tivly' ? 'Subdomännamn' : 'Domännamn'}
          </Label>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-0">
              <Input
                value={hostnameInput}
                onChange={e => setHostnameInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddDomain()}
                placeholder={addMode === 'tivly' ? 'foretag' : 'workspace.foretag.se'}
                className="h-8 text-sm rounded-r-none"
              />
              {addMode === 'tivly' && (
                <span className="h-8 px-2 flex items-center text-xs text-muted-foreground bg-muted border border-l-0 border-border rounded-r-md">.tivly.se</span>
              )}
            </div>
            <Button size="sm" className="h-8 text-xs" onClick={handleAddDomain} disabled={saving || !hostnameInput.trim()}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Lägg till'}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {addMode === 'tivly'
              ? 'Tivly-subdomäner konfigureras automatiskt. Ingen DNS-ändring behövs.'
              : 'Du behöver lägga till DNS-poster hos din domänleverantör efter att domänen lagts till.'}
          </p>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => { setAddMode(null); setAdding(false); setHostnameInput(''); }}>
            Avbryt
          </Button>
        </div>
      )}
    </div>
  );
}
