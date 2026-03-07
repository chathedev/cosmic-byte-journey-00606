import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Globe, Plus, CheckCircle2, XCircle, Loader2, Trash2, ExternalLink,
  Shield, AlertTriangle, Copy, RefreshCw, Clock, Mail, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DomainOnboarding {
  tenantId?: string;
  hostname?: string;
  apexDomain?: string;
  hostLabel?: string;
  verificationToken?: string;
  status?: 'pending' | 'awaiting_dns' | 'verifying' | 'active' | 'failed';
  setupMethod?: 'manual' | null;
  domainConnect?: any;
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
  onboarding?: DomainOnboarding;
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('sv-SE') + ' ' + d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  } catch { return null; }
}

function getErrorText(domain: DomainEntry): string | null {
  if (typeof domain.lastError === 'string' && domain.lastError) return domain.lastError;
  if (domain.lastErrorMessage) return domain.lastErrorMessage;
  return null;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: 'Väntar på DNS', color: 'text-amber-600 dark:text-amber-400' },
  awaiting_dns: { label: 'Väntar på DNS', color: 'text-amber-600 dark:text-amber-400' },
  verifying: { label: 'Verifierar…', color: 'text-blue-600 dark:text-blue-400' },
  active: { label: 'Aktiv', color: 'text-green-600 dark:text-green-400' },
  failed: { label: 'Åtgärd krävs', color: 'text-destructive' },
};

function getOnboardingProgress(status?: string): number {
  if (!status) return 0;
  if (status === 'active') return 100;
  if (status === 'failed') return 0;
  const steps = ['pending', 'awaiting_dns', 'verifying', 'active'];
  const idx = steps.indexOf(status);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / steps.length) * 100);
}

function statusIcon(domain: DomainEntry, size = 'w-3.5 h-3.5') {
  if (isDomainVerified(domain)) return <CheckCircle2 className={`${size} text-green-600 dark:text-green-400`} />;
  if (domain.status === 'failed') return <XCircle className={`${size} text-destructive`} />;
  if (domain.status === 'removing') return <Loader2 className={`${size} animate-spin text-muted-foreground`} />;
  const ob = domain.onboarding;
  if (ob?.status === 'verifying') return <Loader2 className={`${size} animate-spin text-blue-500`} />;
  return <Clock className={`${size} text-amber-500`} />;
}

function isDomainVerified(domain: DomainEntry): boolean {
  return domain.status === 'verified' || domain.onboarding?.status === 'active';
}

function domainStatusLabel(domain: DomainEntry): string {
  if (isDomainVerified(domain)) return 'Verifierad';
  if (domain.status === 'failed') return 'Misslyckad';
  if (domain.status === 'removing') return 'Tas bort';
  const ob = domain.onboarding;
  if (ob?.status) return STATUS_MAP[ob.status]?.label || 'Väntar';
  return 'Väntar på DNS';
}

// ─── Send to IT email helper ─────────────────────────────────────────────────

function buildITEmailMailto(hostname: string, records: Array<{ type: string; name: string; value: string; reason?: string }>) {
  const subject = encodeURIComponent(`DNS-konfiguration krävs för ${hostname}`);
  const recordLines = records.map(r =>
    `  Typ: ${r.type}\n  Namn: ${r.name}\n  Värde: ${r.value}${r.reason ? `\n  Syfte: ${r.reason}` : ''}`
  ).join('\n\n');
  const body = encodeURIComponent(
`Hej,

Vi håller på att konfigurera en anpassad domän för vår arbetsyta i Tivly.

Kan du lägga till följande DNS-poster för domänen ${hostname}?

${recordLines}

När posterna är tillagda kommer Tivly att verifiera domänen automatiskt i bakgrunden. DNS-propagering kan ta upp till 72 timmar.

Du behöver inte göra något mer efter att posterna är tillagda — vi får ett mejl från Tivly när domänen är redo.

Tack på förhand!`
  );
  return `mailto:?subject=${subject}&body=${body}`;
}

