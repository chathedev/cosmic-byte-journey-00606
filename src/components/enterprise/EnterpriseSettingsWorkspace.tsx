import { useState, useEffect, useMemo, useCallback } from 'react';
import { Building2, Palette, Users, Lock, Mail, Link2 } from 'lucide-react';
import { CardSaveFooter } from './CardSaveFooter';
import { useManualSave } from '@/hooks/useManualSave';
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

// ─── Branding Card ───
function BrandingCard({ settings, locks, canEdit, onUpdate, refreshBranding }: Props & { refreshBranding: () => Promise<void> }) {
  const branding = settings.branding || {};
  const [workspaceName, setWorkspaceName] = useState(branding.workspaceDisplayName || '');
  const [legalName, setLegalName] = useState((branding as any).legalEntityName || '');
  const [logoUrl, setLogoUrl] = useState(branding.logoUrl || '');
  const [wordmarkUrl, setWordmarkUrl] = useState((branding as any).wordmarkUrl || '');
  const [faviconUrl, setFaviconUrl] = useState((branding as any).faviconUrl || '');
  const [primaryColor, setPrimaryColor] = useState(branding.primaryColor || '');
  const [accentColor, setAccentColor] = useState((branding as any).accentColor || '');

  const sync = useCallback(() => {
    setWorkspaceName(branding.workspaceDisplayName || '');
    setLegalName((branding as any).legalEntityName || '');
    setLogoUrl(branding.logoUrl || '');
    setWordmarkUrl((branding as any).wordmarkUrl || '');
    setFaviconUrl((branding as any).faviconUrl || '');
    setPrimaryColor(branding.primaryColor || '');
    setAccentColor((branding as any).accentColor || '');
  }, [settings]);

  useEffect(() => { sync(); }, [sync]);

  const isDirty = useMemo(() =>
    workspaceName !== (branding.workspaceDisplayName || '') ||
    legalName !== ((branding as any).legalEntityName || '') ||
    logoUrl !== (branding.logoUrl || '') ||
    wordmarkUrl !== ((branding as any).wordmarkUrl || '') ||
    faviconUrl !== ((branding as any).faviconUrl || '') ||
    primaryColor !== (branding.primaryColor || '') ||
    accentColor !== ((branding as any).accentColor || ''),
  [workspaceName, legalName, logoUrl, wordmarkUrl, faviconUrl, primaryColor, accentColor, settings]);

  const isLocked = (p: string) => !!locks[`adminWorkspace.${p}`]?.locked;

  const doSave = useCallback(async () => {
    if (!isDirty) return;
    await onUpdate({
      adminWorkspace: {
        branding: {
          workspaceDisplayName: workspaceName || null,
          legalEntityName: legalName || null,
          logoUrl: logoUrl || null,
          wordmarkUrl: wordmarkUrl || null,
          faviconUrl: faviconUrl || null,
          primaryColor: primaryColor || null,
          accentColor: accentColor || null,
        },
      },
    });
    await refreshBranding();
  }, [isDirty, workspaceName, legalName, logoUrl, wordmarkUrl, faviconUrl, primaryColor, accentColor, onUpdate, refreshBranding]);

  const { status, save, discard, isSaving } = useManualSave({ onSave: doSave, onDiscard: sync });

  const fieldRow = (label: string, value: string, setter: (v: string) => void, path: string, placeholder: string) => (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} onChange={e => setter(e.target.value)} disabled={!canEdit || isLocked(path) || isSaving} className="h-9 text-sm" placeholder={placeholder} />
    </div>
  );

  return (
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
        <Separator />
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Primärfärg</Label>
            <div className="flex items-center gap-2">
              <Input value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} disabled={!canEdit || isLocked('branding.primaryColor') || isSaving} className="h-9 text-sm flex-1" placeholder="#0066FF" />
              {primaryColor && <div className="w-9 h-9 rounded-lg border border-border shrink-0" style={{ backgroundColor: primaryColor }} />}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Accentfärg</Label>
            <div className="flex items-center gap-2">
              <Input value={accentColor} onChange={e => setAccentColor(e.target.value)} disabled={!canEdit || isLocked('branding.accentColor') || isSaving} className="h-9 text-sm flex-1" placeholder="#FF6600" />
              {accentColor && <div className="w-9 h-9 rounded-lg border border-border shrink-0" style={{ backgroundColor: accentColor }} />}
            </div>
          </div>
        </div>
      </div>
      <CardSaveFooter status={status} isDirty={isDirty} onSave={save} onDiscard={discard} disabled={!canEdit} />
    </div>
  );
}

