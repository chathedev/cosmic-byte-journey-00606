import { useState, useEffect, useMemo, useCallback } from 'react';
import { Shield, Database, Globe, AlertTriangle, Lock } from 'lucide-react';
import { CardSaveFooter } from './CardSaveFooter';
import { useManualSave } from '@/hooks/useManualSave';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SecurityComplianceSettings, SettingsLock, CustomizationBoundaries } from '@/lib/enterpriseSettingsApi';

interface Props {
  settings: Partial<SecurityComplianceSettings>;
  locks: Record<string, SettingsLock>;
  canEdit: boolean;
  onUpdate: (patch: Record<string, any>) => Promise<void>;
}

// ─── Security Toggles Card ───
function SecurityTogglesCard({ settings, locks, canEdit, onUpdate }: Props) {
  const isLocked = (path: string) => !!locks[`securityCompliance.${path}`]?.locked;

  const [auditLogsEnabled, setAuditLogsEnabled] = useState(settings.auditLogsEnabled ?? false);
  const [loginHistoryEnabled, setLoginHistoryEnabled] = useState(settings.loginHistoryEnabled ?? false);
  const [autoDeleteEnabled, setAutoDeleteEnabled] = useState(settings.autoDeleteEnabled ?? false);
  const [restrictExport, setRestrictExport] = useState(settings.restrictExport ?? false);
  const [restrictDownload, setRestrictDownload] = useState(settings.restrictDownload ?? false);
  const [restrictExternalSharing, setRestrictExternalSharing] = useState(settings.restrictExternalSharing ?? false);

  const sync = useCallback(() => {
    setAuditLogsEnabled(settings.auditLogsEnabled ?? false);
    setLoginHistoryEnabled(settings.loginHistoryEnabled ?? false);
    setAutoDeleteEnabled(settings.autoDeleteEnabled ?? false);
    setRestrictExport(settings.restrictExport ?? false);
    setRestrictDownload(settings.restrictDownload ?? false);
    setRestrictExternalSharing(settings.restrictExternalSharing ?? false);
  }, [settings]);

  useEffect(() => { sync(); }, [sync]);

  const isDirty = useMemo(() =>
    auditLogsEnabled !== (settings.auditLogsEnabled ?? false) ||
    loginHistoryEnabled !== (settings.loginHistoryEnabled ?? false) ||
    autoDeleteEnabled !== (settings.autoDeleteEnabled ?? false) ||
    restrictExport !== (settings.restrictExport ?? false) ||
    restrictDownload !== (settings.restrictDownload ?? false) ||
    restrictExternalSharing !== (settings.restrictExternalSharing ?? false),
  [auditLogsEnabled, loginHistoryEnabled, autoDeleteEnabled, restrictExport, restrictDownload, restrictExternalSharing, settings]);

  const doSave = useCallback(async () => {
    if (!isDirty) return;
    await onUpdate({
      securityCompliance: {
        auditLogsEnabled, loginHistoryEnabled, autoDeleteEnabled,
        restrictExport, restrictDownload, restrictExternalSharing,
      },
    });
  }, [isDirty, auditLogsEnabled, loginHistoryEnabled, autoDeleteEnabled, restrictExport, restrictDownload, restrictExternalSharing, onUpdate]);

  const { status, save, discard, isSaving } = useManualSave({ onSave: doSave, onDiscard: sync });

  const toggleItems = [
    { field: 'auditLogsEnabled', label: 'Granskningsloggar', desc: 'Spåra alla ändringar i inställningar', value: auditLogsEnabled, setter: setAuditLogsEnabled },
    { field: 'loginHistoryEnabled', label: 'Inloggningshistorik', desc: 'Logga alla SSO-inloggningar', value: loginHistoryEnabled, setter: setLoginHistoryEnabled },
    { field: 'autoDeleteEnabled', label: 'Automatisk radering', desc: 'Radera möten efter retentionstiden', value: autoDeleteEnabled, setter: setAutoDeleteEnabled },
    { field: 'restrictExport', label: 'Begränsa export', desc: 'Blockera export av protokoll och transkript', value: restrictExport, setter: setRestrictExport },
    { field: 'restrictDownload', label: 'Begränsa nedladdning', desc: 'Blockera filnedladdningar', value: restrictDownload, setter: setRestrictDownload },
    { field: 'restrictExternalSharing', label: 'Begränsa extern delning', desc: 'Blockera delning utanför organisationen', value: restrictExternalSharing, setter: setRestrictExternalSharing },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10"><Shield className="w-5 h-5 text-primary" /></div>
        <div>
          <h3 className="font-medium text-sm">Säkerhet & Efterlevnad</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Kontrollera datalagring, export och tillgång</p>
        </div>
      </div>
      {toggleItems.map(({ field, label, desc, value, setter }) => (
        <div key={field} className="flex items-center justify-between py-1">
          <div><p className="text-sm">{label}</p><p className="text-xs text-muted-foreground">{desc}</p></div>
          <Switch checked={value} onCheckedChange={setter} disabled={!canEdit || isLocked(field) || isSaving} />
        </div>
      ))}
      <CardSaveFooter status={status} isDirty={isDirty} onSave={save} onDiscard={discard} disabled={!canEdit} />
    </div>
  );
}

