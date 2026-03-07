import { useState, useEffect, useMemo, useCallback } from 'react';
import { Building2, Palette, Users, Lock, Mail, Link2 } from 'lucide-react';
import { EnterpriseSaveBar } from './EnterpriseSaveBar';
import { useAutoSave } from '@/hooks/useAutoSave';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useEnterpriseBranding } from '@/contexts/EnterpriseBrandingContext';
import type { AdminWorkspaceSettings, SettingsLock } from '@/lib/enterpriseSettingsApi';

interface Props {
  settings: Partial<AdminWorkspaceSettings>;
  locks: Record<string, SettingsLock>;
  canEdit: boolean;
  onUpdate: (patch: Record<string, any>) => Promise<void>;
}

export function EnterpriseSettingsWorkspace({ settings, locks, canEdit, onUpdate }: Props) {
  const { refreshBranding } = useEnterpriseBranding();
  const branding = settings.branding || {};
  const invitePolicy = settings.invitePolicy || {};

  // Local state for all fields
  const [workspaceName, setWorkspaceName] = useState(branding.workspaceDisplayName || '');
  const [legalName, setLegalName] = useState((branding as any).legalEntityName || '');
  const [logoUrl, setLogoUrl] = useState(branding.logoUrl || '');
  const [wordmarkUrl, setWordmarkUrl] = useState((branding as any).wordmarkUrl || '');
  const [faviconUrl, setFaviconUrl] = useState((branding as any).faviconUrl || '');
  const [loginTitle, setLoginTitle] = useState((branding as any).loginTitle || '');
  const [loginSubtitle, setLoginSubtitle] = useState((branding as any).loginSubtitle || '');
  const [supportEmail, setSupportEmail] = useState((branding as any).supportEmail || '');
  const [supportUrl, setSupportUrl] = useState((branding as any).supportUrl || '');
  const [privacyUrl, setPrivacyUrl] = useState((branding as any).privacyUrl || '');
  const [termsUrl, setTermsUrl] = useState((branding as any).termsUrl || '');
  const [emailBrandingEnabled, setEmailBrandingEnabled] = useState(branding.emailBrandingEnabled ?? false);
  const [domainRestrictedInvites, setDomainRestrictedInvites] = useState(invitePolicy.domainRestrictedInvites ?? false);
  const [allowExternalGuests, setAllowExternalGuests] = useState(invitePolicy.allowExternalGuests ?? false);
  const [teamManagementEnabled, setTeamManagementEnabled] = useState(settings.teamManagementEnabled ?? true);

  // Sync from props when settings change (e.g. after save)
  useEffect(() => {
    setWorkspaceName(branding.workspaceDisplayName || '');
    setLegalName((branding as any).legalEntityName || '');
    setLogoUrl(branding.logoUrl || '');
    setWordmarkUrl((branding as any).wordmarkUrl || '');
    setFaviconUrl((branding as any).faviconUrl || '');
    setLoginTitle((branding as any).loginTitle || '');
    setLoginSubtitle((branding as any).loginSubtitle || '');
    setSupportEmail((branding as any).supportEmail || '');
    setSupportUrl((branding as any).supportUrl || '');
    setPrivacyUrl((branding as any).privacyUrl || '');
    setTermsUrl((branding as any).termsUrl || '');
    setEmailBrandingEnabled(branding.emailBrandingEnabled ?? false);
    setDomainRestrictedInvites(invitePolicy.domainRestrictedInvites ?? false);
    setAllowExternalGuests(invitePolicy.allowExternalGuests ?? false);
    setTeamManagementEnabled(settings.teamManagementEnabled ?? true);
  }, [settings]);

  // Dirty check
  const isDirty = useMemo(() => {
    return (
      workspaceName !== (branding.workspaceDisplayName || '') ||
      legalName !== ((branding as any).legalEntityName || '') ||
      logoUrl !== (branding.logoUrl || '') ||
      wordmarkUrl !== ((branding as any).wordmarkUrl || '') ||
      faviconUrl !== ((branding as any).faviconUrl || '') ||
      loginTitle !== ((branding as any).loginTitle || '') ||
      loginSubtitle !== ((branding as any).loginSubtitle || '') ||
      supportEmail !== ((branding as any).supportEmail || '') ||
      supportUrl !== ((branding as any).supportUrl || '') ||
      privacyUrl !== ((branding as any).privacyUrl || '') ||
      termsUrl !== ((branding as any).termsUrl || '') ||
      emailBrandingEnabled !== (branding.emailBrandingEnabled ?? false) ||
      domainRestrictedInvites !== (invitePolicy.domainRestrictedInvites ?? false) ||
      allowExternalGuests !== (invitePolicy.allowExternalGuests ?? false) ||
      teamManagementEnabled !== (settings.teamManagementEnabled ?? true)
    );
  }, [workspaceName, legalName, logoUrl, wordmarkUrl, faviconUrl, loginTitle, loginSubtitle, supportEmail, supportUrl, privacyUrl, termsUrl, emailBrandingEnabled, domainRestrictedInvites, allowExternalGuests, teamManagementEnabled, settings]);

  const isLocked = (path: string) => !!locks[`adminWorkspace.${path}`]?.locked;

  const handleSave = useCallback(async () => {
    if (!canEdit || !isDirty) return;
    await onUpdate({
      adminWorkspace: {
        branding: {
          workspaceDisplayName: workspaceName || null,
          legalEntityName: legalName || null,
          logoUrl: logoUrl || null,
          wordmarkUrl: wordmarkUrl || null,
          faviconUrl: faviconUrl || null,
          loginTitle: loginTitle || null,
          loginSubtitle: loginSubtitle || null,
          supportEmail: supportEmail || null,
          supportUrl: supportUrl || null,
          privacyUrl: privacyUrl || null,
          termsUrl: termsUrl || null,
          emailBrandingEnabled,
        },
        invitePolicy: {
          domainRestrictedInvites,
          allowExternalGuests,
        },
        teamManagementEnabled,
      },
    });
    await refreshBranding();
  }, [canEdit, isDirty, workspaceName, legalName, logoUrl, wordmarkUrl, faviconUrl, loginTitle, loginSubtitle, supportEmail, supportUrl, privacyUrl, termsUrl, emailBrandingEnabled, domainRestrictedInvites, allowExternalGuests, teamManagementEnabled, onUpdate, refreshBranding]);

  const { status: autoSaveStatus, saving } = useAutoSave({ isDirty, canEdit, onSave: handleSave, debounceMs: 1200 });

  const fieldRow = (label: string, value: string, setter: (v: string) => void, path: string, placeholder: string) => (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={e => setter(e.target.value)}
        disabled={!canEdit || isLocked(path) || saving}
        className="h-9 text-sm"
        placeholder={placeholder}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <EnterpriseSaveBar status={autoSaveStatus} />
      {/* Branding & Identity */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Palette className="w-5 h-5 text-primary" /></div>
          <div>
            <h3 className="font-medium text-sm">Varumärke & Identitet</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Anpassa arbetsytans utseende och inloggningssida</p>
          </div>
        </div>
        <div className="space-y-3">
          {fieldRow('Arbetsytans namn', workspaceName, setWorkspaceName, 'branding.workspaceDisplayName', 'Företagsnamn AB')}
          {fieldRow('Juridiskt namn', legalName, setLegalName, 'branding.legalEntityName', 'Företag AB')}
          
          <Separator />
          
          {fieldRow('Logotyp-URL', logoUrl, setLogoUrl, 'branding.logoUrl', 'https://example.se/logo.png')}
          {logoUrl && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg border border-border bg-muted/30 flex items-center justify-center overflow-hidden">
                <img src={logoUrl} alt="Logotyp" className="w-full h-full object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </div>
              <span className="text-[11px] text-muted-foreground truncate max-w-[200px]">{logoUrl}</span>
            </div>
          )}
          
          {fieldRow('Ordmärke (wordmark) URL', wordmarkUrl, setWordmarkUrl, 'branding.wordmarkUrl', 'https://example.se/wordmark.png')}
          {fieldRow('Favicon URL', faviconUrl, setFaviconUrl, 'branding.faviconUrl', 'https://example.se/favicon.ico')}
        </div>
      </div>

      {/* Login appearance */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Lock className="w-5 h-5 text-primary" /></div>
          <div>
            <h3 className="font-medium text-sm">Inloggningssida</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Anpassa texterna på din enterprise-inloggningssida</p>
          </div>
        </div>
        <div className="space-y-3">
          {fieldRow('Inloggningstitel', loginTitle, setLoginTitle, 'branding.loginTitle', 'Välkommen till Företaget')}
          {fieldRow('Inloggningsundertext', loginSubtitle, setLoginSubtitle, 'branding.loginSubtitle', 'Logga in med ditt företagskonto')}
        </div>
      </div>

      {/* Support & Legal links */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Link2 className="w-5 h-5 text-primary" /></div>
          <div>
            <h3 className="font-medium text-sm">Support & Juridik</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Kontaktuppgifter och juridiska länkar</p>
          </div>
        </div>
        <div className="space-y-3">
          {fieldRow('Support-e-post', supportEmail, setSupportEmail, 'branding.supportEmail', 'support@foretag.se')}
          {fieldRow('Support-URL', supportUrl, setSupportUrl, 'branding.supportUrl', 'https://foretag.se/support')}
          {fieldRow('Integritetspolicy-URL', privacyUrl, setPrivacyUrl, 'branding.privacyUrl', 'https://foretag.se/privacy')}
          {fieldRow('Användarvillkor-URL', termsUrl, setTermsUrl, 'branding.termsUrl', 'https://foretag.se/terms')}
        </div>
      </div>

      {/* Email branding */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Mail className="w-5 h-5 text-primary" /></div>
          <div>
            <h3 className="font-medium text-sm">E-postvarumärke</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Anpassa enterprise-e-postmeddelanden som inbjudningar</p>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">Aktivera e-postvarumärke</p>
            <p className="text-xs text-muted-foreground">Använd organisationens logotyp och färger i inbjudningsmail. Tivlys standardmail (inloggningskoder) påverkas inte.</p>
          </div>
          <Switch
            checked={emailBrandingEnabled}
            onCheckedChange={setEmailBrandingEnabled}
            disabled={!canEdit || saving}
          />
        </div>
      </div>

      {/* Policies */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Users className="w-5 h-5 text-primary" /></div>
          <div>
            <h3 className="font-medium text-sm">Policyer</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Styr vem som kan bjuda in, skapa möten och använda integrationer</p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">Domänbegränsade inbjudningar</p>
            <p className="text-xs text-muted-foreground">Kräv att inbjudna tillhör godkänd domän</p>
          </div>
          <Switch
            checked={domainRestrictedInvites}
            onCheckedChange={setDomainRestrictedInvites}
            disabled={!canEdit || saving}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">Tillåt externa gäster</p>
            <p className="text-xs text-muted-foreground">Låt användare utanför organisationen bjudas in</p>
          </div>
          <Switch
            checked={allowExternalGuests}
            onCheckedChange={setAllowExternalGuests}
            disabled={!canEdit || saving}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">Teamhantering</p>
            <p className="text-xs text-muted-foreground">Aktivera interna arbetsgrupper</p>
          </div>
          <Switch
            checked={teamManagementEnabled}
            onCheckedChange={setTeamManagementEnabled}
            disabled={!canEdit || saving}
          />
        </div>
      </div>

    </div>
  );
}