// ─── Login Card ───
function LoginCard({ settings, locks, canEdit, onUpdate }: Props) {
  const branding = settings.branding || {};
  const [loginTitle, setLoginTitle] = useState((branding as any).loginTitle || '');
  const [loginSubtitle, setLoginSubtitle] = useState((branding as any).loginSubtitle || '');

  const sync = useCallback(() => {
    setLoginTitle((branding as any).loginTitle || '');
    setLoginSubtitle((branding as any).loginSubtitle || '');
  }, [settings]);

  useEffect(() => { sync(); }, [sync]);

  const isDirty = useMemo(() =>
    loginTitle !== ((branding as any).loginTitle || '') ||
    loginSubtitle !== ((branding as any).loginSubtitle || ''),
  [loginTitle, loginSubtitle, settings]);

  const doSave = useCallback(async () => {
    if (!isDirty) return;
    await onUpdate({ adminWorkspace: { branding: { loginTitle: loginTitle || null, loginSubtitle: loginSubtitle || null } } });
  }, [isDirty, loginTitle, loginSubtitle, onUpdate]);

  const { status, save, discard, isSaving } = useManualSave({ onSave: doSave, onDiscard: sync });
  const isLocked = (p: string) => !!locks[`adminWorkspace.${p}`]?.locked;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10"><Lock className="w-5 h-5 text-primary" /></div>
        <div>
          <h3 className="font-medium text-sm">Inloggningssida</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Anpassa texterna på din enterprise-inloggningssida</p>
        </div>
      </div>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Inloggningstitel</Label>
          <Input value={loginTitle} onChange={e => setLoginTitle(e.target.value)} disabled={!canEdit || isLocked('branding.loginTitle') || isSaving} className="h-9 text-sm" placeholder="Välkommen till Företaget" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Inloggningsundertext</Label>
          <Input value={loginSubtitle} onChange={e => setLoginSubtitle(e.target.value)} disabled={!canEdit || isLocked('branding.loginSubtitle') || isSaving} className="h-9 text-sm" placeholder="Logga in med ditt företagskonto" />
        </div>
      </div>
      <CardSaveFooter status={status} isDirty={isDirty} onSave={save} onDiscard={discard} disabled={!canEdit} />
    </div>
  );
}

// ─── Support Card ───
function SupportCard({ settings, locks, canEdit, onUpdate }: Props) {
  const branding = settings.branding || {};
  const [supportEmail, setSupportEmail] = useState((branding as any).supportEmail || '');
  const [supportUrl, setSupportUrl] = useState((branding as any).supportUrl || '');
  const [privacyUrl, setPrivacyUrl] = useState((branding as any).privacyUrl || '');
  const [termsUrl, setTermsUrl] = useState((branding as any).termsUrl || '');

  const sync = useCallback(() => {
    setSupportEmail((branding as any).supportEmail || '');
    setSupportUrl((branding as any).supportUrl || '');
    setPrivacyUrl((branding as any).privacyUrl || '');
    setTermsUrl((branding as any).termsUrl || '');
  }, [settings]);

  useEffect(() => { sync(); }, [sync]);

  const isDirty = useMemo(() =>
    supportEmail !== ((branding as any).supportEmail || '') ||
    supportUrl !== ((branding as any).supportUrl || '') ||
    privacyUrl !== ((branding as any).privacyUrl || '') ||
    termsUrl !== ((branding as any).termsUrl || ''),
  [supportEmail, supportUrl, privacyUrl, termsUrl, settings]);

  const doSave = useCallback(async () => {
    if (!isDirty) return;
    await onUpdate({ adminWorkspace: { branding: { supportEmail: supportEmail || null, supportUrl: supportUrl || null, privacyUrl: privacyUrl || null, termsUrl: termsUrl || null } } });
  }, [isDirty, supportEmail, supportUrl, privacyUrl, termsUrl, onUpdate]);

  const { status, save, discard, isSaving } = useManualSave({ onSave: doSave, onDiscard: sync });
  const isLocked = (p: string) => !!locks[`adminWorkspace.${p}`]?.locked;

  const fieldRow = (label: string, value: string, setter: (v: string) => void, path: string, placeholder: string) => (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} onChange={e => setter(e.target.value)} disabled={!canEdit || isLocked(path) || isSaving} className="h-9 text-sm" placeholder={placeholder} />
    </div>
  );

  return (
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
      <CardSaveFooter status={status} isDirty={isDirty} onSave={save} onDiscard={discard} disabled={!canEdit} />
    </div>
  );
}

// ─── Email Branding Card ───
function EmailBrandingCard({ settings, locks, canEdit, onUpdate }: Props) {
  const branding = settings.branding || {};
  const [emailBrandingEnabled, setEmailBrandingEnabled] = useState(branding.emailBrandingEnabled ?? false);

  const sync = useCallback(() => { setEmailBrandingEnabled(branding.emailBrandingEnabled ?? false); }, [settings]);
  useEffect(() => { sync(); }, [sync]);

  const isDirty = useMemo(() => emailBrandingEnabled !== (branding.emailBrandingEnabled ?? false), [emailBrandingEnabled, settings]);

  const doSave = useCallback(async () => {
    if (!isDirty) return;
    await onUpdate({ adminWorkspace: { branding: { emailBrandingEnabled } } });
  }, [isDirty, emailBrandingEnabled, onUpdate]);

  const { status, save, discard, isSaving } = useManualSave({ onSave: doSave, onDiscard: sync });

  return (
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
          <p className="text-xs text-muted-foreground">Använd organisationens logotyp och färger i inbjudningsmail.</p>
        </div>
        <Switch checked={emailBrandingEnabled} onCheckedChange={setEmailBrandingEnabled} disabled={!canEdit || isSaving} />
      </div>
      <CardSaveFooter status={status} isDirty={isDirty} onSave={save} onDiscard={discard} disabled={!canEdit} />
    </div>
  );
}

