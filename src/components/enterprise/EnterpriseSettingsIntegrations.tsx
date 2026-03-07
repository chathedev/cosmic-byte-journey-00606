import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link2, Code } from 'lucide-react';
import { EnterpriseSaveBar } from './EnterpriseSaveBar';
import { useAutoSave } from '@/hooks/useAutoSave';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { IntegrationSettings, SettingsLock } from '@/lib/enterpriseSettingsApi';

interface Props {
  settings: Partial<IntegrationSettings>;
  locks: Record<string, SettingsLock>;
  canEdit: boolean;
  onUpdate: (patch: Record<string, any>) => Promise<void>;
}

const INTEGRATIONS = [
  { key: 'microsoftTeams', label: 'Microsoft Teams' },
  { key: 'googleMeet', label: 'Google Meet' },
  { key: 'zoom', label: 'Zoom' },
  { key: 'slack', label: 'Slack' },
];

export function EnterpriseSettingsIntegrations({ settings, locks, canEdit, onUpdate }: Props) {
  

  // Local state
  const [integrationStates, setIntegrationStates] = useState<Record<string, boolean>>({});
  const [apiAccessEnabled, setApiAccessEnabled] = useState(settings.apiAccessEnabled ?? false);
  const [webhooksEnabled, setWebhooksEnabled] = useState(settings.webhooksEnabled ?? false);
  const [customIntegrationsEnabled, setCustomIntegrationsEnabled] = useState(settings.customIntegrationsEnabled ?? false);

  useEffect(() => {
    const states: Record<string, boolean> = {};
    INTEGRATIONS.forEach(({ key }) => {
      states[key] = (settings as any)?.[key]?.enabled ?? false;
    });
    setIntegrationStates(states);
    setApiAccessEnabled(settings.apiAccessEnabled ?? false);
    setWebhooksEnabled(settings.webhooksEnabled ?? false);
    setCustomIntegrationsEnabled(settings.customIntegrationsEnabled ?? false);
  }, [settings]);

  const isDirty = useMemo(() => {
    const integrationsChanged = INTEGRATIONS.some(({ key }) => {
      return integrationStates[key] !== ((settings as any)?.[key]?.enabled ?? false);
    });
    return (
      integrationsChanged ||
      apiAccessEnabled !== (settings.apiAccessEnabled ?? false) ||
      webhooksEnabled !== (settings.webhooksEnabled ?? false) ||
      customIntegrationsEnabled !== (settings.customIntegrationsEnabled ?? false)
    );
  }, [integrationStates, apiAccessEnabled, webhooksEnabled, customIntegrationsEnabled, settings]);

  const handleSave = async () => {
    if (!canEdit || !isDirty) return;
    setSaving(true);
    try {
      const patch: Record<string, any> = { apiAccessEnabled, webhooksEnabled, customIntegrationsEnabled };
      INTEGRATIONS.forEach(({ key }) => {
        patch[key] = { enabled: integrationStates[key] };
      });
      await onUpdate({ integrations: patch });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <EnterpriseSaveBar isDirty={isDirty} saving={saving} canEdit={canEdit} onSave={handleSave} />
      {/* Service Integrations */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Link2 className="w-5 h-5 text-primary" /></div>
          <div>
            <h3 className="font-medium text-sm">Tjänstintegrationer</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Aktivera och styr vilka integrationer som är tillgängliga</p>
          </div>
        </div>

        {INTEGRATIONS.map(({ key, label }) => {
          const integration = (settings as any)?.[key] || {};
          return (
            <div key={key} className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-muted flex items-center justify-center">
                  <Link2 className="w-3 h-3 text-muted-foreground" />
                </div>
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
                checked={integrationStates[key] ?? false}
                onCheckedChange={v => setIntegrationStates(prev => ({ ...prev, [key]: v }))}
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
            checked={apiAccessEnabled}
            onCheckedChange={setApiAccessEnabled}
            disabled={!canEdit || saving}
          />
        </div>
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm">Webhooks</p>
            <p className="text-xs text-muted-foreground">Aktivera webhooks för realtidsnotifieringar</p>
          </div>
          <Switch
            checked={webhooksEnabled}
            onCheckedChange={setWebhooksEnabled}
            disabled={!canEdit || saving}
          />
        </div>
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm">Anpassade integrationer</p>
            <p className="text-xs text-muted-foreground">Tillåt tredjepartsintegrationer</p>
          </div>
          <Switch
            checked={customIntegrationsEnabled}
            onCheckedChange={setCustomIntegrationsEnabled}
            disabled={!canEdit || saving}
          />
        </div>
      </div>

    </div>
  );
}
