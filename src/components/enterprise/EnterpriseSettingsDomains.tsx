import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Globe, Plus, CheckCircle2, XCircle, Loader2, Trash2, ExternalLink,
  Shield, AlertTriangle, Copy, RefreshCw, Clock, Zap, ArrowRight, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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

export interface DomainConnectInfo {
  supported?: boolean;
  available?: boolean;
  providerName?: string | null;
  providerId?: string | null;
  settingsUrl?: string | null;
  urlSyncUX?: string | null;
  urlAPI?: string | null;
  templateSupported?: boolean;
  templateUrl?: string | null;
  connectUrl?: string | null;
  lastCheckedAt?: string | null;
  lastError?: string | null;
}

export interface DomainOnboarding {
  tenantId?: string;
  hostname?: string;
  apexDomain?: string;
  hostLabel?: string;
  verificationToken?: string;
  status?: 'pending' | 'awaiting_dns' | 'verifying' | 'active' | 'failed';
  setupMethod?: 'domain_connect' | 'manual' | null;
  domainConnect?: DomainConnectInfo;
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

function getErrorText(domain: DomainEntry): string | null {
  if (typeof domain.lastError === 'string' && domain.lastError) return domain.lastError;
  if (domain.lastErrorMessage) return domain.lastErrorMessage;
  return null;
}

const ONBOARDING_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Väntar', color: 'text-amber-600 dark:text-amber-400' },
  awaiting_dns: { label: 'Väntar på DNS', color: 'text-amber-600 dark:text-amber-400' },
  verifying: { label: 'Verifierar', color: 'text-blue-600 dark:text-blue-400' },
  active: { label: 'Aktiv', color: 'text-green-600 dark:text-green-400' },
  failed: { label: 'Misslyckad', color: 'text-destructive' },
};

const ONBOARDING_STEPS = ['pending', 'awaiting_dns', 'verifying', 'active'] as const;

function getOnboardingProgress(status?: string): number {
  if (!status) return 0;
  const idx = ONBOARDING_STEPS.indexOf(status as any);
  if (status === 'active') return 100;
  if (status === 'failed') return 0;
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / ONBOARDING_STEPS.length) * 100);
}

// ─── Onboarding Status Widget ────────────────────────────────────────────────