// ─── Resolve DNS records from domain + response ─────────────────────────────

function resolveDnsRecords(domain: DomainEntry, addResponse: Record<string, any>): Array<{ type: string; name: string; value: string; reason?: string }> {
  if (domain.dnsRecords?.length) return domain.dnsRecords;
  const resp = addResponse[domain.hostname];
  if (resp?.instructions?.records) return resp.instructions.records;
  if (resp?.domain?.dnsRecords) return resp.domain.dnsRecords;
  // Build from onboarding
  const ob = domain.onboarding || resp?.onboarding;
  const records: Array<{ type: string; name: string; value: string; reason?: string }> = [];
  if (ob?.hostname) {
    records.push({ type: 'CNAME', name: ob.hostLabel || ob.hostname, value: 'cname.vercel-dns.com', reason: 'Pekar domänen till Tivly' });
  }
  if (ob?.verificationToken) {
    records.push({ type: 'TXT', name: `_tivly.${ob.apexDomain || ob.hostname}`, value: ob.verificationToken, reason: 'Verifierar ägarskap' });
  }
  // Vercel fallback
  if (records.length === 0 && domain.vercel?.verification?.length > 0) {
    return domain.vercel.verification.map((v: any) => ({
      type: v.type || 'TXT', name: v.domain || domain.hostname, value: v.value || '', reason: v.reason || 'Vercel-verifiering',
    }));
  }
  return records;
}

function resolveProvider(domain: DomainEntry, addResponse: Record<string, any>) {
  const resp = addResponse[domain.hostname];
  const dp = domain.dnsProvider;
  const name = typeof dp === 'object' && dp ? (dp.label || dp.key || null) : (dp || null);
  const url = typeof dp === 'object' && dp ? (dp.dashboardUrl || null) : null;
  return {
    name: name || resp?.instructions?.provider?.name || null,
    dashboardUrl: url || resp?.instructions?.provider?.dashboardUrl || null,
  };
}

// ─── Inline Domain Detail ────────────────────────────────────────────────────

