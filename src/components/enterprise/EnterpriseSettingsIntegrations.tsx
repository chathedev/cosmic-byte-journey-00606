import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link2, Code } from 'lucide-react';
import { CardSaveFooter } from './CardSaveFooter';
import { useManualSave } from '@/hooks/useManualSave';
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
  { key: 'microsoftTeams', label: 'Microsoft Teams' },
  { key: 'googleMeet', label: 'Google Meet' },
  { key: 'zoom', label: 'Zoom' },
  { key: 'slack', label: 'Slack' },
];

// ─── Service Integrations Card ───
function ServiceIntegrationsCard({ settings, locks, canEdit, onUpdate }: Props) {
  const [integrationStates, setIntegrationStates] = useState<Record<string, boolean>>({});

  const sync = useCallback(() => {
    const states: Record<string, boolean> = {};
    INTEGRATIONS.forEach(({ key }) => { states[key] = (settings as any)?.[key]?.enabled ?? false; });
    setIntegrationStates(states);
  }, [settings]);

  useEffect(() => { sync(); }, [sync]);

  const isDirty = useMemo(() =>
    INTEGRATIONS.some(({ key }) => integrationStates[key] !== ((settings as any)?.[key]?.enabled ?? false)),
  [integrationStates, settings]);

  const doSave = useCallback(async () => {
    if (!isDirty) return;
    const patch: Record<string, any> = {};
    INTEGRATIONS.forEach(({ key }) => { patch[key] = { enabled: integrationStates[key] }; });
    await onUpdate({ integrations: patch });
  }, [isDirty, integrationStates, onUpdate]);

  const { status, save, discard, isSaving } = useManualSave({ onSave: doSave, onDiscard: sync });

  return (
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
              <div className="w-5 h-5 rounded bg-muted flex items-center justify-center"><Link2 className="w-3 h-3 text-muted-foreground" /></div>
              <div>
                <p className="text-sm">{label}</p>
                {integration.allowedRoles?.length > 0 && (
                  <div className="flex gap-1 mt-0.5">{integration.allowedRoles.map((r: string) => <Badge key={r} variant="outline" className="text-[10px]">{r}</Badge>)}</div>
                )}
              </div>
            </div>
            <Switch checked={integrationStates[key] ?? false} onCheckedChange={v => setIntegrationStates(prev => ({ ...prev, [key]: v }))} disabled={!canEdit || isSaving} />
          </div>
        );
      })}
      <CardSaveFooter status={status} isDirty={isDirty} onSave={save} onDiscard={discard} disabled={!canEdit} />
    </div>
  );
}

// ─── API & Webhooks Card ───
function ApiWebhooksCard({ settings, locks, canEdit, onUpdate }: Props) {
  const [apiAccessEnabled, setApiAccessEnabled] = useState(settings.apiAccessEnabled ?? false);
  const [webhooksEnabled, setWebhooksEnabled] = useState(settings.webhooksEnabled ?? false);
  const [customIntegrationsEnabled, setCustomIntegrationsEnabled] = useState(settings.customIntegrationsEnabled ?? false);

  const sync = useCallback(() => {
    setApiAccessEnabled(settings.apiAccessEnabled ?? false);
    setWebhooksEnabled(settings.webhooksEnabled ?? false);
    setCustomIntegrationsEnabled(settings.customIntegrationsEnabled ?? false);
  }, [settings]);

  useEffect(() => { sync(); }, [sync]);

  const isDirty = useMemo(() =>
    apiAccessEnabled !== (settings.apiAccessEnabled ?? false) ||
    webhooksEnabled !== (settings.webhooksEnabled ?? false) ||
    customIntegrationsEnabled !== (settings.customIntegrationsEnabled ?? false),
  [apiAccessEnabled, webhooksEnabled, customIntegrationsEnabled, settings]);

  const doSave = useCallback(async () => {
    if (!isDirty) return;
    await onUpdate({ integrations: { apiAccessEnabled, webhooksEnabled, customIntegrationsEnabled } });
  }, [isDirty, apiAccessEnabled, webhooksEnabled, customIntegrationsEnabled, onUpdate]);

  const { status, save, discard, isSaving } = useManualSave({ onSave: doSave, onDiscard: sync });

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h4 className="text-sm font-medium flex items-center gap-2"><Code className="w-4 h-4 text-primary" />API & Webhooks</h4>
      <div className="flex items-center justify-between py-1">
        <div><p className="text-sm">API-åtkomst</p><p className="text-xs text-muted-foreground">Tillåt programmatisk åtkomst via API</p></div>
        <Switch checked={apiAccessEnabled} onCheckedChange={setApiAccessEnabled} disabled={!canEdit || isSaving} />
      </div>
      <div className="flex items-center justify-between py-1">
        <div><p className="text-sm">Webhooks</p><p className="text-xs text-muted-foreground">Aktivera webhooks för realtidsnotifieringar</p></div>
        <Switch checked={webhooksEnabled} onCheckedChange={setWebhooksEnabled} disabled={!canEdit || isSaving} />
      </div>
      <div className="flex items-center justify-between py-1">
        <div><p className="text-sm">Anpassade integrationer</p><p className="text-xs text-muted-foreground">Tillåt tredjepartsintegrationer</p></div>
        <Switch checked={customIntegrationsEnabled} onCheckedChange={setCustomIntegrationsEnabled} disabled={!canEdit || isSaving} />
      </div>
      <CardSaveFooter status={status} isDirty={isDirty} onSave={save} onDiscard={discard} disabled={!canEdit} />
    </div>
  );
}

export function EnterpriseSettingsIntegrations({ settings, locks, canEdit, onUpdate }: Props) {
  return (
    <div className="space-y-6">
      <ServiceIntegrationsCard settings={settings} locks={locks} canEdit={canEdit} onUpdate={onUpdate} />
      <ApiWebhooksCard settings={settings} locks={locks} canEdit={canEdit} onUpdate={onUpdate} />
    </div>
  );
}
