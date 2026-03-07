import { useState, useEffect } from 'react';
import { Building2, Palette, Users, Lock, Mail, Link2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  const [saving, setSaving] = useState(false);
  const { refreshBranding } = useEnterpriseBranding();
  const branding = settings.branding || {};
  const invitePolicy = settings.invitePolicy || {};

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
  }, [branding]);

  const isLocked = (path: string) => !!locks[`adminWorkspace.${path}`]?.locked;

  const updateField = async (path: string, value: any) => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const parts = path.split('.');
      let patch: any = {};
      let ref = patch;
      for (let i = 0; i < parts.length - 1; i++) {
        ref[parts[i]] = {};
        ref = ref[parts[i]];
      }
      ref[parts[parts.length - 1]] = value;
      await onUpdate({ adminWorkspace: patch });
      await refreshBranding();
    } finally { setSaving(false); }
  };

  const fieldRow = (label: string, value: string, setter: (v: string) => void, path: string, placeholder: string) => (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={e => setter(e.target.value)}
        onBlur={() => updateField(path, value || null)}
        disabled={!canEdit || isLocked(path) || saving}
        className="h-9 text-sm"
        placeholder={placeholder}
      />
    </div>
  );

  return (
    <div className="space-y-6">
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
            checked={branding.emailBrandingEnabled ?? false}
            onCheckedChange={v => updateField('branding.emailBrandingEnabled', v)}
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
            checked={invitePolicy.domainRestrictedInvites ?? false}
            onCheckedChange={v => updateField('invitePolicy.domainRestrictedInvites', v)}
            disabled={!canEdit || saving}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">Tillåt externa gäster</p>
            <p className="text-xs text-muted-foreground">Låt användare utanför organisationen bjudas in</p>
          </div>
          <Switch
            checked={invitePolicy.allowExternalGuests ?? false}
            onCheckedChange={v => updateField('invitePolicy.allowExternalGuests', v)}
            disabled={!canEdit || saving}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">Teamhantering</p>
            <p className="text-xs text-muted-foreground">Aktivera interna arbetsgrupper</p>
          </div>
          <Switch
            checked={settings.teamManagementEnabled ?? true}
            onCheckedChange={v => updateField('teamManagementEnabled', v)}
            disabled={!canEdit || saving}
          />
        </div>
      </div>
    </div>
  );
}
