import { useState, useEffect } from 'react';
import { Shield, Plus, Edit, Trash2, Copy, Loader2, CheckCircle2, Sparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

import { useToast } from '@/hooks/use-toast';
import {
  getEnterpriseRoles, createEnterpriseRole, updateEnterpriseRole, deleteEnterpriseRole,
  bootstrapEnterpriseRoles,
  type CustomRole, type RoleTemplate, type PermissionCatalogEntry,
} from '@/lib/enterpriseSettingsApi';

const PERMISSION_GROUPS: Record<string, { label: string; permissions: Array<{ key: string; label: string }> }> = {
  members: {
    label: 'Medlemmar',
    permissions: [
      { key: 'members.invite', label: 'Bjuda in' },
      { key: 'members.edit', label: 'Redigera' },
      { key: 'members.remove', label: 'Ta bort' },
    ],
  },
  roles: {
    label: 'Roller',
    permissions: [{ key: 'roles.manage', label: 'Hantera roller' }],
  },
  workspace: {
    label: 'Arbetsyta',
    permissions: [
      { key: 'workspace.manage', label: 'Hantera arbetsyta' },
      { key: 'branding.manage', label: 'Hantera varumärke' },
    ],
  },
  meetings: {
    label: 'Möten',
    permissions: [
      { key: 'meetings.create', label: 'Skapa' },
      { key: 'meetings.edit_own', label: 'Redigera egna' },
      { key: 'meetings.edit_all', label: 'Redigera alla' },
      { key: 'meetings.delete', label: 'Radera' },
      { key: 'meetings.export', label: 'Exportera' },
    ],
  },
  protocols: {
    label: 'Protokoll',
    permissions: [
      { key: 'protocols.edit', label: 'Redigera' },
      { key: 'protocols.approve', label: 'Godkänna' },
      { key: 'protocols.export', label: 'Exportera' },
    ],
  },
  security: {
    label: 'Säkerhet',
    permissions: [
      { key: 'security.manage', label: 'Hantera säkerhet' },
      { key: 'audit.view', label: 'Visa granskningslogg' },
      { key: 'sso.manage', label: 'Hantera SSO' },
    ],
  },
  billing: {
    label: 'Fakturering',
    permissions: [
      { key: 'billing.view', label: 'Visa' },
      { key: 'billing.manage', label: 'Hantera' },
    ],
  },
  integrations: {
    label: 'Integrationer',
    permissions: [
      { key: 'integrations.manage', label: 'Hantera' },
      { key: 'integrations.use', label: 'Använda' },
    ],
  },
  teams: {
    label: 'Team',
    permissions: [
      { key: 'teams.manage', label: 'Hantera team' },
      { key: 'teams.assign', label: 'Tilldela team' },
    ],
  },
  other: {
    label: 'Övrigt',
    permissions: [
      { key: 'retention.manage', label: 'Hantera retention' },
      { key: 'sharing.manage', label: 'Hantera delning' },
    ],
  },
};

const PRESETS = [
  { value: 'viewer', label: 'Läsare' },
  { value: 'editor', label: 'Redigerare' },
  { value: 'meeting_manager', label: 'Möteshanterare' },
  { value: 'compliance_manager', label: 'Compliance' },
  { value: 'integration_manager', label: 'Integrationer' },
  { value: 'workspace_manager', label: 'Arbetsyta' },
];

const TEMPLATE_LABELS: Record<string, string> = {
  meeting_editor: 'Mötesredigerare',
  protocol_reviewer: 'Protokollgranskare',
  member_admin: 'Medlemsadmin',
  security_auditor: 'Säkerhetsgranskare',
  billing_observer: 'Faktureringsobservatör',
  integration_operator: 'Integrationsoperatör',
  workspace_operator: 'Arbetsyteoperatör',
  executive_viewer: 'Ledningsvy',
  external_collaboration_manager: 'Extern samarbetschef',
  retention_operator: 'Retentionsoperatör',
  meeting_operator: 'Mötesoperatör',
  brand_manager: 'Varumärkesansvarig',
};

interface Props {
  companyId: string;
  canEdit: boolean;
  initialRoles?: CustomRole[];
}

export function EnterpriseSettingsRoles({ companyId, canEdit, initialRoles }: Props) {
  const { toast } = useToast();
  const [roles, setRoles] = useState<CustomRole[]>(initialRoles || []);
  const [loading, setLoading] = useState(!initialRoles);
  const [editRole, setEditRole] = useState<Partial<CustomRole> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);

  // Backend-driven role metadata
  const [roleTemplates, setRoleTemplates] = useState<RoleTemplate[]>([]);
  const [recommendedTemplateIds, setRecommendedTemplateIds] = useState<string[]>([]);
  const [backendPresets, setBackendPresets] = useState<Array<{ value: string; label: string }>>([]);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    if (initialRoles) return;
    loadRoles();
  }, [companyId]);

  const loadRoles = async () => {
    setLoading(true);
    try {
      const data = await getEnterpriseRoles(companyId);
      setRoles(data.roles || []);
      if (data.roleTemplates) setRoleTemplates(data.roleTemplates);
      if (data.recommendedTemplateIds) setRecommendedTemplateIds(data.recommendedTemplateIds);
      if (data.presets) setBackendPresets(data.presets);
    } catch { /* toast error */ }
    finally { setLoading(false); }
  };

  const handleBootstrap = async () => {
    setBootstrapping(true);
    try {
      const data = await bootstrapEnterpriseRoles(companyId);
      setRoles(data.roles || []);
      toast({ title: 'Roller skapade', description: `${data.roles?.length || 0} rekommenderade roller har skapats.` });
    } catch (err: any) {
      toast({ title: 'Fel', description: err.message, variant: 'destructive' });
    } finally { setBootstrapping(false); }
  };

  const openNew = () => {
    setEditRole({
      name: '',
      description: '',
      basePreset: 'editor',
      permissions: {},
      assignableBy: ['owner', 'admin'],
      system: false,
      disabled: false,
    });
    setIsNew(true);
  };

  const openFromTemplate = (template: RoleTemplate) => {
    setEditRole({
      name: TEMPLATE_LABELS[template.id] || template.name,
      description: template.description,
      basePreset: template.basePreset,
      permissions: { ...template.permissions },
      assignableBy: ['owner', 'admin'],
      system: false,
      disabled: false,
    });
    setIsNew(true);
    setShowTemplates(false);
  };

  const openEdit = (role: CustomRole) => {
    setEditRole({ ...role });
    setIsNew(false);
  };

  const handleSave = async () => {
    if (!editRole?.name) return;
    setSaving(true);
    try {
      if (isNew) {
        const { role } = await createEnterpriseRole(companyId, editRole);
        setRoles(prev => [...prev, role]);
        toast({ title: `Roll "${role.name}" skapad` });
      } else if (editRole.id) {
        const { role } = await updateEnterpriseRole(companyId, editRole.id, editRole);
        setRoles(prev => prev.map(r => r.id === role.id ? role : r));
        toast({ title: `Roll "${role.name}" uppdaterad` });
      }
      setEditRole(null);
    } catch (err: any) {
      toast({ title: 'Fel', description: err.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleDelete = async (roleId: string) => {
    try {
      await deleteEnterpriseRole(companyId, roleId);
      setRoles(prev => prev.filter(r => r.id !== roleId));
      toast({ title: 'Roll borttagen' });
    } catch (err: any) {
      toast({ title: 'Fel', description: err.message, variant: 'destructive' });
    }
  };

  const handleClone = (role: CustomRole) => {
    setEditRole({
      ...role,
      id: undefined,
      name: `${role.name} (kopia)`,
      system: false,
    });
    setIsNew(true);
  };

  const togglePermission = (key: string) => {
    if (!editRole) return;
    setEditRole({
      ...editRole,
      permissions: { ...(editRole.permissions || {}), [key]: !(editRole.permissions?.[key]) },
    });
  };

  const activePresets = backendPresets.length > 0 ? backendPresets : PRESETS;

  if (loading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Anpassade roller
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">{roles.length} roller definierade</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && roles.length === 0 && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handleBootstrap} disabled={bootstrapping}>
              {bootstrapping ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              Snabbstart
            </Button>
          )}
          {canEdit && roleTemplates.length > 0 && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => setShowTemplates(true)}>
              <Sparkles className="w-3 h-3" />Mallar
            </Button>
          )}
          {canEdit && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openNew}>
              <Plus className="w-3 h-3" />Ny roll
            </Button>
          )}
        </div>
      </div>

      {/* Bootstrap hint when empty */}
      {roles.length === 0 && canEdit && (
        <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-5 text-center space-y-2">
          <Zap className="w-6 h-6 mx-auto text-primary/60" />
          <p className="text-sm font-medium">Inga roller ännu</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Klicka <strong>Snabbstart</strong> för att automatiskt skapa rekommenderade roller, eller skapa egna med <strong>Ny roll</strong>.
          </p>
        </div>
      )}

      {/* Role list */}
      {roles.length > 0 && (
        <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
          {roles.map(role => (
            <div key={role.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{role.name}</p>
                  {role.system && <Badge variant="outline" className="text-[10px]">System</Badge>}
                  {role.disabled && <Badge variant="outline" className="text-[10px] text-muted-foreground">Inaktiv</Badge>}
                  <Badge variant="secondary" className="text-[10px]">{role.basePreset}</Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{role.description}</p>
              </div>
              {canEdit && !role.system && (
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => handleClone(role)} className="p-1.5 rounded hover:bg-muted" title="Klona">
                    <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => openEdit(role)} className="p-1.5 rounded hover:bg-muted" title="Redigera">
                    <Edit className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => handleDelete(role.id)} className="p-1.5 rounded hover:bg-destructive/10" title="Ta bort">
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Templates Dialog */}
      <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Rollmallar
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
            {roleTemplates.map(template => {
              const isRecommended = recommendedTemplateIds.includes(template.id);
              return (
                <button
                  key={template.id}
                  onClick={() => openFromTemplate(template)}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{TEMPLATE_LABELS[template.id] || template.name}</span>
                    {isRecommended && (
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 bg-primary/15 text-primary border-0">
                        Rekommenderad
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[9px] ml-auto">{template.basePreset}</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{template.description}</p>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Role Editor Dialog */}
      <Dialog open={!!editRole} onOpenChange={open => !open && setEditRole(null)}>
        <DialogContent className="max-w-lg p-0 [&]:!gap-0 max-h-[85vh] !flex !flex-col [&]:!overflow-hidden [&]:!grid-cols-none" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <DialogHeader className="px-5 pt-5 pb-3 shrink-0 border-b border-border">
            <DialogTitle>{isNew ? 'Skapa roll' : 'Redigera roll'}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="px-5 py-4 space-y-5">
              <div className="space-y-1.5">
                <Label className="text-xs">Namn</Label>
                <Input value={editRole?.name || ''} onChange={e => setEditRole(prev => prev ? { ...prev, name: e.target.value } : prev)} className="h-9 text-sm" placeholder="T.ex. Mötesansvarig" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Beskrivning</Label>
                <Textarea value={editRole?.description || ''} onChange={e => setEditRole(prev => prev ? { ...prev, description: e.target.value } : prev)} className="text-sm min-h-[60px]" placeholder="Beskriv rollens syfte…" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Baserad på</Label>
                <Select value={editRole?.basePreset || 'editor'} onValueChange={v => setEditRole(prev => prev ? { ...prev, basePreset: v } : prev)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {activePresets.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-medium">Behörigheter</Label>
                {Object.entries(PERMISSION_GROUPS).map(([groupKey, group]) => (
                  <div key={groupKey} className="rounded-lg border border-border p-3 space-y-1.5">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</p>
                    {group.permissions.map(perm => (
                      <div key={perm.key} className="flex items-center justify-between py-0.5">
                        <span className="text-xs">{perm.label}</span>
                        <Switch
                          checked={editRole?.permissions?.[perm.key] ?? false}
                          onCheckedChange={() => togglePermission(perm.key)}
                          className="scale-75"
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="px-5 py-3 shrink-0 border-t border-border bg-muted/30">
            <Button variant="outline" size="sm" onClick={() => setEditRole(null)}>Avbryt</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !editRole?.name}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              {isNew ? 'Skapa' : 'Spara'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
