import { useState } from 'react';
import { Shield, Globe, Users, Zap, Key, AlertTriangle, CheckCircle2, XCircle, Loader2, Lock } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import type { IdentityAccessSettings, EnterpriseProvider, SettingsLock } from '@/lib/enterpriseSettingsApi';

const PROVIDERS = [
  { key: 'microsoft', label: 'Microsoft', icon: '🏢' },
  { key: 'google', label: 'Google', icon: '🔍' },
  { key: 'okta', label: 'Okta', icon: '🔐' },
  { key: 'oidc', label: 'OIDC', icon: '🔗' },
  { key: 'saml', label: 'SAML', icon: '📜' },
];

const FALLBACK_POLICIES = [
  { value: 'sso_only', label: 'Endast SSO' },
  { value: 'sso_plus_magic_link', label: 'SSO + Magic Link' },
  { value: 'sso_plus_passwordless', label: 'SSO + Lösenordsfritt' },
];

interface Props {
  settings: Partial<IdentityAccessSettings>;
  locks: Record<string, SettingsLock>;
  canEdit: boolean;
  onUpdate: (patch: Record<string, any>) => Promise<void>;
  onTestSSO?: (provider: string) => Promise<void>;
  onConnectSSO?: (provider: string) => Promise<void>;
  providerReadiness?: Record<string, { ready: boolean; enabled: boolean }>;
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

export function EnterpriseSettingsIdentity({ settings, locks, canEdit, onUpdate, onTestSSO, onConnectSSO, providerReadiness }: Props) {
  const [saving, setSaving] = useState(false);
  const [domainInput, setDomainInput] = useState('');

  const isLocked = (path: string) => !!locks[`identityAccess.${path}`]?.locked;
  const getLock = (path: string) => locks[`identityAccess.${path}`];

  const handleToggle = async (field: string, value: boolean) => {
    if (!canEdit || isLocked(field)) return;
    setSaving(true);
    try {
      await onUpdate({ identityAccess: { [field]: value } });
    } finally {
      setSaving(false);
    }
  };

  const handleSelect = async (field: string, value: string) => {
    if (!canEdit || isLocked(field)) return;
    setSaving(true);
    try {
      await onUpdate({ identityAccess: { [field]: value } });
    } finally {
      setSaving(false);
    }
  };

  const addDomain = async () => {
    const d = domainInput.trim().toLowerCase();
    if (!d || isLocked('domainRestrictions')) return;
    const current = settings.domainRestrictions || [];
    if (current.includes(d)) return;
    setSaving(true);
    try {
      await onUpdate({ identityAccess: { domainRestrictions: [...current, d] } });
      setDomainInput('');
    } finally {
      setSaving(false);
    }
  };

  const removeDomain = async (domain: string) => {
    if (isLocked('domainRestrictions')) return;
    const current = settings.domainRestrictions || [];
    setSaving(true);
    try {
      await onUpdate({ identityAccess: { domainRestrictions: current.filter(d => d !== domain) } });
    } finally {
      setSaving(false);
    }
  };

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
              <p className="text-xs text-muted-foreground mt-0.5">Aktivera SSO-inloggning för organisationen</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LockedBadge lock={getLock('ssoEnabled')} />
            <Switch
              checked={settings.ssoEnabled ?? false}
              onCheckedChange={(v) => handleToggle('ssoEnabled', v)}
              disabled={!canEdit || isLocked('ssoEnabled') || saving}
            />
          </div>
        </div>

        {settings.ssoEnabled && (
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
                  checked={settings.ssoOnlyLogin ?? false}
                  onCheckedChange={(v) => handleToggle('ssoOnlyLogin', v)}
                  disabled={!canEdit || isLocked('ssoOnlyLogin') || saving}
                />
              </div>
            </div>
            {settings.ssoOnlyLogin && (
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
              <Select
                value={settings.primaryProvider || ''}
                onValueChange={(v) => handleSelect('primaryProvider', v)}
                disabled={!canEdit || isLocked('primaryProvider') || saving}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Välj provider" /></SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map(p => (
                    <SelectItem key={p.key} value={p.key}>{p.icon} {p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Fallback policy */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Fallback-policy</Label>
              <Select
                value={settings.fallbackPolicy || 'sso_only'}
                onValueChange={(v) => handleSelect('fallbackPolicy', v)}
                disabled={!canEdit || isLocked('fallbackPolicy') || saving}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FALLBACK_POLICIES.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>

      {/* Provider Cards */}
      {settings.ssoEnabled && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-foreground">Providers</h4>
          <div className="grid gap-3">
            {PROVIDERS.map(({ key, label, icon }) => {
              const provider = providers[key] as EnterpriseProvider | undefined;
              const readiness = providerReadiness?.[key];
              const isEnabled = provider?.enabled ?? false;
              const isReady = readiness?.ready ?? false;

              return (
                <div key={key} className="rounded-lg border border-border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{icon}</span>
                      <span className="text-sm font-medium">{label}</span>
                      {isEnabled && isReady && (
                        <Badge variant="outline" className="text-[10px] border-green-300 text-green-700 dark:border-green-800 dark:text-green-400">
                          <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />Redo
                        </Badge>
                      )}
                      {isEnabled && !isReady && (
                        <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400">
                          <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />Ofullständig
                        </Badge>
                      )}
                      {!isEnabled && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">Inaktiv</Badge>
                      )}
                    </div>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={async (v) => {
                        if (!canEdit) return;
                        setSaving(true);
                        try {
                          await onUpdate({ identityAccess: { providers: { [key]: { enabled: v } } } });
                        } finally {
                          setSaving(false);
                        }
                      }}
                      disabled={!canEdit || saving}
                    />
                  </div>

                  {isEnabled && (
                    <div className="flex gap-2">
                      {onTestSSO && (
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onTestSSO(key)}>
                          Testa
                        </Button>
                      )}
                      {onConnectSSO && (
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onConnectSSO(key)}>
                          Anslut
                        </Button>
                      )}
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
          <Switch
            checked={settings.jitProvisioningEnabled ?? false}
            onCheckedChange={(v) => handleToggle('jitProvisioningEnabled', v)}
            disabled={!canEdit || isLocked('jitProvisioningEnabled') || saving}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">Gruppsynkronisering</p>
            <p className="text-xs text-muted-foreground">Synka grupper från identity provider</p>
          </div>
          <Switch
            checked={settings.groupSyncEnabled ?? false}
            onCheckedChange={(v) => handleToggle('groupSyncEnabled', v)}
            disabled={!canEdit || isLocked('groupSyncEnabled') || saving}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">SCIM</p>
            <p className="text-xs text-muted-foreground">Automatisk användarhantering via SCIM</p>
          </div>
          <Switch
            checked={settings.scimEnabled ?? false}
            onCheckedChange={(v) => handleToggle('scimEnabled', v)}
            disabled={!canEdit || isLocked('scimEnabled') || saving}
          />
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
          {(settings.domainRestrictions || []).map(d => (
            <Badge key={d} variant="secondary" className="text-xs gap-1">
              {d}
              {canEdit && !isLocked('domainRestrictions') && (
                <button onClick={() => removeDomain(d)} className="ml-1 hover:text-destructive">×</button>
              )}
            </Badge>
          ))}
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
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={addDomain} disabled={saving}>
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
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Standardroll (anchor)</Label>
          <Select
            value={settings.defaultAnchorRole || 'member'}
            onValueChange={(v) => handleSelect('defaultAnchorRole', v)}
            disabled={!canEdit || saving}
          >
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