// ─── Policies Card ───
function PoliciesCard({ settings, locks, canEdit, onUpdate }: Props) {
  const invitePolicy = settings.invitePolicy || {};
  const [domainRestrictedInvites, setDomainRestrictedInvites] = useState(invitePolicy.domainRestrictedInvites ?? false);
  const [allowExternalGuests, setAllowExternalGuests] = useState(invitePolicy.allowExternalGuests ?? false);
  const [requireApprovalForExternalGuests, setRequireApprovalForExternalGuests] = useState(invitePolicy.requireApprovalForExternalGuests ?? false);
  const [teamManagementEnabled, setTeamManagementEnabled] = useState(settings.teamManagementEnabled ?? true);

  const sync = useCallback(() => {
    setDomainRestrictedInvites(invitePolicy.domainRestrictedInvites ?? false);
    setAllowExternalGuests(invitePolicy.allowExternalGuests ?? false);
    setRequireApprovalForExternalGuests(invitePolicy.requireApprovalForExternalGuests ?? false);
    setTeamManagementEnabled(settings.teamManagementEnabled ?? true);
  }, [settings]);

  useEffect(() => { sync(); }, [sync]);

  const isDirty = useMemo(() =>
    domainRestrictedInvites !== (invitePolicy.domainRestrictedInvites ?? false) ||
    allowExternalGuests !== (invitePolicy.allowExternalGuests ?? false) ||
    requireApprovalForExternalGuests !== (invitePolicy.requireApprovalForExternalGuests ?? false) ||
    teamManagementEnabled !== (settings.teamManagementEnabled ?? true),
  [domainRestrictedInvites, allowExternalGuests, requireApprovalForExternalGuests, teamManagementEnabled, settings]);

  const doSave = useCallback(async () => {
    if (!isDirty) return;
    await onUpdate({ adminWorkspace: { invitePolicy: { domainRestrictedInvites, allowExternalGuests, requireApprovalForExternalGuests }, teamManagementEnabled } });
  }, [isDirty, domainRestrictedInvites, allowExternalGuests, requireApprovalForExternalGuests, teamManagementEnabled, onUpdate]);

  const { status, save, discard, isSaving } = useManualSave({ onSave: doSave, onDiscard: sync });

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10"><Users className="w-5 h-5 text-primary" /></div>
        <div>
          <h3 className="font-medium text-sm">Policyer</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Styr vem som kan bjuda in, skapa möten och använda integrationer</p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div><p className="text-sm">Domänbegränsade inbjudningar</p><p className="text-xs text-muted-foreground">Kräv att inbjudna tillhör godkänd domän</p></div>
        <Switch checked={domainRestrictedInvites} onCheckedChange={setDomainRestrictedInvites} disabled={!canEdit || isSaving} />
      </div>
      <div className="flex items-center justify-between">
        <div><p className="text-sm">Tillåt externa gäster</p><p className="text-xs text-muted-foreground">Låt användare utanför organisationen bjudas in</p></div>
        <Switch checked={allowExternalGuests} onCheckedChange={setAllowExternalGuests} disabled={!canEdit || isSaving} />
      </div>
      {allowExternalGuests && (
        <div className="flex items-center justify-between ml-6">
          <div><p className="text-sm">Kräv godkännande för externa gäster</p><p className="text-xs text-muted-foreground">Ägare/admin måste godkänna</p></div>
          <Switch checked={requireApprovalForExternalGuests} onCheckedChange={setRequireApprovalForExternalGuests} disabled={!canEdit || isSaving} />
        </div>
      )}
      <div className="flex items-center justify-between">
        <div><p className="text-sm">Teamhantering</p><p className="text-xs text-muted-foreground">Aktivera interna arbetsgrupper</p></div>
        <Switch checked={teamManagementEnabled} onCheckedChange={setTeamManagementEnabled} disabled={!canEdit || isSaving} />
      </div>
      <CardSaveFooter status={status} isDirty={isDirty} onSave={save} onDiscard={discard} disabled={!canEdit} />
    </div>
  );
}

// ─── Main Export ───
export function EnterpriseSettingsWorkspace({ settings, locks, canEdit, onUpdate }: Props) {
  const { refreshBranding } = useEnterpriseBranding();

  return (
    <div className="space-y-6">
      <BrandingCard settings={settings} locks={locks} canEdit={canEdit} onUpdate={onUpdate} refreshBranding={refreshBranding} />
      <LoginCard settings={settings} locks={locks} canEdit={canEdit} onUpdate={onUpdate} />
      <SupportCard settings={settings} locks={locks} canEdit={canEdit} onUpdate={onUpdate} />
      <EmailBrandingCard settings={settings} locks={locks} canEdit={canEdit} onUpdate={onUpdate} />
      <PoliciesCard settings={settings} locks={locks} canEdit={canEdit} onUpdate={onUpdate} />
    </div>
  );
}
