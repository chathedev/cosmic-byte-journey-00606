import { useState } from 'react';
import { Building2, Palette, Users, Lock } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AdminWorkspaceSettings, SettingsLock } from '@/lib/enterpriseSettingsApi';

interface Props {
  settings: Partial<AdminWorkspaceSettings>;
  locks: Record<string, SettingsLock>;
  canEdit: boolean;
  onUpdate: (patch: Record<string, any>) => Promise<void>;
}

export function EnterpriseSettingsWorkspace({ settings, locks, canEdit, onUpdate }: Props) {
  const [saving, setSaving] = useState(false);

  const isLocked = (path: string) => !!locks[`adminWorkspace.${path}`]?.locked;

  const updateField = async (path: string, value: any) => {
    if (!canEdit) return;
    setSaving(true);
    try {
      // Build nested patch
      const parts = path.split('.');
      let patch: any = {};
      let ref = patch;
      for (let i = 0; i < parts.length - 1; i++) {
        ref[parts[i]] = {};
        ref = ref[parts[i]];
      }
      ref[parts[parts.length - 1]] = value;
      await onUpdate({ adminWorkspace: patch });
    } finally { setSaving(false); }
  };

  const branding = settings.branding || {};
  const invitePolicy = settings.invitePolicy || {};

  return (
    <div className="space-y-6">
      {/* Branding */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Palette className="w-5 h-5 text-primary" /></div>
          <div>
            <h3 className="font-medium text-sm">Varumärke & Identitet</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Anpassa arbetsytans utseende</p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Arbetsytans namn</Label>
            <Input
              value={branding.workspaceDisplayName || ''}
              onBlur={e => updateField('branding.workspaceDisplayName', e.target.value)}
              onChange={() => {}}
              disabled={!canEdit || isLocked('branding.workspaceDisplayName') || saving}
              className="h-9 text-sm"
              placeholder="Företagsnamn AB"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Logotyp-URL</Label>
            <Input
              value={branding.logoUrl || ''}
              onBlur={e => updateField('branding.logoUrl', e.target.value || null)}
              onChange={() => {}}
              disabled={!canEdit || saving}
              className="h-9 text-sm"
              placeholder="https://example.se/logo.png"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">E-postvarumärke</p>
              <p className="text-xs text-muted-foreground">Använd organisationens branding i e-postmallar</p>
            </div>
            <Switch
              checked={branding.emailBrandingEnabled ?? false}
              onCheckedChange={v => updateField('branding.emailBrandingEnabled', v)}
              disabled={!canEdit || saving}
            />
          </div>
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
