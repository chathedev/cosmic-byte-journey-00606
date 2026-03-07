import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Shield, Building2, Lock, Palette, Video, Link2, Users, FileText,
  Globe, ChevronRight, CheckCircle2, AlertCircle, Sparkles, Loader2, Circle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useEnterpriseSettings } from '@/hooks/useEnterpriseSettings';
import { cn } from '@/lib/utils';
import type { GovernancePreset } from '@/lib/enterpriseSettingsApi';

const sections = [
  {
    key: 'identity',
    title: 'Identitet & SSO',
    subtitle: 'Leverantörer, provisionering, domänbegränsningar',
    icon: Shield,
    path: '/enterprise/settings/identity',
  },
  {
    key: 'workspace',
    title: 'Arbetsyta & Domäner',
    subtitle: 'Varumärke, logotyper, anpassade domäner',
    icon: Palette,
    path: '/enterprise/settings/workspace',
  },
  {
    key: 'security',
    title: 'Säkerhet & Efterlevnad',
    subtitle: 'Datalagring, åtkomstkontroll, export',
    icon: Lock,
    path: '/enterprise/settings/security',
  },
  {
    key: 'meeting',
    title: 'Möten & Innehåll',
    subtitle: 'Inspelning, AI-sammanfattning, delning',
    icon: Video,
    path: '/enterprise/settings/meetings',
  },
  {
    key: 'integrations',
    title: 'Integrationer',
    subtitle: 'Teams, Zoom, Meet, Slack, API',
    icon: Link2,
    path: '/enterprise/settings/integrations',
  },
  {
    key: 'roles',
    title: 'Roller & Behörigheter',
    subtitle: 'Anpassade roller och rättighetspaket',
    icon: Users,
    path: '/enterprise/settings/roles',
  },
  {
    key: 'audit',
    title: 'Historik & Audit',
    subtitle: 'Ändringslogg och säkerhetshändelser',
    icon: FileText,
    path: '/enterprise/settings/audit',
  },
] as const;

const SETUP_STEP_LABELS: Record<string, string> = {
  add_login_domain: 'Lägg till inloggningsdomän',
  configure_sso_provider: 'Konfigurera SSO-leverantör',
  verify_sso_provider: 'Verifiera SSO-leverantör',
  enable_sso: 'Aktivera SSO',
  apply_governance_preset: 'Tillämpa governance-profil',
  customize_workspace: 'Anpassa arbetsyta',
  enable_email_branding: 'Aktivera e-postvarumärke',
  create_custom_role: 'Skapa anpassad roll',
  invite_first_member: 'Bjud in första medlemmen',
};

