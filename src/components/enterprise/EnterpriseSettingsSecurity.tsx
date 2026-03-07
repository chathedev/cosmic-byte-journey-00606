import { useState } from 'react';
import { Shield, Database, Globe, Lock, AlertTriangle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SecurityComplianceSettings, SettingsLock } from '@/lib/enterpriseSettingsApi';

interface Props {
  settings: Partial<SecurityComplianceSettings>;
  locks: Record<string, SettingsLock>;
  canEdit: boolean;
  onUpdate: (patch: Record<string, any>) => Promise<void>;
}

export function EnterpriseSettingsSecurity({ settings, locks, canEdit, onUpdate }: Props) {
  const [saving, setSaving] = useState(false);
  const [ipInput, setIpInput] = useState('');

  const isLocked = (path: string) => !!locks[`securityCompliance.${path}`]?.locked;

  const handleToggle = async (field: string, value: boolean) => {
    if (!canEdit || isLocked(field)) return;
    setSaving(true);
    try { await onUpdate({ securityCompliance: { [field]: value } }); }
    finally { setSaving(false); }
  };

  const addIp = async () => {
    const ip = ipInput.trim();
    if (!ip || isLocked('ipAllowlist')) return;
    const current = settings.ipAllowlist || [];
    if (current.includes(ip)) return;
    setSaving(true);
    try {
      await onUpdate({ securityCompliance: { ipAllowlist: [...current, ip] } });
      setIpInput('');
    } finally { setSaving(false); }
  };

  const removeIp = async (ip: string) => {
    if (isLocked('ipAllowlist')) return;
    setSaving(true);
    try {
      await onUpdate({ securityCompliance: { ipAllowlist: (settings.ipAllowlist || []).filter(i => i !== ip) } });
    } finally { setSaving(false); }
  };

  const toggleItems: Array<{ field: string; label: string; desc: string }> = [
    { field: 'auditLogsEnabled', label: 'Granskningsloggar', desc: 'Spåra alla ändringar i inställningar' },
    { field: 'loginHistoryEnabled', label: 'Inloggningshistorik', desc: 'Logga alla SSO-inloggningar' },
    { field: 'autoDeleteEnabled', label: 'Automatisk radering', desc: 'Radera möten efter retentionstiden' },
    { field: 'restrictExport', label: 'Begränsa export', desc: 'Blockera export av protokoll och transkript' },
    { field: 'restrictDownload', label: 'Begränsa nedladdning', desc: 'Blockera filnedladdningar' },
    { field: 'restrictExternalSharing', label: 'Begränsa extern delning', desc: 'Blockera delning utanför organisationen' },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10"><Shield className="w-5 h-5 text-primary" /></div>
          <div>
            <h3 className="font-medium text-sm">Säkerhet & Efterlevnad</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Kontrollera datalagring, export och tillgång</p>
          </div>
        </div>

        {toggleItems.map(({ field, label, desc }) => (
          <div key={field} className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm">{label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
            <Switch
              checked={(settings as any)[field] ?? false}
              onCheckedChange={v => handleToggle(field, v)}
              disabled={!canEdit || isLocked(field) || saving}
            />
          </div>
        ))}
      </div>

      {/* Retention */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Database className="w-4 h-4 text-primary" />
          Datalagring
        </h4>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Retentionstid (dagar)</Label>
          <Input
            type="number"
            min={30}
            max={3650}
            value={settings.retentionDays ?? 365}
            onChange={async e => {
              const val = parseInt(e.target.value);
              if (val >= 30 && val <= 3650 && canEdit) {
                setSaving(true);
                try { await onUpdate({ securityCompliance: { retentionDays: val } }); }
                finally { setSaving(false); }
              }
            }}
            disabled={!canEdit || isLocked('retentionDays') || saving}
            className="h-9 text-sm w-32"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Lagringsregion</Label>
          <Select
            value={settings.storageRegion || 'eu'}
            onValueChange={async v => {
              if (!canEdit || isLocked('storageRegion')) return;
              setSaving(true);
              try { await onUpdate({ securityCompliance: { storageRegion: v } }); }
              finally { setSaving(false); }
            }}
            disabled={!canEdit || isLocked('storageRegion') || saving}
          >
            <SelectTrigger className="h-9 text-sm w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="eu">🇪🇺 EU</SelectItem>
              <SelectItem value="us">🇺🇸 US</SelectItem>
              <SelectItem value="auto">🌍 Auto</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* IP Allowlist */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            IP-vitlista
          </h4>
          <Switch
            checked={settings.ipAllowlistingEnabled ?? false}
            onCheckedChange={v => handleToggle('ipAllowlistingEnabled', v)}
            disabled={!canEdit || isLocked('ipAllowlistingEnabled') || saving}
          />
        </div>

        {settings.ipAllowlistingEnabled && (
          <>
            <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Var försiktig – felaktig IP-vitlistning kan låsa ute administratörer.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(settings.ipAllowlist || []).map(ip => (
                <Badge key={ip} variant="secondary" className="text-xs font-mono gap-1">
                  {ip}
                  {canEdit && !isLocked('ipAllowlist') && (
                    <button onClick={() => removeIp(ip)} className="ml-1 hover:text-destructive">×</button>
                  )}
                </Badge>
              ))}
            </div>
            {canEdit && !isLocked('ipAllowlist') && (
              <div className="flex gap-2">
                <Input
                  value={ipInput}
                  onChange={e => setIpInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addIp()}
                  placeholder="203.0.113.0/24"
                  className="h-8 text-sm flex-1 font-mono"
                />
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={addIp} disabled={saving}>
                  Lägg till
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
