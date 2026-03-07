import { useState } from 'react';
import { Link2, Webhook, Code } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import type { IntegrationSettings, SettingsLock } from '@/lib/enterpriseSettingsApi';

interface Props {
  settings: Partial<IntegrationSettings>;
  locks: Record<string, SettingsLock>;
  canEdit: boolean;
  onUpdate: (patch: Record<string, any>) => Promise<void>;
}

const INTEGRATIONS = [
  { key: 'microsoftTeams', label: 'Microsoft Teams', icon: '🏢' },
  { key: 'googleMeet', label: 'Google Meet', icon: '📹' },
  { key: 'zoom', label: 'Zoom', icon: '🔵' },
  { key: 'slack', label: 'Slack', icon: '💬' },
];

export function EnterpriseSettingsIntegrations({ settings, locks, canEdit, onUpdate }: Props) {
  const [saving, setSaving] = useState(false);

  return (
    <div className="space-y-6">
      {/* Service Integrations */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Link2 className="w-5 h-5 text-primary" /></div>
          <div>
            <h3 className="font-medium text-sm">Tjänstintegrationer</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Aktivera och styr vilka integrationer som är tillgängliga</p>
          </div>
        </div>

        {INTEGRATIONS.map(({ key, label, icon }) => {
          const integration = (settings as any)?.[key] || {};
          return (
            <div key={key} className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                <span className="text-lg">{icon}</span>
                <div>
                  <p className="text-sm">{label}</p>
                  {integration.allowedRoles?.length > 0 && (
                    <div className="flex gap-1 mt-0.5">
                      {integration.allowedRoles.map((r: string) => (
                        <Badge key={r} variant="outline" className="text-[10px]">{r}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <Switch
                checked={integration.enabled ?? false}
                onCheckedChange={async v => {
                  if (!canEdit) return;
                  setSaving(true);
                  try { await onUpdate({ integrations: { [key]: { enabled: v } } }); }
                  finally { setSaving(false); }
                }}
                disabled={!canEdit || saving}
              />
            </div>
          );
        })}
      </div>

      {/* API & Webhooks */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Code className="w-4 h-4 text-primary" />
          API & Webhooks
        </h4>
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm">API-åtkomst</p>
            <p className="text-xs text-muted-foreground">Tillåt programmatisk åtkomst via API</p>
          </div>
          <Switch
            checked={settings.apiAccessEnabled ?? false}
            onCheckedChange={async v => {
              if (!canEdit) return;
              setSaving(true);
              try { await onUpdate({ integrations: { apiAccessEnabled: v } }); }
              finally { setSaving(false); }
            }}
            disabled={!canEdit || saving}
          />
        </div>
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm">Webhooks</p>
            <p className="text-xs text-muted-foreground">Aktivera webhooks för realtidsnotifieringar</p>
          </div>
          <Switch
            checked={settings.webhooksEnabled ?? false}
            onCheckedChange={async v => {
              if (!canEdit) return;
              setSaving(true);
              try { await onUpdate({ integrations: { webhooksEnabled: v } }); }
              finally { setSaving(false); }
            }}
            disabled={!canEdit || saving}
          />
        </div>
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm">Anpassade integrationer</p>
            <p className="text-xs text-muted-foreground">Tillåt tredjepartsintegrationer</p>
          </div>
          <Switch
            checked={settings.customIntegrationsEnabled ?? false}
            onCheckedChange={async v => {
              if (!canEdit) return;
              setSaving(true);
              try { await onUpdate({ integrations: { customIntegrationsEnabled: v } }); }
              finally { setSaving(false); }
            }}
            disabled={!canEdit || saving}
          />
        </div>
      </div>
    </div>
  );
}