function SetupChecklistSection({ setupChecklist }: { setupChecklist: any }) {
  if (!setupChecklist || setupChecklist.progressPercent >= 100) return null;

  const steps = setupChecklist.steps || [];
  const hasSteps = steps.length > 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Konfiguration</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {setupChecklist.completedCount ?? 0} av {setupChecklist.totalCount ?? steps.length} steg klara
          </p>
        </div>
        <span className="text-xs font-medium text-primary">{setupChecklist.progressPercent}%</span>
      </div>

      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
          style={{ width: `${setupChecklist.progressPercent}%` }}
        />
      </div>

      {hasSteps && (
        <div className="space-y-1">
          {steps.map((step: any) => {
            const label = SETUP_STEP_LABELS[step.id] || (typeof step.id === 'string' ? step.id.replace(/_/g, ' ') : step.label || 'Steg');
            return (
              <div key={step.id} className="flex items-center gap-2.5 py-1.5">
                {step.completed ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                ) : (
                  <Circle className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                )}
                <span className={cn(
                  'text-xs capitalize',
                  step.completed ? 'text-muted-foreground line-through' : 'text-foreground'
                )}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!hasSteps && setupChecklist.nextStep && (
        <p className="text-xs text-muted-foreground">
          Nästa: {typeof setupChecklist.nextStep === 'string' ? SETUP_STEP_LABELS[setupChecklist.nextStep] || setupChecklist.nextStep.replace(/_/g, ' ') : String(setupChecklist.nextStep)}
        </p>
      )}
    </div>
  );
}

function GovernancePresetsSection({
  presets,
  activePresetId,
  governanceProfile,
  onApply,
  canEdit,
}: {
  presets?: GovernancePreset[];
  activePresetId?: string | null;
  governanceProfile?: any;
  onApply: (presetId: string) => Promise<void>;
  canEdit: boolean;
}) {
  const [applying, setApplying] = useState<string | null>(null);

  if (!presets || presets.length === 0) return null;

  const handleApply = async (presetId: string) => {
    setApplying(presetId);
    try { await onApply(presetId); } finally { setApplying(null); }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Governance-profiler</h3>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          Snabbstarta din konfiguration med en förinställd governance-profil. Du kan finjustera enskilda inställningar efteråt.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {presets.map((preset) => {
          const isActive = activePresetId === preset.id;
          const isApplying = applying === preset.id;
          return (
            <div
              key={preset.id}
              className={cn(
                'rounded-lg border p-3.5 transition-all',
                isActive
                  ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
                  : 'border-border hover:border-primary/20 hover:bg-muted/30'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{preset.name}</span>
                    {isActive && (
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 bg-primary/15 text-primary border-0">
                        Aktiv
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{preset.description}</p>
                </div>
              </div>

              {preset.highlights && preset.highlights.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {preset.highlights.slice(0, 3).map((h, i) => (
                    <Badge key={i} variant="outline" className="text-[9px] font-normal">{h}</Badge>
                  ))}
                </div>
              )}

              {canEdit && !isActive && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs mt-3 w-full gap-1.5"
                  onClick={() => handleApply(preset.id)}
                  disabled={!!applying}
                >
                  {isApplying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  Tillämpa
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {governanceProfile?.appliedAt && (
        <p className="text-[10px] text-muted-foreground">
          Senast tillämpad: {new Date(governanceProfile.appliedAt).toLocaleDateString('sv-SE')}
          {governanceProfile.appliedBy ? ` av ${governanceProfile.appliedBy}` : ''}
        </p>
      )}
    </div>
  );
}

export default function EnterpriseSettingsPage() {
  const navigate = useNavigate();
  const ctx = useEnterpriseSettings();

  if (!ctx.isEnterprise) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <Shield className="w-8 h-8 mx-auto text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground">Enterprise-inställningar kräver Enterprise-planen.</p>
        </div>
      </div>
    );
  }

  const summary = ctx.data?.settingsSummary;
  const ssoEnabled = summary?.ssoEnabled;
  const lockCount = summary?.lockCount || 0;
  const customRoleCount = summary?.customRoleCount || 0;
  const defaultLoginHostname = summary?.defaultLoginHostname;
  const companyName = ctx.data?.company?.name;
  const activePresetId = ctx.governanceProfile?.policyPresetId || summary?.governancePresetId || null;
  const policyPresets = ctx.catalogs?.policyPresets;

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-3xl mx-auto px-4 py-8 sm:px-6">

        {/* Header */}
        <div className="flex items-start gap-4 mb-8">
          <button onClick={() => navigate('/org/settings')} className="p-1.5 -ml-1.5 mt-0.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-semibold tracking-tight">Enterprise</h1>
              <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px] px-2 py-0.5 font-medium">
                <Building2 className="w-3 h-3 mr-1" />Enterprise
              </Badge>
            </div>
            {ctx.loading ? (
              <div className="h-4 w-36 bg-muted rounded mt-1.5 animate-pulse" />
            ) : (
              <p className="text-sm text-muted-foreground mt-0.5">{companyName || 'Konfiguration'}</p>
            )}
          </div>
        </div>

        {/* Read-only notice */}
        {!ctx.loading && !ctx.canEdit && (
          <div className="mb-6 p-3 rounded-lg border border-amber-200/60 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/10 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            Du har läsbehörighet men kan inte ändra inställningar.
          </div>
        )}

        {/* Status indicators */}
        {ctx.data ? (
          <div className="flex flex-wrap items-center gap-2 mb-6">
            {ssoEnabled && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-50 dark:bg-green-950/20 text-[11px] font-medium text-green-700 dark:text-green-400 border border-green-200/60 dark:border-green-900/40">
                <CheckCircle2 className="w-3 h-3" />SSO aktivt
              </span>
            )}
            {defaultLoginHostname && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/50 text-[11px] font-mono text-foreground/80 border border-border">
                <Globe className="w-3 h-3 text-muted-foreground" />{defaultLoginHostname}
              </span>
            )}
            {lockCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50/50 dark:bg-amber-950/10 text-[11px] font-medium text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/40">
                <Lock className="w-3 h-3" />{lockCount} låsta
              </span>
            )}
            {customRoleCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/50 text-[11px] font-medium text-foreground/80 border border-border">
                <Users className="w-3 h-3 text-muted-foreground" />{customRoleCount} roller
              </span>
            )}
            {activePresetId && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/5 text-[11px] font-medium text-primary border border-primary/20">
                <Sparkles className="w-3 h-3" />{activePresetId}
              </span>
            )}
          </div>
        ) : (
          <div className="flex gap-2 mb-6">
            <div className="h-7 w-20 bg-muted rounded-md animate-pulse" />
            <div className="h-7 w-28 bg-muted rounded-md animate-pulse" />
          </div>
        )}

        {/* Setup checklist */}
        {ctx.setupChecklist && (
          <div className="mb-6">
            <SetupChecklistSection setupChecklist={ctx.setupChecklist} />
          </div>
        )}

        {/* Governance presets */}
        {policyPresets && policyPresets.length > 0 && (
          <div className="mb-6">
            <GovernancePresetsSection
              presets={policyPresets}
              activePresetId={activePresetId}
              governanceProfile={ctx.governanceProfile}
              onApply={ctx.handleApplyPreset}
              canEdit={ctx.canEdit}
            />
          </div>
        )}

        {/* Navigation grid */}
        <div className="space-y-1">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.key}
                onClick={() => navigate(section.path)}
                className="group w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border border-transparent hover:border-border hover:bg-card transition-all text-left"
              >
                <div className="p-2 rounded-lg bg-muted/60 group-hover:bg-primary/10 transition-colors shrink-0">
                  <Icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{section.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{section.subtitle}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/20 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
