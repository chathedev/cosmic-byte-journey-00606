import { useState, useEffect, useMemo, useCallback } from 'react';
import { Shield, Globe, Users, Zap, Key, AlertTriangle, CheckCircle2, XCircle, Loader2, Lock, ExternalLink, RefreshCw, Ban, Trash2, RotateCcw } from 'lucide-react';
import { CardSaveFooter } from './CardSaveFooter';
import { useManualSave } from '@/hooks/useManualSave';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import type { IdentityAccessSettings, EnterpriseProvider, SettingsLock, ProviderReadiness } from '@/lib/enterpriseSettingsApi';

interface Props {
  settings: Partial<IdentityAccessSettings>;
  locks: Record<string, SettingsLock>;
  canEdit: boolean;
  onUpdate: (patch: Record<string, any>) => Promise<void>;
  onTestSSO?: (provider: string, config?: Record<string, any>) => Promise<void>;
  onConnectSSO?: (provider: string, config?: Record<string, any>) => Promise<void>;
  onDisableProvider?: (provider: string) => Promise<void>;
  onRemoveProvider?: (provider: string) => Promise<void>;
  onResetProvider?: (provider: string) => Promise<void>;
  providerReadiness?: Record<string, ProviderReadiness>;
  hasVerifiedDomain?: boolean;
  defaultLoginHostname?: string | null;
}

interface IdentityProviderCardProps {
  providerKey: string;
  label: string;
  description: string;
  provider?: EnterpriseProvider;
  readiness?: ProviderReadiness;
  enabled: boolean;
  originalEnabled: boolean;
  isPrimary: boolean;
  canEdit: boolean;
  actionProvider: string | null;
  testingProvider: string | null;
  connectingProvider: string | null;
  onEnabledChange: (enabled: boolean) => void;
  onSaveEnabled: () => Promise<void>;
  onDiscardEnabled: () => void;
  onTestSSO?: (provider: string, config?: Record<string, any>) => Promise<void>;
  onConnectSSO?: (provider: string, config?: Record<string, any>) => Promise<void>;
  onDisableProvider?: (provider: string) => Promise<void>;
  onRemoveProvider?: (provider: string) => Promise<void>;
  onResetProvider?: (provider: string) => Promise<void>;
  setActionProvider: (provider: string | null) => void;
  setTestingProvider: (provider: string | null) => void;
  setConnectingProvider: (provider: string | null) => void;
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret: string;
  setOidcIssuer: (value: string) => void;
  setOidcClientId: (value: string) => void;
  setOidcClientSecret: (value: string) => void;
}

const PROVIDERS = [
  { key: 'microsoft', label: 'Microsoft Entra ID', shortLabel: 'Microsoft', description: 'Azure AD / Microsoft 365' },
  { key: 'google', label: 'Google Workspace', shortLabel: 'Google', description: 'Google Workspace SSO' },
  { key: 'oidc', label: 'Custom OpenID Connect', shortLabel: 'OIDC', description: 'Anpassad OIDC-provider (Okta, Auth0, Keycloak m.fl.)' },
];

const FALLBACK_POLICIES = [
  { value: 'sso_only', label: 'Endast SSO', description: 'Alla måste använda SSO' },
  { value: 'sso_plus_magic_link', label: 'SSO + Magic Link', description: 'SSO primärt, Magic Link som alternativ' },
  { value: 'sso_plus_passwordless', label: 'SSO + Lösenordsfritt', description: 'SSO primärt, lösenordsfritt som alternativ' },
];

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
  if (!isEnabled) return <Badge variant="outline" className="text-[10px] text-muted-foreground border-border">Inaktiverad</Badge>;
  if (isReady && lastTestResult === 'success') return <Badge variant="outline" className="text-[10px] border-green-300 text-green-700 dark:border-green-800 dark:text-green-400 gap-0.5"><CheckCircle2 className="w-2.5 h-2.5" />Redo</Badge>;
  if (isConfigured && !isReady) return <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400 gap-0.5"><AlertTriangle className="w-2.5 h-2.5" />Ej verifierad</Badge>;
  if (!isConfigured) return <Badge variant="outline" className="text-[10px] border-orange-300 text-orange-700 dark:border-orange-800 dark:text-orange-400 gap-0.5"><XCircle className="w-2.5 h-2.5" />Ej konfigurerad</Badge>;
  if (lastError) return <Badge variant="outline" className="text-[10px] border-destructive/50 text-destructive gap-0.5"><XCircle className="w-2.5 h-2.5" />Fel</Badge>;
  return null;
}

function formatTestTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('sv-SE') + ' ' + d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return null;
  }
}

function IdentityProviderCard({
  providerKey,
  label,
  description,
  provider,
  readiness,
  enabled,
  originalEnabled,
  isPrimary,
  canEdit,
  actionProvider,
  testingProvider,
  connectingProvider,
  onEnabledChange,
  onSaveEnabled,
  onDiscardEnabled,
  onTestSSO,
  onConnectSSO,
  onDisableProvider,
  onRemoveProvider,
  onResetProvider,
  setActionProvider,
  setTestingProvider,
  setConnectingProvider,
  oidcIssuer,
  oidcClientId,
  oidcClientSecret,
  setOidcIssuer,
  setOidcClientId,
  setOidcClientSecret,
}: IdentityProviderCardProps) {
  const isDirty = enabled !== originalEnabled;
  const lastTestedAt = formatTestTime(readiness?.lastTestedAt ?? provider?.lastTestedAt);

  const getOidcConfig = useCallback(() => {
    const cfg: Record<string, string> = {};
    if (oidcIssuer.trim()) cfg.issuer = oidcIssuer.trim();
    if (oidcClientId.trim()) cfg.clientId = oidcClientId.trim();
    if (oidcClientSecret.trim()) cfg.clientSecret = oidcClientSecret.trim();
    return Object.keys(cfg).length > 0 ? cfg : undefined;
  }, [oidcIssuer, oidcClientId, oidcClientSecret]);

  const doSave = useCallback(async () => {
    if (!isDirty) return;
    await onSaveEnabled();
  }, [isDirty, onSaveEnabled]);

  const { status, save, discard, isSaving } = useManualSave({ onSave: doSave, onDiscard: onDiscardEnabled });

  const handleTestProvider = useCallback(async () => {
    if (!onTestSSO) return;
    setTestingProvider(providerKey);
    try {
      await onTestSSO(providerKey, providerKey === 'oidc' ? getOidcConfig() : undefined);
    } finally {
      setTestingProvider(null);
    }
  }, [onTestSSO, providerKey, setTestingProvider, getOidcConfig]);

  const handleConnectProvider = useCallback(async () => {
    if (!onConnectSSO) return;
    setConnectingProvider(providerKey);
    try {
      await onConnectSSO(providerKey, providerKey === 'oidc' ? getOidcConfig() : undefined);
    } finally {
      setConnectingProvider(null);
    }
  }, [onConnectSSO, providerKey, setConnectingProvider, getOidcConfig]);

  return (
    <div className={`rounded-xl border p-4 space-y-3 transition-colors ${enabled ? 'border-primary/30 bg-card shadow-sm' : 'border-border bg-card/50'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${enabled ? 'bg-primary/10' : 'bg-muted/50'}`}>
            <Key className={`w-4 h-4 ${enabled ? 'text-primary' : 'text-muted-foreground'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{label}</span>
              {isPrimary && <Badge className="text-[9px] px-1.5 py-0 h-4 bg-primary/15 text-primary border-0">Primär</Badge>}
            </div>
            <p className="text-[11px] text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusIndicator readiness={readiness} provider={provider} />
          <Switch checked={enabled} onCheckedChange={onEnabledChange} disabled={!canEdit || isSaving} />
        </div>
      </div>

      {enabled && (
        <div className="space-y-3">
          {provider?.clientIdConfigured && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><CheckCircle2 className="w-3 h-3 text-green-500" />Client ID konfigurerad</div>
          )}
          {providerKey === 'microsoft' && provider?.tenantMode && (
            <div className="text-[11px] text-muted-foreground">Tenant-läge: <span className="font-medium text-foreground">{provider.tenantMode}</span>{provider.enforceOrganizationAccountOnly && <span className="ml-2 text-muted-foreground">(Organisationskonton)</span>}</div>
          )}
          {providerKey === 'google' && provider?.hostedDomain && (
            <div className="text-[11px] text-muted-foreground">Hosted domain: <span className="font-medium text-foreground">{provider.hostedDomain}</span></div>
          )}
          {providerKey === 'oidc' && (
            <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">OIDC-konfiguration</p>
              {provider?.issuer && <div className="text-[11px] text-muted-foreground truncate">Sparad issuer: <span className="font-medium text-foreground">{provider.issuer}</span></div>}
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Issuer URL</Label>
                <Input value={oidcIssuer} onChange={e => setOidcIssuer(e.target.value)} placeholder="https://company.okta.com/oauth2/default" className="h-8 text-xs" disabled={!canEdit || isSaving} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Client ID</Label>
                <Input value={oidcClientId} onChange={e => setOidcClientId(e.target.value)} placeholder="Client ID" className="h-8 text-xs" disabled={!canEdit || isSaving} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Client Secret</Label>
                <Input type="password" value={oidcClientSecret} onChange={e => setOidcClientSecret(e.target.value)} placeholder="Client Secret" className="h-8 text-xs" disabled={!canEdit || isSaving} />
              </div>
              <p className="text-[10px] text-muted-foreground">Backend hämtar endpoints automatiskt via <code>.well-known/openid-configuration</code></p>
            </div>
          )}
          {lastTestedAt && <div className="text-[11px] text-muted-foreground">Senast testad: {lastTestedAt}</div>}
          {readiness?.lastError && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg border border-destructive/20 bg-destructive/5">
              <XCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" /><p className="text-[11px] text-destructive">{readiness.lastError}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {onTestSSO && (
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={handleTestProvider} disabled={testingProvider === providerKey || !!actionProvider || isSaving}>
                {testingProvider === providerKey ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}Verifiera
              </Button>
            )}
            {onConnectSSO && !readiness?.ready && (
              <Button variant="default" size="sm" className="h-7 text-xs gap-1.5" onClick={handleConnectProvider} disabled={connectingProvider === providerKey || !!actionProvider || isSaving}>
                {connectingProvider === providerKey ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}Konfigurera
              </Button>
            )}
            {canEdit && onDisableProvider && readiness?.enabled && (
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-950/30"
                onClick={async () => { setActionProvider(providerKey); try { await onDisableProvider(providerKey); } finally { setActionProvider(null); } }} disabled={!!actionProvider || isSaving}>
                {actionProvider === providerKey ? <Loader2 className="w-3 h-3 animate-spin" /> : <Ban className="w-3 h-3" />}Inaktivera
              </Button>
            )}
            {canEdit && onResetProvider && readiness?.configured && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground" disabled={!!actionProvider || isSaving}><RotateCcw className="w-3 h-3" />Återställ</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>Återställ {label}?</AlertDialogTitle><AlertDialogDescription>Detta inaktiverar providern, rensar sparad test-/godkännandestatus och kräver att nästa anslutningsförsök går igenom en interaktiv prompt.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Avbryt</AlertDialogCancel><AlertDialogAction onClick={async () => { setActionProvider(providerKey); try { await onResetProvider(providerKey); } finally { setActionProvider(null); } }}>Återställ</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {canEdit && onRemoveProvider && readiness?.configured && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5" disabled={!!actionProvider || isSaving}><Trash2 className="w-3 h-3" />Ta bort</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>Ta bort {label}?</AlertDialogTitle><AlertDialogDescription>Detta raderar all sparad konfiguration. Du behöver konfigurera om providern från grunden.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Avbryt</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => { setActionProvider(providerKey); try { await onRemoveProvider(providerKey); } finally { setActionProvider(null); } }}>Ta bort provider</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      )}

      <CardSaveFooter status={status} isDirty={isDirty} onSave={save} onDiscard={discard} disabled={!canEdit} />
    </div>
  );
}

export function EnterpriseSettingsIdentity({ settings, locks, canEdit, onUpdate, onTestSSO, onConnectSSO, onDisableProvider, onRemoveProvider, onResetProvider, providerReadiness, hasVerifiedDomain, defaultLoginHostname }: Props) {
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [actionProvider, setActionProvider] = useState<string | null>(null);
  const [domainInput, setDomainInput] = useState('');
  const [oidcIssuer, setOidcIssuer] = useState('');
  const [oidcClientId, setOidcClientId] = useState('');
  const [oidcClientSecret, setOidcClientSecret] = useState('');

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

    const nextProviderEnabled: Record<string, boolean> = {};
    const providerSettings = settings.providers || {};
    PROVIDERS.forEach((provider) => {
      nextProviderEnabled[provider.key] = (providerSettings as any)[provider.key]?.enabled ?? false;
    });
    setProviderEnabled(nextProviderEnabled);
  }, [settings]);

  const isLocked = (path: string) => !!locks[`identityAccess.${path}`]?.locked;
  const getLock = (path: string) => locks[`identityAccess.${path}`];

  const ssoCardDirty = useMemo(() => (
    ssoEnabled !== (settings.ssoEnabled ?? false) ||
    ssoOnlyLogin !== (settings.ssoOnlyLogin ?? false) ||
    primaryProvider !== (settings.primaryProvider || '') ||
    fallbackPolicy !== (settings.fallbackPolicy || 'sso_only')
  ), [ssoEnabled, ssoOnlyLogin, primaryProvider, fallbackPolicy, settings]);

  const saveSsoCard = useCallback(async () => {
    if (!canEdit || !ssoCardDirty) return;
    await onUpdate({
      identityAccess: {
        ssoEnabled,
        ssoOnlyLogin,
        primaryProvider: primaryProvider || undefined,
        fallbackPolicy,
      },
    });
  }, [canEdit, ssoCardDirty, ssoEnabled, ssoOnlyLogin, primaryProvider, fallbackPolicy, onUpdate]);

  const discardSsoCard = useCallback(() => {
    setSsoEnabled(settings.ssoEnabled ?? false);
    setSsoOnlyLogin(settings.ssoOnlyLogin ?? false);
    setPrimaryProvider(settings.primaryProvider || '');
    setFallbackPolicy(settings.fallbackPolicy || 'sso_only');
  }, [settings]);

  const ssoSave = useManualSave({ onSave: saveSsoCard, onDiscard: discardSsoCard });

  const userProvisioningDirty = useMemo(() => (
    jitProvisioningEnabled !== (settings.jitProvisioningEnabled ?? false) ||
    groupSyncEnabled !== (settings.groupSyncEnabled ?? false) ||
    scimEnabled !== (settings.scimEnabled ?? false)
  ), [jitProvisioningEnabled, groupSyncEnabled, scimEnabled, settings]);

  const saveUserProvisioning = useCallback(async () => {
    if (!canEdit || !userProvisioningDirty) return;
    await onUpdate({
      identityAccess: {
        jitProvisioningEnabled,
        groupSyncEnabled,
        scimEnabled,
      },
    });
  }, [canEdit, userProvisioningDirty, jitProvisioningEnabled, groupSyncEnabled, scimEnabled, onUpdate]);

  const discardUserProvisioning = useCallback(() => {
    setJitProvisioningEnabled(settings.jitProvisioningEnabled ?? false);
    setGroupSyncEnabled(settings.groupSyncEnabled ?? false);
    setScimEnabled(settings.scimEnabled ?? false);
  }, [settings]);

  const userProvisioningSave = useManualSave({ onSave: saveUserProvisioning, onDiscard: discardUserProvisioning });

  const domainRestrictionsDirty = useMemo(() => (
    JSON.stringify(domainRestrictions) !== JSON.stringify(settings.domainRestrictions || [])
  ), [domainRestrictions, settings]);

  const saveDomainRestrictions = useCallback(async () => {
    if (!canEdit || !domainRestrictionsDirty) return;
    await onUpdate({
      identityAccess: {
        domainRestrictions,
      },
    });
  }, [canEdit, domainRestrictionsDirty, domainRestrictions, onUpdate]);

  const discardDomainRestrictions = useCallback(() => {
    setDomainRestrictions(settings.domainRestrictions || []);
    setDomainInput('');
  }, [settings]);

  const domainRestrictionsSave = useManualSave({ onSave: saveDomainRestrictions, onDiscard: discardDomainRestrictions });

  const defaultRoleDirty = useMemo(() => (
    defaultAnchorRole !== (settings.defaultAnchorRole || 'member')
  ), [defaultAnchorRole, settings]);

  const saveDefaultRole = useCallback(async () => {
    if (!canEdit || !defaultRoleDirty) return;
    await onUpdate({
      identityAccess: {
        defaultAnchorRole,
      },
    });
  }, [canEdit, defaultRoleDirty, defaultAnchorRole, onUpdate]);

  const discardDefaultRole = useCallback(() => {
    setDefaultAnchorRole(settings.defaultAnchorRole || 'member');
  }, [settings]);

  const defaultRoleSave = useManualSave({ onSave: saveDefaultRole, onDiscard: discardDefaultRole });

  const saveProviderEnabled = useCallback(async (providerKey: string) => {
    if (!canEdit) return;
    const originalEnabled = (settings.providers as any)?.[providerKey]?.enabled ?? false;
    const currentEnabled = providerEnabled[providerKey] ?? false;
    if (currentEnabled === originalEnabled) return;

    await onUpdate({
      identityAccess: {
        providers: {
          [providerKey]: {
            enabled: currentEnabled,
          },
        },
      },
    });
  }, [canEdit, providerEnabled, settings.providers, onUpdate]);

  const discardProviderEnabled = useCallback((providerKey: string) => {
    const originalEnabled = (settings.providers as any)?.[providerKey]?.enabled ?? false;
    setProviderEnabled((prev) => ({ ...prev, [providerKey]: originalEnabled }));
  }, [settings.providers]);

  const addDomain = useCallback(() => {
    const domain = domainInput.trim().toLowerCase();
    if (!domain || domainRestrictions.includes(domain)) return;
    setDomainRestrictions((prev) => [...prev, domain]);
    setDomainInput('');
  }, [domainInput, domainRestrictions]);

  const removeDomain = useCallback((domain: string) => {
    setDomainRestrictions((prev) => prev.filter((d) => d !== domain));
  }, []);

  const providers = settings.providers || {};

  return (
    <div className="space-y-6">
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
            <Switch checked={ssoEnabled} onCheckedChange={setSsoEnabled} disabled={!canEdit || isLocked('ssoEnabled') || ssoSave.isSaving || !hasVerifiedDomain} />
          </div>
        </div>

        {!hasVerifiedDomain && (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-700 dark:text-amber-300">
              <p className="font-medium">Verifierad domän krävs</p>
              <p className="mt-0.5">Lägg till och verifiera en anpassad domän under fliken "Arbetsyta" innan SSO kan aktiveras.</p>
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
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-medium">Kräv SSO-inloggning</p><p className="text-xs text-muted-foreground">Blockera vanlig e-post/magic-link för enterprise-medlemmar</p></div>
              <div className="flex items-center gap-2">
                <LockedBadge lock={getLock('ssoOnlyLogin')} />
                <Switch checked={ssoOnlyLogin} onCheckedChange={setSsoOnlyLogin} disabled={!canEdit || isLocked('ssoOnlyLogin') || ssoSave.isSaving} />
              </div>
            </div>
            {ssoOnlyLogin && (
              <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-300">Alla medlemmar måste logga in via SSO. Vanlig inloggning blockeras.</p>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Primär provider</Label>
              <Select value={primaryProvider} onValueChange={setPrimaryProvider} disabled={!canEdit || isLocked('primaryProvider') || ssoSave.isSaving}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Välj provider" /></SelectTrigger>
                <SelectContent>{PROVIDERS.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Fallback-policy</Label>
              <Select value={fallbackPolicy} onValueChange={setFallbackPolicy} disabled={!canEdit || isLocked('fallbackPolicy') || ssoSave.isSaving}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{FALLBACK_POLICIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">{FALLBACK_POLICIES.find(p => p.value === fallbackPolicy)?.description}</p>
            </div>
          </>
        )}

        <CardSaveFooter status={ssoSave.status} isDirty={ssoCardDirty} onSave={ssoSave.save} onDiscard={ssoSave.discard} disabled={!canEdit} />
      </div>

      {/* Provider Cards */}
      {ssoEnabled && hasVerifiedDomain && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-foreground">Identity Providers</h4>
          <div className="grid gap-3">
            {PROVIDERS.map(({ key, label, description }) => (
              <IdentityProviderCard
                key={key}
                providerKey={key}
                label={label}
                description={description}
                provider={(providers as any)[key] as EnterpriseProvider | undefined}
                readiness={providerReadiness?.[key]}
                enabled={providerEnabled[key] ?? false}
                originalEnabled={(providers as any)[key]?.enabled ?? false}
                isPrimary={primaryProvider === key}
                canEdit={canEdit}
                actionProvider={actionProvider}
                testingProvider={testingProvider}
                connectingProvider={connectingProvider}
                onEnabledChange={(value) => setProviderEnabled((prev) => ({ ...prev, [key]: value }))}
                onSaveEnabled={() => saveProviderEnabled(key)}
                onDiscardEnabled={() => discardProviderEnabled(key)}
                onTestSSO={onTestSSO}
                onConnectSSO={onConnectSSO}
                onDisableProvider={onDisableProvider}
                onRemoveProvider={onRemoveProvider}
                onResetProvider={onResetProvider}
                setActionProvider={setActionProvider}
                setTestingProvider={setTestingProvider}
                setConnectingProvider={setConnectingProvider}
                oidcIssuer={oidcIssuer}
                oidcClientId={oidcClientId}
                oidcClientSecret={oidcClientSecret}
                setOidcIssuer={setOidcIssuer}
                setOidcClientId={setOidcClientId}
                setOidcClientSecret={setOidcClientSecret}
              />
            ))}
          </div>
        </div>
      )}

      {/* JIT & Group Sync */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h4 className="text-sm font-medium flex items-center gap-2"><Zap className="w-4 h-4 text-primary" />Automatisk användarhantering</h4>
        <div className="flex items-center justify-between">
          <div><p className="text-sm">JIT-provisionering</p><p className="text-xs text-muted-foreground">Skapa konton automatiskt vid första SSO-inloggning</p></div>
          <Switch checked={jitProvisioningEnabled} onCheckedChange={setJitProvisioningEnabled} disabled={!canEdit || isLocked('jitProvisioningEnabled') || userProvisioningSave.isSaving} />
        </div>
        <div className="flex items-center justify-between">
          <div><p className="text-sm">Gruppsynkronisering</p><p className="text-xs text-muted-foreground">Synka grupper från identity provider</p></div>
          <Switch checked={groupSyncEnabled} onCheckedChange={setGroupSyncEnabled} disabled={!canEdit || isLocked('groupSyncEnabled') || userProvisioningSave.isSaving} />
        </div>
        <div className="flex items-center justify-between">
          <div><p className="text-sm">SCIM</p><p className="text-xs text-muted-foreground">Automatisk användarhantering via SCIM</p></div>
          <Switch checked={scimEnabled} onCheckedChange={setScimEnabled} disabled={!canEdit || isLocked('scimEnabled') || userProvisioningSave.isSaving} />
        </div>
        <CardSaveFooter status={userProvisioningSave.status} isDirty={userProvisioningDirty} onSave={userProvisioningSave.save} onDiscard={userProvisioningSave.discard} disabled={!canEdit} />
      </div>

      {/* Domain Restrictions */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h4 className="text-sm font-medium flex items-center gap-2"><Globe className="w-4 h-4 text-primary" />Domänbegränsningar</h4>
        <p className="text-xs text-muted-foreground">Begränsa vilka e-postdomäner som kan logga in via SSO</p>
        <div className="flex flex-wrap gap-2">
          {domainRestrictions.map(d => (
            <Badge key={d} variant="secondary" className="text-xs gap-1">{d}{canEdit && !isLocked('domainRestrictions') && <button onClick={() => removeDomain(d)} className="ml-1 hover:text-destructive">×</button>}</Badge>
          ))}
          {domainRestrictions.length === 0 && <p className="text-[11px] text-muted-foreground italic">Inga domänbegränsningar — alla domäner tillåts</p>}
        </div>
        {canEdit && !isLocked('domainRestrictions') && (
          <div className="flex gap-2">
            <Input value={domainInput} onChange={e => setDomainInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addDomain()} placeholder="example.se" className="h-8 text-sm flex-1" />
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={addDomain} disabled={!domainInput.trim()}>Lägg till</Button>
          </div>
        )}
        <CardSaveFooter status={domainRestrictionsSave.status} isDirty={domainRestrictionsDirty} onSave={domainRestrictionsSave.save} onDiscard={domainRestrictionsSave.discard} disabled={!canEdit} />
      </div>

      {/* Default role */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h4 className="text-sm font-medium flex items-center gap-2"><Users className="w-4 h-4 text-primary" />Standardroller vid SSO</h4>
        <p className="text-xs text-muted-foreground">Vilken roll ska nya användare tilldelas vid automatisk provisionering</p>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Standardroll (anchor)</Label>
          <Select value={defaultAnchorRole} onValueChange={setDefaultAnchorRole} disabled={!canEdit || defaultRoleSave.isSaving}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Medlem</SelectItem>
              <SelectItem value="viewer">Läsare</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <CardSaveFooter status={defaultRoleSave.status} isDirty={defaultRoleDirty} onSave={defaultRoleSave.save} onDiscard={defaultRoleSave.discard} disabled={!canEdit} />
      </div>
    </div>
  );
}
