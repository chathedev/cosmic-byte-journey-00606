import { useState, useEffect, useMemo } from 'react';
import { Shield, Globe, Users, Zap, Key, AlertTriangle, CheckCircle2, XCircle, Loader2, Lock, ExternalLink, RefreshCw, Ban, Trash2, RotateCcw } from 'lucide-react';
import { EnterpriseSaveBar } from './EnterpriseSaveBar';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import type { IdentityAccessSettings, EnterpriseProvider, SettingsLock, ProviderReadiness } from '@/lib/enterpriseSettingsApi';

const PROVIDERS = [
  { key: 'microsoft', label: 'Microsoft Entra ID', shortLabel: 'Microsoft', description: 'Azure AD / Microsoft 365' },
  { key: 'google', label: 'Google Workspace', shortLabel: 'Google', description: 'Google Workspace SSO' },
  { key: 'okta', label: 'Okta', shortLabel: 'Okta', description: 'Okta Identity' },
  { key: 'oidc', label: 'OpenID Connect', shortLabel: 'OIDC', description: 'Anpassad OIDC-provider' },
  { key: 'saml', label: 'SAML 2.0', shortLabel: 'SAML', description: 'SAML-baserad federation' },
];

const FALLBACK_POLICIES = [
  { value: 'sso_only', label: 'Endast SSO', description: 'Alla måste använda SSO' },
  { value: 'sso_plus_magic_link', label: 'SSO + Magic Link', description: 'SSO primärt, Magic Link som alternativ' },
  { value: 'sso_plus_passwordless', label: 'SSO + Lösenordsfritt', description: 'SSO primärt, lösenordsfritt som alternativ' },
];

interface Props {
  settings: Partial<IdentityAccessSettings>;
  locks: Record<string, SettingsLock>;
  canEdit: boolean;
  onUpdate: (patch: Record<string, any>) => Promise<void>;
  onTestSSO?: (provider: string) => Promise<void>;
  onConnectSSO?: (provider: string) => Promise<void>;
  onDisableProvider?: (provider: string) => Promise<void>;
  onRemoveProvider?: (provider: string) => Promise<void>;
  onResetProvider?: (provider: string) => Promise<void>;
  providerReadiness?: Record<string, ProviderReadiness>;
  hasVerifiedDomain?: boolean;
  defaultLoginHostname?: string | null;
}

function LockedBadge({ lock }: { lock?: SettingsLock }) {
  if (!lock?.locked) return null;
  return (
    <Badge variant="outline" className="text-[10px] gap-1 border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400">
      <Lock className="w-2.5 h-2.5" />
      Låst: {lock.reason || 'Admin'}
    </Badge>
  );
}

function StatusIndicator({ readiness, provider }: { readiness?: ProviderReadiness; provider?: EnterpriseProvider }) {
  if (!readiness && !provider) return null;
  const isEnabled = readiness?.enabled ?? provider?.enabled ?? false;
  const isReady = readiness?.ready ?? false;
  const isConfigured = readiness?.configured ?? !!provider?.clientIdConfigured;
  const lastTestResult = readiness?.lastTestResult ?? provider?.lastTestResult;
  const lastError = readiness?.lastError ?? provider?.lastError;

  if (!isEnabled) {
    return <Badge variant="outline" className="text-[10px] text-muted-foreground border-border">Inaktiverad</Badge>;
  }
  if (isReady && lastTestResult === 'success') {
    return <Badge variant="outline" className="text-[10px] border-green-300 text-green-700 dark:border-green-800 dark:text-green-400 gap-0.5"><CheckCircle2 className="w-2.5 h-2.5" />Redo</Badge>;
  }
  if (isConfigured && !isReady) {
    return <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400 gap-0.5"><AlertTriangle className="w-2.5 h-2.5" />Ej verifierad</Badge>;
  }
  if (!isConfigured) {
    return <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-700 dark:border-orange-800 dark:text-orange-400 gap-0.5"><XCircle className="w-2.5 h-2.5" />Ej konfigurerad</Badge>;
  }
  if (lastError) {
    return <Badge variant="outline" className="text-[10px] border-destructive/50 text-destructive gap-0.5"><XCircle className="w-2.5 h-2.5" />Fel</Badge>;
  }
  return null;
}

function formatTestTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('sv-SE') + ' ' + d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  } catch { return null; }
}