function OnboardingStatusWidget({
  onboarding,
  hostname,
  companyId,
  canEdit,
  onRefresh,
}: {
  onboarding: DomainOnboarding;
  hostname: string;
  companyId: string;
  canEdit: boolean;
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [connectLoading, setConnectLoading] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const status = onboarding.status || 'pending';
  const dc = onboarding.domainConnect;
  const isDomainConnectAvailable = dc?.available === true;
  const isAutomatic = onboarding.setupMethod === 'domain_connect';
  const isActive = status === 'active';
  const isFailed = status === 'failed';
  const progress = getOnboardingProgress(status);
  const statusInfo = ONBOARDING_STATUS_LABELS[status] || ONBOARDING_STATUS_LABELS.pending;

  // Poll onboarding status when in intermediate states
  useEffect(() => {
    if (isActive || isFailed) return;
    pollRef.current = setInterval(() => { onRefresh(); }, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [status, isActive, isFailed, onRefresh]);

  const handleDomainConnect = async () => {
    setConnectLoading(true);
    try {
      const res = await apiFetch(
        `/enterprise/companies/${companyId}/settings/domains/${encodeURIComponent(hostname)}/domain-connect-url`,
        { method: 'POST' }
      );
      if (res.connectUrl) {
        window.location.href = res.connectUrl;
      } else {
        toast({ title: 'Fel', description: 'Ingen anslutnings-URL returnerades.', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Anslutning misslyckades', description: err.message, variant: 'destructive' });
    } finally {
      setConnectLoading(false);
    }
  };

  if (isActive) return null; // Domain card handles verified state

  return (
    <div className="space-y-3 p-3 rounded-lg border border-border bg-muted/20">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {status === 'verifying' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
          ) : isFailed ? (
            <XCircle className="w-3.5 h-3.5 text-destructive" />
          ) : (
            <Clock className="w-3.5 h-3.5 text-amber-500" />
          )}
          <span className={`text-xs font-medium ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
          {onboarding.setupMethod && (
            <Badge variant="outline" className="text-[9px] h-4 px-1.5">
              {onboarding.setupMethod === 'domain_connect' ? 'Automatisk' : 'Manuell'}
            </Badge>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground">{progress}%</span>
      </div>

      {/* Progress bar */}
      <Progress value={progress} className="h-1.5" />

      {/* Step indicators */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        {ONBOARDING_STEPS.map((step, i) => {
          const stepIdx = ONBOARDING_STEPS.indexOf(status as any);
          const isCurrentOrPast = stepIdx >= i || status === 'active';
          const isCurrent = step === status;
          return (
            <div key={step} className={`flex items-center gap-1 ${isCurrentOrPast ? 'text-foreground' : ''} ${isCurrent ? 'font-medium' : ''}`}>
              {isCurrentOrPast && !isCurrent && <CheckCircle2 className="w-2.5 h-2.5 text-green-500" />}
              {isCurrent && step !== 'active' && <Loader2 className="w-2.5 h-2.5 animate-spin text-primary" />}
              {isCurrent && step === 'active' && <CheckCircle2 className="w-2.5 h-2.5 text-green-500" />}
              {!isCurrentOrPast && <span className="w-2.5 h-2.5 rounded-full border border-muted-foreground/30 inline-block" />}
              <span>{ONBOARDING_STATUS_LABELS[step]?.label}</span>
            </div>
          );
        })}
      </div>

      {/* Domain Connect error */}
      {dc?.lastError && (
        <div className="flex items-start gap-2 p-2 rounded-lg border border-destructive/20 bg-destructive/5">
          <XCircle className="w-3 h-3 text-destructive mt-0.5 shrink-0" />
          <p className="text-[10px] text-destructive">{dc.lastError}</p>
        </div>
      )}

      {/* Failed state message */}
      {isFailed && (
        <div className="flex items-start gap-2 p-2 rounded-lg border border-destructive/20 bg-destructive/5">
          <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
          <div className="text-[11px] text-destructive space-y-1">
            <p>Konfigurationen misslyckades. Kontrollera DNS-posterna och försök igen.</p>
            {onboarding.domainConnect?.lastError && <p>{onboarding.domainConnect.lastError}</p>}
          </div>
        </div>
      )}

      {/* Primary action: Domain Connect */}
      {isDomainConnectAvailable && !isAutomatic && canEdit && status !== 'active' && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 p-3 rounded-lg border border-primary/20 bg-primary/5">
            <Zap className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div className="space-y-1.5 flex-1">
              <p className="text-xs font-medium text-foreground">Automatisk DNS-konfiguration tillgänglig</p>
              <p className="text-[11px] text-muted-foreground">
                {dc?.providerName
                  ? `Din DNS-leverantör (${dc.providerName}) stödjer automatisk konfiguration via Domain Connect.`
                  : 'Din DNS-leverantör stödjer automatisk konfiguration via Domain Connect.'}
              </p>
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs mt-1"
                onClick={handleDomainConnect}
                disabled={connectLoading}
              >
                {connectLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5" />
                )}
                {connectLoading ? 'Ansluter…' : 'Anslut automatiskt'}
                {!connectLoading && <ArrowRight className="w-3 h-3" />}
              </Button>
            </div>
          </div>

          {/* Toggle to show manual fallback */}
          <button
            onClick={() => setShowManual(!showManual)}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {showManual ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showManual ? 'Dölj manuell DNS-konfiguration' : 'Visa manuell DNS-konfiguration istället'}
          </button>
        </div>
      )}

      {/* Show manual DNS section when DC unavailable, or toggled on */}
      {(!isDomainConnectAvailable || showManual || isAutomatic) && status !== 'active' && (
        <ManualDNSFallback onboarding={onboarding} />
      )}

      {/* Onboarding metadata */}
      {(onboarding.apexDomain || onboarding.hostLabel) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground pt-1 border-t border-border">
          {onboarding.apexDomain && <span>Apex: <span className="font-mono">{onboarding.apexDomain}</span></span>}
          {onboarding.hostLabel && <span>Host: <span className="font-mono">{onboarding.hostLabel}</span></span>}
          {dc?.providerName && <span>DNS: {dc.providerName}</span>}
        </div>
      )}
    </div>
  );
}

// ─── Manual DNS Fallback Section ─────────────────────────────────────────────

function ManualDNSFallback({ onboarding }: { onboarding: DomainOnboarding }) {
  const { toast } = useToast();
  const dc = onboarding.domainConnect;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: 'Kopierad till urklipp' });
    });
  };

  // Build required records from onboarding data
  const records: Array<{ type: string; name: string; value: string; reason?: string }> = [];
  if (onboarding.hostname) {
    records.push({
      type: 'CNAME',
      name: onboarding.hostLabel || onboarding.hostname,
      value: 'cname.vercel-dns.com',
      reason: 'Pekar domänen till Tivly',
    });
  }
  if (onboarding.verificationToken) {
    records.push({
      type: 'TXT',
      name: `_tivly.${onboarding.apexDomain || onboarding.hostname}`,
      value: onboarding.verificationToken,
      reason: 'Verifierar ägarskap',
    });
  }

  if (records.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-muted-foreground">DNS-poster att konfigurera:</p>
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-2.5 py-1.5 font-medium text-muted-foreground w-16">Typ</th>
              <th className="text-left px-2.5 py-1.5 font-medium text-muted-foreground">Namn</th>
              <th className="text-left px-2.5 py-1.5 font-medium text-muted-foreground">Värde</th>
              <th className="text-left px-2.5 py-1.5 font-medium text-muted-foreground w-28">Syfte</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {records.map((rec, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-2.5 py-2 font-mono font-medium">{rec.type}</td>
                <td className="px-2.5 py-2 font-mono text-muted-foreground truncate max-w-[140px]" title={rec.name}>{rec.name}</td>
                <td className="px-2.5 py-2 font-mono truncate max-w-[200px]" title={rec.value}>{rec.value}</td>
                <td className="px-2.5 py-2 text-muted-foreground">{rec.reason || '—'}</td>
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

      {/* DNS provider settings link */}
      {dc?.settingsUrl && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {dc.providerName && <span>DNS-leverantör: <span className="font-medium text-foreground">{dc.providerName}</span></span>}
          <a
            href={dc.settingsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
          >
            Öppna DNS-hantering <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      )}

      <div className="flex items-start gap-1.5 p-2.5 rounded-lg bg-muted/30 border border-border">
        <AlertTriangle className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Lägg till ovanstående DNS-poster hos din domänleverantör. DNS-propagering kan ta upp till 72 timmar. Verifiering sker automatiskt i bakgrunden.
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function EnterpriseSettingsDomains({ companyId, customDomains, canEdit, onDomainsChanged }: Props) {
  const { toast } = useToast();
  const [domains, setDomains] = useState<DomainEntry[]>(customDomains?.domains || []);
  const [defaultLogin, setDefaultLogin] = useState<string | null>(customDomains?.defaultLoginHostname || null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addMode, setAddMode] = useState<'tivly' | 'custom' | null>(null);
  const [hostnameInput, setHostnameInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [verifyingHost, setVerifyingHost] = useState<string | null>(null);
  const [deletingHost, setDeletingHost] = useState<string | null>(null);
  const [addResponse, setAddResponse] = useState<Record<string, any>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setDomains(customDomains?.domains || []);
    setDefaultLogin(customDomains?.defaultLoginHostname || null);
  }, [customDomains]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const hasVerifiedDomain = domains.some(d => d.status === 'verified');

  const refreshDomains = useCallback(async () => {
    try {
      const res = await apiFetch(`/enterprise/companies/${companyId}/settings/domains`);
      if (res.domains) setDomains(res.domains);
      if (res.defaultLoginHostname !== undefined) setDefaultLogin(res.defaultLoginHostname);
      return res.domains as DomainEntry[];
    } catch {
      return null;
    }
  }, [companyId]);

  const fullRefresh = useCallback(async () => {
    await refreshDomains();
    onDomainsChanged?.();
  }, [refreshDomains, onDomainsChanged]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await refreshDomains();
    setRefreshing(false);
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

      // Store full response for onboarding data
      if (res.instructions || res.domain?.dnsRecords || res.onboarding) {
        setAddResponse(prev => ({ ...prev, [hostname]: res }));
      }

      setHostnameInput('');
      setAddMode(null);
      setAddDialogOpen(false);
      await refreshDomains();

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
    setVerifyingHost(hostname);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 24) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setVerifyingHost(null);
        return;
      }
      const updated = await refreshDomains();
      if (updated) {
        const d = updated.find((dom: DomainEntry) => dom.hostname === hostname);
        if (d?.status === 'verified' || d?.onboarding?.status === 'active') {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setVerifyingHost(null);
          toast({ title: 'Domän verifierad!', description: `${hostname} är nu verifierad.` });
          onDomainsChanged?.();
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
        await refreshDomains();
        onDomainsChanged?.();
      } else if (domain?.status === 'pending') {
        const hint = getErrorText(domain) || 'DNS har inte propagerats ännu.';
        toast({
          title: 'Verifiering ej klar',
          description: `${hint} DNS-propagering kan ta upp till 72 timmar.`,
        });
        await refreshDomains();
        startVerificationPoll(hostname);
        return;
      } else if (domain?.status === 'failed') {
        toast({
          title: 'Verifiering misslyckades',
          description: getErrorText(domain) || 'Kontrollera att DNS-posterna är korrekt konfigurerade.',
          variant: 'destructive',
        });
        await refreshDomains();
      }
    } catch (err: any) {
      toast({ title: 'Verifiering misslyckades', description: err.message, variant: 'destructive' });
    } finally {
      if (!pollRef.current) setVerifyingHost(null);
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
      await refreshDomains();
      onDomainsChanged?.();
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
      await refreshDomains();
      onDomainsChanged?.();
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

  const getDnsRecords = (domain: DomainEntry): Array<{ type: string; name: string; value: string; reason?: string }> => {
    if (domain.dnsRecords && domain.dnsRecords.length > 0) return domain.dnsRecords;
    const resp = addResponse[domain.hostname];
    if (resp?.instructions?.records) return resp.instructions.records;
    if (resp?.domain?.dnsRecords) return resp.domain.dnsRecords;
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
    const providerName = typeof dp === 'object' && dp ? (dp.label || dp.key || null) : (dp || null);
    const providerDashboard = typeof dp === 'object' && dp ? (dp.dashboardUrl || null) : null;
    return {
      name: providerName || resp?.instructions?.provider?.name || null,
      dashboardUrl: providerDashboard || resp?.instructions?.provider?.dashboardUrl || null,
    };
  };

  // Merge onboarding from add response if domain doesn't have it
  const getOnboarding = (domain: DomainEntry): DomainOnboarding | null => {
    if (domain.onboarding) return domain.onboarding;
    const resp = addResponse[domain.hostname];
    if (resp?.onboarding) return resp.onboarding;
    return null;
  };

  // Check if domain has active onboarding (not yet verified via onboarding)
  const hasActiveOnboarding = (domain: DomainEntry): boolean => {
    const ob = getOnboarding(domain);
    if (!ob) return false;
    return ob.status !== 'active' && domain.status !== 'verified';
  };

  return (
    <>
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
          <div className="flex items-center gap-1">
            {domains.length > 0 && (
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" onClick={handleManualRefresh} disabled={refreshing}>
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setAddDialogOpen(true)}>
                <Plus className="w-3.5 h-3.5" />Lägg till
              </Button>
            )}
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
              const errorText = getErrorText(domain);
              const onboarding = getOnboarding(domain);
              const showOnboarding = hasActiveOnboarding(domain);

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

                      {isVerified && (
                        <Badge variant="outline" className="text-[10px] gap-0.5 border-green-300 text-green-700 dark:border-green-800 dark:text-green-400">
                          <CheckCircle2 className="w-2.5 h-2.5" />Verifierad
                        </Badge>
                      )}
                      {isPending && !showOnboarding && (
                        <Badge variant="outline" className="text-[10px] gap-0.5 border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400">
                          <Clock className="w-2.5 h-2.5" />Väntar
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
                      {!isVerified && canEdit && !showOnboarding && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleVerify(domain.hostname); }}
                          disabled={isPolling}
                        >
                          {isPolling ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          {isPolling ? 'Kontrollerar…' : 'Verifiera'}
                        </Button>
                      )}
                      {isVerified && !isPrimary && canEdit && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={(e) => { e.preventDefault(); handleSetPrimary(domain.hostname); }}
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
                          onClick={(e) => { e.preventDefault(); handleDelete(domain.hostname); }}
                          disabled={deletingHost === domain.hostname}
                        >
                          {deletingHost === domain.hostname ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Onboarding widget — shown for domains with active onboarding */}
                  {showOnboarding && onboarding && (
                    <OnboardingStatusWidget
                      onboarding={onboarding}
                      hostname={domain.hostname}
                      companyId={companyId}
                      canEdit={canEdit}
                      onRefresh={refreshDomains}
                    />
                  )}

                  {/* Verification metadata */}
                  {(verifiedAt || lastChecked) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                      {verifiedAt && <span>Verifierad: {verifiedAt}</span>}
                      {lastChecked && <span>Senast kontrollerad: {lastChecked}</span>}
                    </div>
                  )}

                  {/* Error message (only when no onboarding widget handles it) */}
                  {errorText && !showOnboarding && (
                    <div className="flex items-start gap-2 p-2.5 rounded-lg border border-destructive/20 bg-destructive/5">
                      <XCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                      <div className="text-[11px] text-destructive space-y-1">
                        <p>{errorText}</p>
                        {isFailed && domain.kind === 'bring_your_own' && (
                          <p className="text-muted-foreground">Kontrollera att DNS-posterna nedan är korrekt konfigurerade hos din domänleverantör.</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Legacy DNS Records (for domains without onboarding data) */}
                  {!isVerified && !showOnboarding && dnsRecords.length > 0 && (
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

        {/* Empty state */}
        {domains.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <Globe className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">Inga domäner konfigurerade ännu.</p>
            {canEdit && (
              <Button variant="outline" size="sm" className="mt-3 gap-1.5 text-xs" onClick={() => setAddDialogOpen(true)}>
                <Plus className="w-3.5 h-3.5" />Lägg till din första domän
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Add Domain Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={(open) => {
        setAddDialogOpen(open);
        if (!open) { setAddMode(null); setHostnameInput(''); }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Globe className="w-4 h-4 text-primary" />
              Lägg till domän
            </DialogTitle>
          </DialogHeader>

          {!addMode ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">Välj domäntyp</p>
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={() => setAddMode('tivly')}
                  className="p-4 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-colors text-left space-y-1.5 group"
                >
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10 group-hover:bg-primary/15 transition-colors">
                      <Shield className="w-4 h-4 text-primary" />
                    </div>
                    <p className="text-sm font-medium">Tivly-subdomän</p>
                  </div>
                  <p className="text-xs text-muted-foreground pl-9">foretag.tivly.se — automatisk konfiguration, ingen DNS-ändring</p>
                </button>
                <button
                  onClick={() => setAddMode('custom')}
                  className="p-4 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-colors text-left space-y-1.5 group"
                >
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10 group-hover:bg-primary/15 transition-colors">
                      <Globe className="w-4 h-4 text-primary" />
                    </div>
                    <p className="text-sm font-medium">Egen domän</p>
                  </div>
                  <p className="text-xs text-muted-foreground pl-9">workspace.foretag.se — kräver DNS-konfiguration hos er leverantör</p>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {addMode === 'tivly' ? 'Välj subdomännamn' : 'Ange domännamn'}
                </Label>
                <div className="flex items-center gap-0">
                  <Input
                    value={hostnameInput}
                    onChange={e => setHostnameInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddDomain()}
                    placeholder={addMode === 'tivly' ? 'foretag' : 'workspace.foretag.se'}
                    className={`h-10 text-sm ${addMode === 'tivly' ? 'rounded-r-none' : ''}`}
                    autoFocus
                  />
                  {addMode === 'tivly' && (
                    <span className="h-10 px-3 flex items-center text-xs text-muted-foreground bg-muted border border-l-0 border-input rounded-r-md">.tivly.se</span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {addMode === 'tivly'
                    ? 'Tivly-subdomäner konfigureras automatiskt. Ingen DNS-ändring behövs.'
                    : 'Du behöver lägga till DNS-poster hos din domänleverantör. Instruktioner visas efter att domänen lagts till.'}
                </p>
              </div>
            </div>
          )}

          {addMode && (
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" size="sm" onClick={() => setAddMode(null)}>
                Tillbaka
              </Button>
              <Button size="sm" onClick={handleAddDomain} disabled={saving || !hostnameInput.trim()} className="gap-1.5">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {saving ? 'Lägger till…' : 'Lägg till domän'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