function DomainInlineDetail({
  domain, companyId, canEdit, defaultLogin, addResponse,
  onVerify, onDelete, onSetPrimary, verifyingHost, deletingHost, saving,
}: {
  domain: DomainEntry;
  companyId: string;
  canEdit: boolean;
  defaultLogin: string | null;
  addResponse: Record<string, any>;
  onVerify: (h: string) => void;
  onDelete: (h: string) => void;
  onSetPrimary: (h: string) => void;
  verifyingHost: string | null;
  deletingHost: string | null;
  saving: boolean;
}) {
  const { toast } = useToast();
  const isVerified = isDomainVerified(domain);
  const isFailed = domain.status === 'failed';
  const isPrimary = domain.primary || defaultLogin === domain.hostname;
  const isPolling = verifyingHost === domain.hostname;
  const errorText = getErrorText(domain);

  const ob = domain.onboarding;
  const obStatus = isVerified ? 'active' : (ob?.status || 'pending');
  const progress = getOnboardingProgress(obStatus);
  const dnsRecords = resolveDnsRecords(domain, addResponse);
  const provider = resolveProvider(domain, addResponse);
  const needsDns = !isVerified && domain.kind !== 'tivly_subdomain';

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast({ title: 'Kopierad' }));
  };

  return (
    <div className="space-y-3 pt-1">
      {/* Verified state */}
      {isVerified && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/50 text-xs text-green-700 dark:text-green-400">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Domänen är verifierad och redo att användas.</span>
          {domain.verifiedAt && <span className="ml-auto text-[10px] opacity-70">{formatTime(domain.verifiedAt)}</span>}
        </div>
      )}

      {/* Progress bar for non-verified */}
      {!isVerified && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className={`font-medium ${STATUS_MAP[obStatus]?.color || 'text-muted-foreground'}`}>
              {STATUS_MAP[obStatus]?.label || 'Väntar'}
            </span>
            <span className="text-[10px] text-muted-foreground">{progress}%</span>
          </div>
          <Progress value={progress} className="h-1" />
        </div>
      )}

      {/* Error */}
      {(isFailed || ob?.status === 'failed') && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg border border-destructive/20 bg-destructive/5 text-[11px] text-destructive">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{errorText || 'Konfigurationen misslyckades. Kontrollera DNS-posterna.'}</span>
        </div>
      )}

      {/* DNS records for non-verified custom domains */}
      {needsDns && dnsRecords.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Lägg till DNS-posterna nedan hos din DNS-leverantör. När posterna har slagit igenom verifierar Tivly domänen automatiskt.
          </p>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-[11px]">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left px-2.5 py-1.5 font-medium text-muted-foreground w-14">Typ</th>
                  <th className="text-left px-2.5 py-1.5 font-medium text-muted-foreground">Namn</th>
                  <th className="text-left px-2.5 py-1.5 font-medium text-muted-foreground">Värde</th>
                  <th className="w-7"></th>
                </tr>
              </thead>
              <tbody>
                {dnsRecords.map((rec, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-2.5 py-2 font-mono font-medium">{rec.type}</td>
                    <td className="px-2.5 py-2 font-mono text-muted-foreground truncate max-w-[120px]" title={rec.name}>{rec.name}</td>
                    <td className="px-2.5 py-2 font-mono truncate max-w-[160px]" title={rec.value}>{rec.value}</td>
                    <td className="px-1 py-2">
                      <button onClick={() => copyToClipboard(rec.value)} className="p-1 hover:bg-muted rounded transition-colors" title="Kopiera">
                        <Copy className="w-3 h-3 text-muted-foreground" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Provider link */}
          {(provider.name || provider.dashboardUrl) && (
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              {provider.name && <span>DNS-leverantör: <span className="font-medium text-foreground">{provider.name}</span></span>}
              {provider.dashboardUrl && (
                <a href={provider.dashboardUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:text-primary/80">
                  Öppna <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>
          )}

          {/* Send to IT */}
          <div className="flex items-center gap-3 pt-1">
            <a
              href={buildITEmailMailto(domain.hostname, dnsRecords)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-background text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              <Mail className="w-3.5 h-3.5 text-primary" />
              Skicka DNS-instruktioner till IT
            </a>
          </div>

          {/* Helpful note about email notification */}
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Tivly verifierar domänen automatiskt i bakgrunden (ungefär var 45:e sekund). Du får ett mejl när domänen är verifierad och klar att använda. Du kan också klicka <strong>Verifiera</strong> för att kontrollera direkt.
          </p>
        </div>
      )}

      {/* Tivly subdomain waiting */}
      {!isVerified && domain.kind === 'tivly_subdomain' && (
        <p className="text-[10px] text-muted-foreground">
          Tivly-subdomäner konfigureras automatiskt. Du får ett mejl när domänen är klar.
        </p>
      )}

      {/* Metadata */}
      {domain.lastCheckedAt && (
        <p className="text-[10px] text-muted-foreground">Senast kontrollerad: {formatTime(domain.lastCheckedAt)}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        {canEdit && !isVerified && (
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => onVerify(domain.hostname)} disabled={isPolling}>
            {isPolling ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Verifiera
          </Button>
        )}
        {canEdit && isVerified && !isPrimary && (
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => onSetPrimary(domain.hostname)} disabled={saving}>
            <Shield className="w-3 h-3" />Sätt som primär
          </Button>
        )}
        {canEdit && (
          <Button
            variant="ghost" size="sm"
            className="h-7 gap-1 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto"
            onClick={() => onDelete(domain.hostname)}
            disabled={deletingHost === domain.hostname}
          >
            {deletingHost === domain.hostname ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            Ta bort
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function EnterpriseSettingsDomains({ companyId, customDomains, canEdit, onDomainsChanged }: Props) {
  const { toast } = useToast();
  const [domains, setDomains] = useState<DomainEntry[]>(customDomains?.domains || []);
  const [defaultLogin, setDefaultLogin] = useState<string | null>(customDomains?.defaultLoginHostname || null);
  const [saving, setSaving] = useState(false);
  const [verifyingHost, setVerifyingHost] = useState<string | null>(null);
  const [deletingHost, setDeletingHost] = useState<string | null>(null);
  const [addResponse, setAddResponse] = useState<Record<string, any>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Inline add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addMode, setAddMode] = useState<'tivly' | 'custom' | null>(null);
  const [hostnameInput, setHostnameInput] = useState('');
  const [adding, setAdding] = useState(false);

  // Expandable domain detail
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);

  useEffect(() => {
    setDomains(customDomains?.domains || []);
    setDefaultLogin(customDomains?.defaultLoginHostname || null);
  }, [customDomains]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Auto-poll for any pending domains (every 3s)
  useEffect(() => {
    const hasPending = domains.some(d => !isDomainVerified(d) && d.status !== 'removing');
    if (!hasPending) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    if (pollRef.current) return; // already polling
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch(`/enterprise/companies/${companyId}/settings/domains`);
        const newDomains = res.customDomains?.domains || res.domains || [];
        const newDefault = res.customDomains?.defaultLoginHostname ?? res.defaultLoginHostname;
        if (newDomains.length > 0 || res.customDomains) {
          const oldDomains = domains;
          setDomains(newDomains);
          if (newDefault !== undefined) setDefaultLogin(newDefault);
          for (const d of newDomains as DomainEntry[]) {
            const old = oldDomains.find(od => od.hostname === d.hostname);
            if (isDomainVerified(d) && old && !isDomainVerified(old)) {
              toast({ title: 'Domän verifierad!', description: `${d.hostname} är nu klar att använda.` });
            }
          }
        }
      } catch { /* silent */ }
    }, 3000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [domains, companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasVerifiedDomain = domains.some(d => isDomainVerified(d));

  const refreshDomains = useCallback(async () => {
    try {
      const res = await apiFetch(`/enterprise/companies/${companyId}/settings/domains`);
      if (res.domains) setDomains(res.domains);
      if (res.defaultLoginHostname !== undefined) setDefaultLogin(res.defaultLoginHostname);
      return res.domains as DomainEntry[];
    } catch { return null; }
  }, [companyId]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await refreshDomains();
    setRefreshing(false);
  };

  const handleAdd = async () => {
    if (!hostnameInput.trim()) return;
    const hostname = addMode === 'tivly'
      ? (hostnameInput.trim().toLowerCase().replace(/\.tivly\.se$/, '') + '.tivly.se')
      : hostnameInput.trim().toLowerCase();
    setAdding(true);
    try {
      const res = await apiFetch(`/enterprise/companies/${companyId}/settings/domains`, {
        method: 'POST', body: JSON.stringify({ hostname }),
      });
      // Optimistic: add to UI immediately from response
      const newDomain: DomainEntry = res.domain || {
        hostname, kind: addMode === 'tivly' ? 'tivly_subdomain' : 'bring_your_own',
        status: 'pending', onboarding: res.onboarding || { status: 'pending' },
      };
      setDomains(prev => {
        if (prev.some(d => d.hostname === hostname)) return prev;
        return [...prev, newDomain];
      });
      if (res.instructions || res.domain?.dnsRecords || res.onboarding) {
        setAddResponse(prev => ({ ...prev, [hostname]: res }));
      }
      toast({ title: 'Domän tillagd', description: `${hostname} har lagts till.` });
      setExpandedDomain(hostname);
      setShowAddForm(false);
      setAddMode(null);
      setHostnameInput('');
      // Background sync
      refreshDomains();
    } catch (err: any) {
      toast({ title: 'Fel', description: err.message, variant: 'destructive' });
    } finally { setAdding(false); }
  };

  const handleVerify = async (hostname: string) => {
    setVerifyingHost(hostname);
    try {
      const res = await apiFetch(`/enterprise/companies/${companyId}/settings/domains/${encodeURIComponent(hostname)}/verify`, { method: 'POST' });
      const d = res.domain;
      if (d) {
        // Optimistic: update domain in-place from response
        setDomains(prev => prev.map(dom => dom.hostname === hostname ? { ...dom, ...d } : dom));
      }
      if (d?.status === 'verified') {
        toast({ title: 'Domän verifierad!', description: `${hostname} är nu klar.` });
      } else if (d?.status === 'pending') {
        toast({ title: 'Inte klar ännu', description: getErrorText(d) || 'DNS har inte propagerats ännu. Tivly kontrollerar automatiskt.' });
      } else if (d?.status === 'failed') {
        toast({ title: 'Verifiering misslyckades', description: getErrorText(d) || 'Kontrollera DNS-posterna.', variant: 'destructive' });
      }
      // Background sync
      refreshDomains();
    } catch (err: any) {
      toast({ title: 'Verifiering misslyckades', description: err.message, variant: 'destructive' });
    } finally { setVerifyingHost(null); }
  };

  const handleDelete = async (hostname: string) => {
    setDeletingHost(hostname);
    try {
      await apiFetch(`/enterprise/companies/${companyId}/settings/domains/${encodeURIComponent(hostname)}`, { method: 'DELETE' });
      // Optimistic: remove from UI immediately
      setDomains(prev => prev.filter(d => d.hostname !== hostname));
      setAddResponse(prev => { const next = { ...prev }; delete next[hostname]; return next; });
      if (expandedDomain === hostname) setExpandedDomain(null);
      if (defaultLogin === hostname) setDefaultLogin(null);
      toast({ title: 'Domän borttagen' });
      // Background sync to ensure consistency
      refreshDomains();
    } catch (err: any) {
      toast({ title: 'Fel', description: err.message, variant: 'destructive' });
      // Revert on error by re-fetching
      await refreshDomains();
    } finally { setDeletingHost(null); }
  };

  const handleSetPrimary = async (hostname: string) => {
    setSaving(true);
    try {
      await apiFetch(`/enterprise/companies/${companyId}/settings/domains/${encodeURIComponent(hostname)}`, {
        method: 'PATCH', body: JSON.stringify({ primary: true, loginEnabled: true }),
      });
      // Optimistic update
      setDefaultLogin(hostname);
      toast({ title: 'Primär inloggningsvärd uppdaterad' });
      refreshDomains();
    } catch (err: any) {
      toast({ title: 'Fel', description: err.message, variant: 'destructive' });
      await refreshDomains();
    } finally { setSaving(false); }
  };

  const toggleExpand = (hostname: string) => {
    setExpandedDomain(prev => prev === hostname ? null : hostname);
  };

  const startAddFlow = () => {
    setShowAddForm(true);
    setAddMode(null);
    setHostnameInput('');
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Globe className="w-5 h-5 text-primary" /></div>
          <div>
            <h3 className="font-medium text-sm">Anpassade domäner</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Konfigurera arbetsytans inloggningsadress</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {domains.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" onClick={handleManualRefresh} disabled={refreshing}>
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          )}
          {canEdit && !showAddForm && (
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={startAddFlow}>
              <Plus className="w-3.5 h-3.5" />Lägg till
            </Button>
          )}
        </div>
      </div>

      {/* No verified domain warning */}
      {!hasVerifiedDomain && domains.length > 0 && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            Ingen verifierad domän ännu. Lägg till DNS-posterna och vänta på verifiering för att aktivera Enterprise SSO.
          </p>
        </div>
      )}

      {/* Primary domain indicator */}
      {defaultLogin && (
        <div className="flex items-center gap-2 text-xs p-2.5 rounded-lg bg-primary/5 border border-primary/10">
          <Shield className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-muted-foreground">Primär:</span>
          <a href={`https://${defaultLogin}`} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground hover:text-primary transition-colors flex items-center gap-1">
            {defaultLogin}<ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* Inline add form */}
      {showAddForm && (
        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
          {!addMode ? (
            <>
              <p className="text-xs font-medium">Välj domäntyp</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setAddMode('tivly')}
                  className="flex flex-col items-start gap-1 p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors text-left"
                >
                  <div className="flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-medium">Tivly-subdomän</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">foretag.tivly.se</span>
                </button>
                <button
                  onClick={() => setAddMode('custom')}
                  className="flex flex-col items-start gap-1 p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors text-left"
                >
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-medium">Egen domän</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">portal.foretag.se</span>
                </button>
              </div>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setShowAddForm(false)}>Avbryt</Button>
            </>
          ) : (
            <>
              <Label className="text-xs">{addMode === 'tivly' ? 'Subdomännamn' : 'Domännamn'}</Label>
              <div className="flex items-center gap-2">
                <div className="flex items-center flex-1">
                  <Input
                    value={hostnameInput}
                    onChange={e => setHostnameInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    placeholder={addMode === 'tivly' ? 'foretag' : 'portal.foretag.se'}
                    className={`h-8 text-sm ${addMode === 'tivly' ? 'rounded-r-none' : ''}`}
                    autoFocus
                  />
                  {addMode === 'tivly' && (
                    <span className="h-8 px-2 flex items-center text-[11px] text-muted-foreground bg-muted border border-l-0 border-input rounded-r-md">.tivly.se</span>
                  )}
                </div>
                <Button size="sm" className="h-8 text-xs gap-1" onClick={handleAdd} disabled={adding || !hostnameInput.trim()}>
                  {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  {adding ? 'Lägger till…' : 'Lägg till'}
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7" onClick={() => setAddMode(null)}>← Tillbaka</Button>
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-7" onClick={() => { setShowAddForm(false); setAddMode(null); setHostnameInput(''); }}>Avbryt</Button>
              </div>
              {addMode === 'custom' && (
                <p className="text-[10px] text-muted-foreground">
                  Egen domän kräver DNS-konfiguration. Du får exakta instruktioner efter att domänen lagts till.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Domain list */}
      {domains.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
          {domains.map(domain => {
            const isPrimary = domain.primary || defaultLogin === domain.hostname;
            const isExpanded = expandedDomain === domain.hostname;
            return (
              <div key={domain.hostname}>
                <button
                  onClick={() => toggleExpand(domain.hostname)}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-muted/40 transition-colors"
                >
                  {statusIcon(domain)}
                  <span className="text-sm font-mono truncate flex-1 min-w-0">{domain.hostname}</span>
                  {isPrimary && domain.status === 'verified' && (
                    <Badge className="text-[9px] px-1.5 py-0 h-4 bg-primary/15 text-primary border-0 shrink-0">Primär</Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground shrink-0">{domainStatusLabel(domain)}</span>
                  {isExpanded ? <ChevronUp className="w-3 h-3 text-muted-foreground/50 shrink-0" /> : <ChevronDown className="w-3 h-3 text-muted-foreground/50 shrink-0" />}
                </button>
                {isExpanded && (
                  <div className="px-3.5 pb-3.5 border-t border-border bg-muted/10">
                    <DomainInlineDetail
                      domain={domain}
                      companyId={companyId}
                      canEdit={canEdit}
                      defaultLogin={defaultLogin}
                      addResponse={addResponse}
                      onVerify={handleVerify}
                      onDelete={handleDelete}
                      onSetPrimary={handleSetPrimary}
                      verifyingHost={verifyingHost}
                      deletingHost={deletingHost}
                      saving={saving}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {domains.length === 0 && !showAddForm && (
        <div className="text-center py-6 text-muted-foreground">
          <Globe className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-xs">Inga domäner konfigurerade.</p>
          <p className="text-[10px] mt-1 text-muted-foreground/70">Lägg till en domän för att aktivera Enterprise SSO.</p>
          {canEdit && (
            <Button variant="outline" size="sm" className="mt-3 gap-1.5 text-xs" onClick={startAddFlow}>
              <Plus className="w-3.5 h-3.5" />Lägg till domän
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