export function EnterpriseSettingsIdentity({ settings, locks, canEdit, onUpdate, onTestSSO, onConnectSSO, providerReadiness, hasVerifiedDomain, defaultLoginHostname }: Props) {
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [domainInput, setDomainInput] = useState('');

  // Local state for all identity settings
  const [ssoEnabled, setSsoEnabled] = useState(settings.ssoEnabled ?? false);
  const [ssoOnlyLogin, setSsoOnlyLogin] = useState(settings.ssoOnlyLogin ?? false);
  const [primaryProvider, setPrimaryProvider] = useState(settings.primaryProvider || '');
  const [fallbackPolicy, setFallbackPolicy] = useState(settings.fallbackPolicy || 'sso_only');
  const [jitProvisioningEnabled, setJitProvisioningEnabled] = useState(settings.jitProvisioningEnabled ?? false);
  const [groupSyncEnabled, setGroupSyncEnabled] = useState(settings.groupSyncEnabled ?? false);
  const [scimEnabled, setScimEnabled] = useState(settings.scimEnabled ?? false);
  const [defaultAnchorRole, setDefaultAnchorRole] = useState(settings.defaultAnchorRole || 'member');
  const [domainRestrictions, setDomainRestrictions] = useState<string[]>(settings.domainRestrictions || []);
  const [providerEnabled, setProviderEnabled] = useState<Record<string, boolean>>({});

  // Sync from props
  useEffect(() => {
    setSsoEnabled(settings.ssoEnabled ?? false);
    setSsoOnlyLogin(settings.ssoOnlyLogin ?? false);
    setPrimaryProvider(settings.primaryProvider || '');
    setFallbackPolicy(settings.fallbackPolicy || 'sso_only');
    setJitProvisioningEnabled(settings.jitProvisioningEnabled ?? false);
    setGroupSyncEnabled(settings.groupSyncEnabled ?? false);
    setScimEnabled(settings.scimEnabled ?? false);
    setDefaultAnchorRole(settings.defaultAnchorRole || 'member');
    setDomainRestrictions(settings.domainRestrictions || []);
    const pe: Record<string, boolean> = {};
    const providers = settings.providers || {};
    PROVIDERS.forEach(p => { pe[p.key] = (providers as any)[p.key]?.enabled ?? false; });
    setProviderEnabled(pe);
  }, [settings]);

  const isDirty = useMemo(() => {
    const providers = settings.providers || {};
    const providersDirty = PROVIDERS.some(p => providerEnabled[p.key] !== ((providers as any)[p.key]?.enabled ?? false));
    return (
      ssoEnabled !== (settings.ssoEnabled ?? false) ||
      ssoOnlyLogin !== (settings.ssoOnlyLogin ?? false) ||
      primaryProvider !== (settings.primaryProvider || '') ||
      fallbackPolicy !== (settings.fallbackPolicy || 'sso_only') ||
      jitProvisioningEnabled !== (settings.jitProvisioningEnabled ?? false) ||
      groupSyncEnabled !== (settings.groupSyncEnabled ?? false) ||
      scimEnabled !== (settings.scimEnabled ?? false) ||
      defaultAnchorRole !== (settings.defaultAnchorRole || 'member') ||
      JSON.stringify(domainRestrictions) !== JSON.stringify(settings.domainRestrictions || []) ||
      providersDirty
    );
  }, [ssoEnabled, ssoOnlyLogin, primaryProvider, fallbackPolicy, jitProvisioningEnabled, groupSyncEnabled, scimEnabled, defaultAnchorRole, domainRestrictions, providerEnabled, settings]);

  const isLocked = (path: string) => !!locks[`identityAccess.${path}`]?.locked;
  const getLock = (path: string) => locks[`identityAccess.${path}`];

  const handleSave = async () => {
    if (!canEdit || !isDirty) return;
    setSaving(true);
    try {
      const providerPatch: Record<string, any> = {};
      PROVIDERS.forEach(p => {
        const orig = (settings.providers as any)?.[p.key]?.enabled ?? false;
        if (providerEnabled[p.key] !== orig) {
          providerPatch[p.key] = { enabled: providerEnabled[p.key] };
        }
      });
      await onUpdate({
        identityAccess: {
          ssoEnabled,
          ssoOnlyLogin,
          primaryProvider: primaryProvider || undefined,
          fallbackPolicy,
          jitProvisioningEnabled,
          groupSyncEnabled,
          scimEnabled,
          defaultAnchorRole,
          domainRestrictions,
          ...(Object.keys(providerPatch).length > 0 ? { providers: providerPatch } : {}),
        },
      });
    } finally {
      setSaving(false);
    }
  };

  const addDomain = () => {
    const d = domainInput.trim().toLowerCase();
    if (!d || domainRestrictions.includes(d)) return;
    setDomainRestrictions([...domainRestrictions, d]);
    setDomainInput('');
  };

  const removeDomain = (domain: string) => {
    setDomainRestrictions(domainRestrictions.filter(d => d !== domain));
  };

  const handleTestProvider = async (key: string) => {
    if (!onTestSSO) return;
    setTestingProvider(key);
    try { await onTestSSO(key); } finally { setTestingProvider(null); }
  };

  const handleConnectProvider = async (key: string) => {
    if (!onConnectSSO) return;
    setConnectingProvider(key);
    try { await onConnectSSO(key); } finally { setConnectingProvider(null); }
  };

  const providers = settings.providers || {};

  return (
    <div className="space-y-6">
      <EnterpriseSaveBar isDirty={isDirty} saving={saving} canEdit={canEdit} onSave={handleSave} />
      {/* SSO Master Toggle */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><Shield className="w-5 h-5 text-primary" /></div>
            <div>
              <h3 className="font-medium text-sm">Single Sign-On (SSO)</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Centraliserad autentisering för hela organisationen</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LockedBadge lock={getLock('ssoEnabled')} />
            <Switch
              checked={ssoEnabled}
              onCheckedChange={setSsoEnabled}
              disabled={!canEdit || isLocked('ssoEnabled') || saving || !hasVerifiedDomain}
            />
          </div>
        </div>

        {!hasVerifiedDomain && (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-700 dark:text-amber-300">
              <p className="font-medium">Verifierad domän krävs</p>
              <p className="mt-0.5">Lägg till och verifiera en anpassad domän under fliken "Arbetsyta" innan SSO kan aktiveras. Enterprise SSO är inte tillgängligt på app.tivly.se.</p>
            </div>
          </div>
        )}

        {defaultLoginHostname && hasVerifiedDomain && (
          <div className="flex items-center gap-2 text-xs p-2.5 rounded-lg bg-primary/5 border border-primary/10">
            <Globe className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-muted-foreground">SSO-inloggning sker på:</span>
            <span className="font-medium text-foreground">{defaultLoginHostname}</span>
          </div>
        )}

        {ssoEnabled && hasVerifiedDomain && (
          <>
            <Separator />
            {/* SSO Only */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Kräv SSO-inloggning</p>
                <p className="text-xs text-muted-foreground">Blockera vanlig e-post/magic-link för enterprise-medlemmar</p>
              </div>
              <div className="flex items-center gap-2">
                <LockedBadge lock={getLock('ssoOnlyLogin')} />
                <Switch
                  checked={ssoOnlyLogin}
                  onCheckedChange={setSsoOnlyLogin}
                  disabled={!canEdit || isLocked('ssoOnlyLogin') || saving}
                />
              </div>
            </div>
            {ssoOnlyLogin && (
              <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Alla medlemmar måste logga in via SSO. Vanlig inloggning blockeras.
                </p>
              </div>
            )}

            {/* Primary Provider */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Primär provider</Label>
              <Select value={primaryProvider} onValueChange={setPrimaryProvider} disabled={!canEdit || isLocked('primaryProvider') || saving}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Välj provider" /></SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map(p => (
                    <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Fallback policy */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Fallback-policy</Label>
              <Select value={fallbackPolicy} onValueChange={setFallbackPolicy} disabled={!canEdit || isLocked('fallbackPolicy') || saving}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FALLBACK_POLICIES.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {FALLBACK_POLICIES.find(p => p.value === fallbackPolicy)?.description}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Provider Cards */}
      {ssoEnabled && hasVerifiedDomain && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-foreground">Identity Providers</h4>
          <div className="grid gap-3">
            {PROVIDERS.map(({ key, label, description }) => {
              const provider = (providers as any)[key] as EnterpriseProvider | undefined;
              const readiness = providerReadiness?.[key];
              const isEnabled = providerEnabled[key] ?? false;
              const isPrimary = primaryProvider === key;
              const lastTestedAt = formatTestTime(readiness?.lastTestedAt ?? provider?.lastTestedAt);

              return (
                <div
                  key={key}
                  className={`rounded-xl border p-4 space-y-3 transition-colors ${isEnabled ? 'border-primary/30 bg-card shadow-sm' : 'border-border bg-card/50'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isEnabled ? 'bg-primary/10' : 'bg-muted/50'}`}>
                        <Key className={`w-4 h-4 ${isEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{label}</span>
                          {isPrimary && (
                            <Badge className="text-[9px] px-1.5 py-0 h-4 bg-primary/15 text-primary border-0">Primär</Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">{description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusIndicator readiness={readiness} provider={provider} />
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={v => setProviderEnabled(prev => ({ ...prev, [key]: v }))}
                        disabled={!canEdit || saving}
                      />
                    </div>
                  </div>

                  {isEnabled && (
                    <div className="space-y-3">
                      {provider?.clientIdConfigured && (
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <CheckCircle2 className="w-3 h-3 text-green-500" />Client ID konfigurerad
                        </div>
                      )}
                      {key === 'microsoft' && provider?.tenantMode && (
                        <div className="text-[11px] text-muted-foreground">
                          Tenant-läge: <span className="font-medium text-foreground">{provider.tenantMode}</span>
                          {provider.enforceOrganizationAccountOnly && <span className="ml-2 text-muted-foreground">(Organisationskonton)</span>}
                        </div>
                      )}
                      {key === 'google' && provider?.hostedDomain && (
                        <div className="text-[11px] text-muted-foreground">
                          Hosted domain: <span className="font-medium text-foreground">{provider.hostedDomain}</span>
                        </div>
                      )}
                      {key === 'okta' && provider?.issuer && (
                        <div className="text-[11px] text-muted-foreground truncate">
                          Issuer: <span className="font-medium text-foreground">{provider.issuer}</span>
                        </div>
                      )}
                      {lastTestedAt && (
                        <div className="text-[11px] text-muted-foreground">Senast testad: {lastTestedAt}</div>
                      )}
                      {readiness?.lastError && (
                        <div className="flex items-start gap-2 p-2.5 rounded-lg border border-destructive/20 bg-destructive/5">
                          <XCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                          <p className="text-[11px] text-destructive">{readiness.lastError}</p>
                        </div>
                      )}

                      {/* Actions — these are immediate (test/connect are not buffered) */}
                      <div className="flex gap-2 pt-1">
                        {onTestSSO && (
                          <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => handleTestProvider(key)} disabled={testingProvider === key || saving}>
                            {testingProvider === key ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                            Verifiera anslutning
                          </Button>
                        )}
                        {onConnectSSO && !readiness?.ready && (
                          <Button variant="default" size="sm" className="h-7 text-xs gap-1.5" onClick={() => handleConnectProvider(key)} disabled={connectingProvider === key || saving}>
                            {connectingProvider === key ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
                            Konfigurera
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* JIT & Group Sync */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          Automatisk användarhantering
        </h4>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">JIT-provisionering</p>
            <p className="text-xs text-muted-foreground">Skapa konton automatiskt vid första SSO-inloggning</p>
          </div>
          <Switch checked={jitProvisioningEnabled} onCheckedChange={setJitProvisioningEnabled} disabled={!canEdit || isLocked('jitProvisioningEnabled') || saving} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">Gruppsynkronisering</p>
            <p className="text-xs text-muted-foreground">Synka grupper från identity provider</p>
          </div>
          <Switch checked={groupSyncEnabled} onCheckedChange={setGroupSyncEnabled} disabled={!canEdit || isLocked('groupSyncEnabled') || saving} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">SCIM</p>
            <p className="text-xs text-muted-foreground">Automatisk användarhantering via SCIM</p>
          </div>
          <Switch checked={scimEnabled} onCheckedChange={setScimEnabled} disabled={!canEdit || isLocked('scimEnabled') || saving} />
        </div>
      </div>

      {/* Domain Restrictions */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          Domänbegränsningar
        </h4>
        <p className="text-xs text-muted-foreground">Begränsa vilka e-postdomäner som kan logga in via SSO</p>
        <div className="flex flex-wrap gap-2">
          {domainRestrictions.map(d => (
            <Badge key={d} variant="secondary" className="text-xs gap-1">
              {d}
              {canEdit && !isLocked('domainRestrictions') && (
                <button onClick={() => removeDomain(d)} className="ml-1 hover:text-destructive">×</button>
              )}
            </Badge>
          ))}
          {domainRestrictions.length === 0 && (
            <p className="text-[11px] text-muted-foreground italic">Inga domänbegränsningar konfigurerade — alla domäner tillåts</p>
          )}
        </div>
        {canEdit && !isLocked('domainRestrictions') && (
          <div className="flex gap-2">
            <Input
              value={domainInput}
              onChange={e => setDomainInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addDomain()}
              placeholder="example.se"
              className="h-8 text-sm flex-1"
            />
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={addDomain} disabled={!domainInput.trim()}>
              Lägg till
            </Button>
          </div>
        )}
      </div>

      {/* Default role */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          Standardroller vid SSO
        </h4>
        <p className="text-xs text-muted-foreground">Vilken roll ska nya användare tilldelas vid automatisk provisionering</p>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Standardroll (anchor)</Label>
          <Select value={defaultAnchorRole} onValueChange={setDefaultAnchorRole} disabled={!canEdit || saving}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Medlem</SelectItem>
              <SelectItem value="viewer">Läsare</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

    </div>
  );
}