// ─── Data Storage Card ───
function DataStorageCard({ settings, locks, canEdit, onUpdate }: Props) {
  const isLocked = (path: string) => !!locks[`securityCompliance.${path}`]?.locked;

  const [retentionDays, setRetentionDays] = useState(settings.retentionDays ?? 365);
  const [euDataResidencyRequired, setEuDataResidencyRequired] = useState(settings.euDataResidencyRequired ?? false);

  const sync = useCallback(() => {
    setRetentionDays(settings.retentionDays ?? 365);
    setEuDataResidencyRequired(settings.euDataResidencyRequired ?? false);
  }, [settings]);

  useEffect(() => { sync(); }, [sync]);

  const isDirty = useMemo(() =>
    retentionDays !== (settings.retentionDays ?? 365) ||
    euDataResidencyRequired !== (settings.euDataResidencyRequired ?? false),
  [retentionDays, euDataResidencyRequired, settings]);

  const doSave = useCallback(async () => {
    if (!isDirty) return;
    await onUpdate({ securityCompliance: { retentionDays, storageRegion: 'eu', euDataResidencyRequired } });
  }, [isDirty, retentionDays, euDataResidencyRequired, onUpdate]);

  const { status, save, discard, isSaving } = useManualSave({ onSave: doSave, onDiscard: sync });

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <h4 className="text-sm font-medium flex items-center gap-2"><Database className="w-4 h-4 text-primary" />Datalagring</h4>
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Retentionstid (dagar)</Label>
        <Input type="number" min={30} max={3650} value={retentionDays} onChange={e => { const val = parseInt(e.target.value); if (!isNaN(val)) setRetentionDays(val); }} disabled={!canEdit || isLocked('retentionDays') || isSaving} className="h-9 text-sm w-32" />
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Lagringsregion</Label>
        <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-muted/50 w-40 text-sm">
          <span>🇪🇺</span>
          <span className="font-medium">EU</span>
          <Badge variant="secondary" className="text-[10px] ml-auto">Fast</Badge>
        </div>
        <p className="text-[11px] text-muted-foreground">All data lagras inom EU. Kontakta support för frågor.</p>
      </div>
      <div className="flex items-center justify-between py-1">
        <div><p className="text-sm">EU-datalagringsgaranti</p><p className="text-xs text-muted-foreground">Kräv att all data lagras inom EU</p></div>
        <Switch checked={euDataResidencyRequired} onCheckedChange={setEuDataResidencyRequired} disabled={!canEdit || isLocked('euDataResidencyRequired') || isSaving} />
      </div>
      <CardSaveFooter status={status} isDirty={isDirty} onSave={save} onDiscard={discard} disabled={!canEdit} />
    </div>
  );
}

// ─── IP Allowlist Card ───
function IpAllowlistCard({ settings, locks, canEdit, onUpdate }: Props) {
  const isLocked = (path: string) => !!locks[`securityCompliance.${path}`]?.locked;
  const [ipInput, setIpInput] = useState('');
  const [ipAllowlistingEnabled, setIpAllowlistingEnabled] = useState(settings.ipAllowlistingEnabled ?? false);
  const [ipAllowlist, setIpAllowlist] = useState<string[]>(settings.ipAllowlist || []);

  const sync = useCallback(() => {
    setIpAllowlistingEnabled(settings.ipAllowlistingEnabled ?? false);
    setIpAllowlist(settings.ipAllowlist || []);
    setIpInput('');
  }, [settings]);

  useEffect(() => { sync(); }, [sync]);

  const isDirty = useMemo(() =>
    ipAllowlistingEnabled !== (settings.ipAllowlistingEnabled ?? false) ||
    JSON.stringify(ipAllowlist) !== JSON.stringify(settings.ipAllowlist || []),
  [ipAllowlistingEnabled, ipAllowlist, settings]);

  const doSave = useCallback(async () => {
    if (!isDirty) return;
    await onUpdate({ securityCompliance: { ipAllowlistingEnabled, ipAllowlist } });
  }, [isDirty, ipAllowlistingEnabled, ipAllowlist, onUpdate]);

  const { status, save, discard, isSaving } = useManualSave({ onSave: doSave, onDiscard: sync });

  const addIp = () => { const ip = ipInput.trim(); if (!ip || ipAllowlist.includes(ip)) return; setIpAllowlist([...ipAllowlist, ip]); setIpInput(''); };
  const removeIp = (ip: string) => { setIpAllowlist(ipAllowlist.filter(i => i !== ip)); };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2"><Globe className="w-4 h-4 text-primary" />IP-vitlista</h4>
        <Switch checked={ipAllowlistingEnabled} onCheckedChange={setIpAllowlistingEnabled} disabled={!canEdit || isLocked('ipAllowlistingEnabled') || isSaving} />
      </div>
      {ipAllowlistingEnabled && (
        <>
          <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300">Var försiktig – felaktig IP-vitlistning kan låsa ute administratörer.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {ipAllowlist.map(ip => (
              <Badge key={ip} variant="secondary" className="text-xs font-mono gap-1">
                {ip}
                {canEdit && !isLocked('ipAllowlist') && <button onClick={() => removeIp(ip)} className="ml-1 hover:text-destructive">×</button>}
              </Badge>
            ))}
          </div>
          {canEdit && !isLocked('ipAllowlist') && (
            <div className="flex gap-2">
              <Input value={ipInput} onChange={e => setIpInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addIp()} placeholder="203.0.113.0/24" className="h-8 text-sm flex-1 font-mono" />
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={addIp} disabled={!ipInput.trim()}>Lägg till</Button>
            </div>
          )}
        </>
      )}
      <CardSaveFooter status={status} isDirty={isDirty} onSave={save} onDiscard={discard} disabled={!canEdit} />
    </div>
  );
}

export function EnterpriseSettingsSecurity({ settings, locks, canEdit, onUpdate }: Props) {
  return (
    <div className="space-y-6">
      <SecurityTogglesCard settings={settings} locks={locks} canEdit={canEdit} onUpdate={onUpdate} />
      <DataStorageCard settings={settings} locks={locks} canEdit={canEdit} onUpdate={onUpdate} />
      <IpAllowlistCard settings={settings} locks={locks} canEdit={canEdit} onUpdate={onUpdate} />
    </div>
  );
}
