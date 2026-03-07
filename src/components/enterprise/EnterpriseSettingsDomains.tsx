import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Globe, Plus, CheckCircle2, XCircle, Loader2, Trash2, ExternalLink,
  Shield, AlertTriangle, Copy, RefreshCw, Clock, ArrowRight, Mail,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
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
  if (status === 'active') return 100;
  if (status === 'failed') return 0;
  const idx = ONBOARDING_STEPS.indexOf(status as any);
  if (idx < 0) return 0;
  return Math.round(((idx + 1) / ONBOARDING_STEPS.length) * 100);
}

function statusIcon(domain: DomainEntry) {
  if (domain.status === 'verified') return <CheckCircle2 className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />;
  if (domain.status === 'failed') return <XCircle className="w-3.5 h-3.5 text-destructive" />;
  if (domain.status === 'removing') return <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />;
  const ob = domain.onboarding;
  if (ob?.status === 'verifying') return <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />;
  return <Clock className="w-3.5 h-3.5 text-amber-500" />;
}

function statusLabel(domain: DomainEntry): string {
  if (domain.status === 'verified') return 'Verifierad';
  if (domain.status === 'failed') return 'Misslyckad';
  if (domain.status === 'removing') return 'Tas bort';
  const ob = domain.onboarding;
  if (ob?.status) return ONBOARDING_STATUS_LABELS[ob.status]?.label || 'Väntar';
  return 'Väntar';
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

När posterna är tillagda kommer Tivly att verifiera domänen automatiskt. Propagering kan ta upp till 72 timmar.

Tack på förhand!`
  );
  return `mailto:?subject=${subject}&body=${body}`;
}

// ─── Domain Onboarding Dialog ────────────────────────────────────────────────
// Unified dialog: handles both adding a new domain and viewing/managing existing ones.
// Does NOT close until domain is verified (or user explicitly dismisses).

type DialogPhase = 'pick_type' | 'enter_hostname' | 'onboarding' | 'verified';

function DomainOnboardingDialog({
  open,
  onOpenChange,
  companyId,
  canEdit,
  defaultLogin,
  existingDomain,
  addResponse,
  onDomainAdded,
  onVerify,
  onDelete,
  onSetPrimary,
  onRefresh,
  verifyingHost,
  deletingHost,
  saving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  canEdit: boolean;
  defaultLogin: string | null;
  existingDomain: DomainEntry | null;
  addResponse: Record<string, any>;
  onDomainAdded: (hostname: string, response: any) => void;
  onVerify: (h: string) => void;
  onDelete: (h: string) => void;
  onSetPrimary: (h: string) => void;
  onRefresh: () => void;
  verifyingHost: string | null;
  deletingHost: string | null;
  saving: boolean;
}) {
  const { toast } = useToast();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Phase management
  const initialPhase: DialogPhase = existingDomain
    ? (existingDomain.status === 'verified' ? 'verified' : 'onboarding')
    : 'pick_type';
  const [phase, setPhase] = useState<DialogPhase>(initialPhase);
  const [addMode, setAddMode] = useState<'tivly' | 'custom' | null>(null);
  const [hostnameInput, setHostnameInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [domain, setDomain] = useState<DomainEntry | null>(existingDomain);

  // Sync when existingDomain changes
  useEffect(() => {
    if (existingDomain) {
      setDomain(existingDomain);
      setPhase(existingDomain.status === 'verified' ? 'verified' : 'onboarding');
    } else if (!open) {
      setPhase('pick_type');
      setAddMode(null);
      setHostnameInput('');
      setDomain(null);
    }
  }, [existingDomain, open]);

  // Poll while in onboarding phase
  useEffect(() => {
    if (!open || phase !== 'onboarding') return;
    pollRef.current = setInterval(onRefresh, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [open, phase, onRefresh]);

  // Update phase when domain becomes verified
  useEffect(() => {
    if (domain?.status === 'verified' || domain?.onboarding?.status === 'active') {
      setPhase('verified');
    }
  }, [domain?.status, domain?.onboarding?.status]);

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
      toast({ title: 'Domän tillagd', description: `${hostname} har lagts till.` });
      onDomainAdded(hostname, res);
      // Transition to onboarding phase with the new domain data
      const newDomain: DomainEntry = res.domain || {
        hostname, kind: addMode === 'tivly' ? 'tivly_subdomain' : 'bring_your_own',
        status: 'pending', onboarding: res.onboarding, dnsRecords: res.instructions?.records || res.domain?.dnsRecords,
        dnsProvider: res.instructions?.provider || null,
      };
      setDomain(newDomain);
      setPhase('onboarding');
    } catch (err: any) {
      toast({ title: 'Fel', description: err.message, variant: 'destructive' });
    } finally { setAdding(false); }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: 'Kopierad' });
    });
  };

  // Prevent closing while onboarding (user must use explicit close)
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && phase === 'onboarding' && domain && domain.status !== 'verified') {
      // Allow close but confirm
      onOpenChange(false);
      return;
    }
    onOpenChange(newOpen);
  };

  // Computed domain fields
  const isVerified = domain?.status === 'verified';
  const isFailed = domain?.status === 'failed';
  const isPrimary = domain ? (domain.primary || defaultLogin === domain.hostname) : false;
  const isPolling = domain ? verifyingHost === domain.hostname : false;
  const errorText = domain ? getErrorText(domain) : null;

  const onboarding: DomainOnboarding | null = domain?.onboarding || (domain ? addResponse[domain.hostname]?.onboarding : null) || null;
  const obStatus = onboarding?.status || (domain?.status === 'verified' ? 'active' : 'pending');
  const progress = getOnboardingProgress(obStatus);

  // DNS records
  const dnsRecords = (() => {
    if (!domain) return [];
    if (domain.dnsRecords?.length) return domain.dnsRecords;
    const resp = addResponse[domain.hostname];
    if (resp?.instructions?.records) return resp.instructions.records;
    if (resp?.domain?.dnsRecords) return resp.domain.dnsRecords;
    if (domain.vercel?.verification?.length > 0) {
      return domain.vercel.verification.map((v: any) => ({
        type: v.type || 'TXT', name: v.domain || domain.hostname, value: v.value || '', reason: v.reason || 'Vercel-verifiering',
      }));
    }
    return [];
  })();

  const provider = (() => {
    if (!domain) return { name: null, dashboardUrl: null };
    const resp = addResponse[domain.hostname];
    const dp = domain.dnsProvider;
    const name = typeof dp === 'object' && dp ? (dp.label || dp.key || null) : (dp || null);
    const url = typeof dp === 'object' && dp ? (dp.dashboardUrl || null) : null;
    return { name: name || resp?.instructions?.provider?.name || null, dashboardUrl: url || resp?.instructions?.provider?.dashboardUrl || null };
  })();

  // Build onboarding DNS records as fallback
  const onboardingRecords: Array<{ type: string; name: string; value: string; reason?: string }> = [];
  if (onboarding?.hostname) {
    onboardingRecords.push({
      type: 'CNAME', name: onboarding.hostLabel || onboarding.hostname,
      value: 'cname.vercel-dns.com', reason: 'Pekar domänen till Tivly',
    });
  }
  if (onboarding?.verificationToken) {
    onboardingRecords.push({
      type: 'TXT', name: `_tivly.${onboarding.apexDomain || onboarding.hostname}`,
      value: onboarding.verificationToken, reason: 'Verifierar ägarskap',
    });
  }

  const hasActiveOnboarding = phase === 'onboarding' && obStatus !== 'active';
  const allRecords = hasActiveOnboarding && onboardingRecords.length > 0 ? onboardingRecords : dnsRecords;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* ── Phase: Pick type ── */}
        {phase === 'pick_type' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm">
                <Globe className="w-4 h-4 text-primary" />Lägg till domän
              </DialogTitle>
              <DialogDescription className="text-xs">Välj domäntyp</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-1">
              <button
                onClick={() => { setAddMode('tivly'); setPhase('enter_hostname'); }}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors text-left"
              >
                <Shield className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">Tivly-subdomän</p>
                  <p className="text-[10px] text-muted-foreground">foretag.tivly.se — automatisk</p>
                </div>
              </button>
              <button
                onClick={() => { setAddMode('custom'); setPhase('enter_hostname'); }}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors text-left"
              >
                <Globe className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">Egen domän</p>
                  <p className="text-[10px] text-muted-foreground">workspace.foretag.se — kräver DNS</p>
                </div>
              </button>
            </div>
          </>
        )}

        {/* ── Phase: Enter hostname ── */}
        {phase === 'enter_hostname' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm">
                <Globe className="w-4 h-4 text-primary" />
                {addMode === 'tivly' ? 'Tivly-subdomän' : 'Egen domän'}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {addMode === 'tivly' ? 'Välj ett namn för din subdomän' : 'Ange din domänadress'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-1">
              <div className="space-y-1.5">
                <Label className="text-xs">{addMode === 'tivly' ? 'Subdomännamn' : 'Domännamn'}</Label>
                <div className="flex items-center">
                  <Input
                    value={hostnameInput}
                    onChange={e => setHostnameInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    placeholder={addMode === 'tivly' ? 'foretag' : 'workspace.foretag.se'}
                    className={`h-9 text-sm ${addMode === 'tivly' ? 'rounded-r-none' : ''}`}
                    autoFocus
                  />
                  {addMode === 'tivly' && (
                    <span className="h-9 px-2.5 flex items-center text-xs text-muted-foreground bg-muted border border-l-0 border-input rounded-r-md">.tivly.se</span>
                  )}
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setPhase('pick_type'); setAddMode(null); setHostnameInput(''); }}>Tillbaka</Button>
              <Button size="sm" className="text-xs gap-1" onClick={handleAdd} disabled={adding || !hostnameInput.trim()}>
                {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                {adding ? 'Lägger till…' : 'Lägg till'}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Phase: Onboarding (DNS setup) ── */}
        {phase === 'onboarding' && domain && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm font-medium">
                {statusIcon(domain)}
                <span className="font-mono truncate">{domain.hostname}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                Konfigurera DNS för att aktivera domänen
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Progress */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className={`font-medium ${ONBOARDING_STATUS_LABELS[obStatus]?.color || ''}`}>
                    {ONBOARDING_STATUS_LABELS[obStatus]?.label || 'Väntar'}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{progress}%</span>
                </div>
                <Progress value={progress} className="h-1" />
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  {ONBOARDING_STEPS.map((step, i) => {
                    const stepIdx = ONBOARDING_STEPS.indexOf(obStatus as any);
                    const done = stepIdx > i || obStatus === 'active';
                    const current = step === obStatus;
                    return (
                      <span key={step} className={`${done ? 'text-green-600 dark:text-green-400' : current ? 'text-foreground font-medium' : ''}`}>
                        {done ? '✓' : current ? '●' : '○'} {ONBOARDING_STATUS_LABELS[step]?.label}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Error */}
              {(isFailed || onboarding?.status === 'failed') && (
                <div className="flex items-start gap-2 p-3 rounded-lg border border-destructive/20 bg-destructive/5 text-xs text-destructive">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{errorText || 'Konfigurationen misslyckades. Kontrollera DNS-posterna.'}</span>
                </div>
              )}

              {/* DNS records */}
              {allRecords.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-medium text-muted-foreground">DNS-poster att lägga till</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
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
                        {allRecords.map((rec: any, i: number) => (
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

                  {/* Send to IT button */}
                  <a
                    href={buildITEmailMailto(domain.hostname, allRecords)}
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors mt-1"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Skicka instruktioner till IT
                  </a>
                </div>
              )}

              {/* Helpful note */}
              <p className="text-[10px] text-muted-foreground">
                Tivly verifierar domänen automatiskt i bakgrunden. Du kan också klicka <strong>Verifiera</strong> för att kontrollera direkt.
              </p>

              {/* Metadata */}
              {(onboarding?.apexDomain || onboarding?.hostLabel || domain.lastCheckedAt) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground pt-2 border-t border-border">
                  {onboarding?.apexDomain && <span>Apex: <span className="font-mono">{onboarding.apexDomain}</span></span>}
                  {onboarding?.hostLabel && <span>Host: <span className="font-mono">{onboarding.hostLabel}</span></span>}
                  {domain.lastCheckedAt && <span>Kontrollerad: {formatTime(domain.lastCheckedAt)}</span>}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              {canEdit && (
                <Button
                  variant="ghost" size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1 text-xs"
                  onClick={() => { onDelete(domain.hostname); onOpenChange(false); }}
                  disabled={deletingHost === domain.hostname}
                >
                  {deletingHost === domain.hostname ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  Ta bort
                </Button>
              )}
              <div className="flex-1" />
              {canEdit && (
                <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => onVerify(domain.hostname)} disabled={isPolling}>
                  {isPolling ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Verifiera
                </Button>
              )}
            </DialogFooter>
          </>
        )}

        {/* ── Phase: Verified ── */}
        {phase === 'verified' && domain && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                <span className="font-mono truncate">{domain.hostname}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">
                {domain.kind === 'tivly_subdomain' ? 'Tivly-subdomän' : 'Egen domän'}
                {isPrimary ? ' · Primär inloggningsvärd' : ''}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/50 text-xs text-green-700 dark:text-green-400">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Domänen är verifierad och redo att användas.
              </div>

              {domain.verifiedAt && (
                <p className="text-[10px] text-muted-foreground">Verifierad: {formatTime(domain.verifiedAt)}</p>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              {canEdit && (
                <Button
                  variant="ghost" size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1 text-xs"
                  onClick={() => { onDelete(domain.hostname); onOpenChange(false); }}
                  disabled={deletingHost === domain.hostname}
                >
                  {deletingHost === domain.hostname ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  Ta bort
                </Button>
              )}
              <div className="flex-1" />
              {!isPrimary && canEdit && (
                <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => { onSetPrimary(domain.hostname); onOpenChange(false); }} disabled={saving}>
                  <Shield className="w-3 h-3" />Sätt som primär
                </Button>
              )}
              <Button variant="outline" size="sm" className="text-xs" onClick={() => onOpenChange(false)}>
                Stäng
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function EnterpriseSettingsDomains({ companyId, customDomains, canEdit, onDomainsChanged }: Props) {
  const { toast } = useToast();
  const [domains, setDomains] = useState<DomainEntry[]>(customDomains?.domains || []);
  const [defaultLogin, setDefaultLogin] = useState<string | null>(customDomains?.defaultLoginHostname || null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifyingHost, setVerifyingHost] = useState<string | null>(null);
  const [deletingHost, setDeletingHost] = useState<string | null>(null);
  const [addResponse, setAddResponse] = useState<Record<string, any>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

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
    } catch { return null; }
  }, [companyId]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await refreshDomains();
    setRefreshing(false);
  };

  const openAddDialog = () => {
    setSelectedDomain(null);
    setDialogOpen(true);
  };

  const openDomainDetail = (hostname: string) => {
    setSelectedDomain(hostname);
    setDialogOpen(true);
  };

  const handleDomainAdded = async (hostname: string, response: any) => {
    if (response.instructions || response.domain?.dnsRecords || response.onboarding) {
      setAddResponse(prev => ({ ...prev, [hostname]: response }));
    }
    setSelectedDomain(hostname);
    await refreshDomains();
    // Start polling for tivly subdomains
    if (hostname.endsWith('.tivly.se')) {
      startVerificationPoll(hostname);
    }
  };

  const startVerificationPoll = (hostname: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    setVerifyingHost(hostname);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 24) { if (pollRef.current) clearInterval(pollRef.current); pollRef.current = null; setVerifyingHost(null); return; }
      const updated = await refreshDomains();
      if (updated) {
        const d = updated.find((dom: DomainEntry) => dom.hostname === hostname);
        if (d?.status === 'verified' || d?.onboarding?.status === 'active') {
          if (pollRef.current) clearInterval(pollRef.current); pollRef.current = null; setVerifyingHost(null);
          toast({ title: 'Domän verifierad!', description: `${hostname} är nu verifierad.` });
          onDomainsChanged?.();
        }
      }
    }, 5000);
  };

  const handleVerify = async (hostname: string) => {
    setVerifyingHost(hostname);
    try {
      const res = await apiFetch(`/enterprise/companies/${companyId}/settings/domains/${encodeURIComponent(hostname)}/verify`, { method: 'POST' });
      const d = res.domain;
      if (d?.status === 'verified') {
        toast({ title: 'Domän verifierad!' }); await refreshDomains(); onDomainsChanged?.();
      } else if (d?.status === 'pending') {
        toast({ title: 'Verifiering ej klar', description: getErrorText(d) || 'DNS har inte propagerats ännu.' });
        await refreshDomains(); startVerificationPoll(hostname); return;
      } else if (d?.status === 'failed') {
        toast({ title: 'Verifiering misslyckades', description: getErrorText(d) || 'Kontrollera DNS-posterna.', variant: 'destructive' });
        await refreshDomains();
      }
    } catch (err: any) {
      toast({ title: 'Verifiering misslyckades', description: err.message, variant: 'destructive' });
    } finally { if (!pollRef.current) setVerifyingHost(null); }
  };

  const handleDelete = async (hostname: string) => {
    setDeletingHost(hostname);
    try {
      await apiFetch(`/enterprise/companies/${companyId}/settings/domains/${encodeURIComponent(hostname)}`, { method: 'DELETE' });
      toast({ title: 'Domän borttagen' });
      setAddResponse(prev => { const next = { ...prev }; delete next[hostname]; return next; });
      setSelectedDomain(null);
      await refreshDomains(); onDomainsChanged?.();
    } catch (err: any) {
      toast({ title: 'Fel', description: err.message, variant: 'destructive' });
    } finally { setDeletingHost(null); }
  };

  const handleSetPrimary = async (hostname: string) => {
    setSaving(true);
    try {
      await apiFetch(`/enterprise/companies/${companyId}/settings/domains/${encodeURIComponent(hostname)}`, {
        method: 'PATCH', body: JSON.stringify({ primary: true, loginEnabled: true }),
      });
      toast({ title: 'Primär inloggningsvärd uppdaterad' }); await refreshDomains(); onDomainsChanged?.();
    } catch (err: any) {
      toast({ title: 'Fel', description: err.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const selectedDomainData = selectedDomain ? domains.find(d => d.hostname === selectedDomain) : null;

  return (
    <>
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><Globe className="w-5 h-5 text-primary" /></div>
            <div>
              <h3 className="font-medium text-sm">Anpassade domäner</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Konfigurera arbetsytans inloggningsadress
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
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={openAddDialog}>
                <Plus className="w-3.5 h-3.5" />Lägg till
              </Button>
            )}
          </div>
        </div>

        {!hasVerifiedDomain && (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Ingen verifierad domän. Lägg till en domän för att aktivera Enterprise SSO.
            </p>
          </div>
        )}

        {defaultLogin && (
          <div className="flex items-center gap-2 text-xs p-2.5 rounded-lg bg-primary/5 border border-primary/10">
            <Shield className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-muted-foreground">Primär:</span>
            <a href={`https://${defaultLogin}`} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground hover:text-primary transition-colors flex items-center gap-1">
              {defaultLogin}<ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {domains.length > 0 && (
          <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
            {domains.map(domain => {
              const isPrimary = domain.primary || defaultLogin === domain.hostname;
              return (
                <button
                  key={domain.hostname}
                  onClick={() => openDomainDetail(domain.hostname)}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-muted/40 transition-colors"
                >
                  {statusIcon(domain)}
                  <span className="text-sm font-mono truncate flex-1 min-w-0">{domain.hostname}</span>
                  {isPrimary && domain.status === 'verified' && (
                    <Badge className="text-[9px] px-1.5 py-0 h-4 bg-primary/15 text-primary border-0 shrink-0">Primär</Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground shrink-0">{statusLabel(domain)}</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                </button>
              );
            })}
          </div>
        )}

        {domains.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <Globe className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">Inga domäner konfigurerade.</p>
            {canEdit && (
              <Button variant="outline" size="sm" className="mt-3 gap-1.5 text-xs" onClick={openAddDialog}>
                <Plus className="w-3.5 h-3.5" />Lägg till domän
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Unified onboarding dialog */}
      <DomainOnboardingDialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) setSelectedDomain(null); }}
        companyId={companyId}
        canEdit={canEdit}
        defaultLogin={defaultLogin}
        existingDomain={selectedDomainData || null}
        addResponse={addResponse}
        onDomainAdded={handleDomainAdded}
        onVerify={handleVerify}
        onDelete={handleDelete}
        onSetPrimary={handleSetPrimary}
        onRefresh={refreshDomains}
        verifyingHost={verifyingHost}
        deletingHost={deletingHost}
        saving={saving}
      />
    </>
  );
}
