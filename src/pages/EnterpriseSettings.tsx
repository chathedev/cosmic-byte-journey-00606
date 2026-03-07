import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Building2, Lock, Palette, Video, Link2, Users, FileText, Loader2, ChevronRight, Globe } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useEnterpriseSettings } from '@/hooks/useEnterpriseSettings';

const sections = [
  {
    key: 'identity',
    title: 'Identitet & SSO',
    description: 'Single sign-on, leverantörer och provisionering',
    icon: Shield,
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    path: '/org/enterprise-settings/identity',
  },
  {
    key: 'workspace',
    title: 'Arbetsyta & Domäner',
    description: 'Branding, logotyper och anpassade domäner',
    icon: Palette,
    color: 'text-purple-600 dark:text-purple-400',
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    path: '/org/enterprise-settings/workspace',
  },
  {
    key: 'security',
    title: 'Säkerhet & Efterlevnad',
    description: 'Datalagring, IP-begränsningar och exportkontroller',
    icon: Lock,
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    path: '/org/enterprise-settings/security',
  },
  {
    key: 'meeting',
    title: 'Möten & Innehåll',
    description: 'Inspelning, transkribering, AI och delningspolicyer',
    icon: Video,
    color: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-50 dark:bg-green-950/30',
    path: '/org/enterprise-settings/meetings',
  },
  {
    key: 'integrations',
    title: 'Integrationer',
    description: 'Teams, Zoom, Google Meet, Slack och API-åtkomst',
    icon: Link2,
    color: 'text-cyan-600 dark:text-cyan-400',
    bg: 'bg-cyan-50 dark:bg-cyan-950/30',
    path: '/org/enterprise-settings/integrations',
  },
  {
    key: 'roles',
    title: 'Roller & Behörigheter',
    description: 'Anpassade roller och behörighetspaket',
    icon: Users,
    color: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-50 dark:bg-rose-950/30',
    path: '/org/enterprise-settings/roles',
  },
  {
    key: 'audit',
    title: 'Historik & Audit',
    description: 'Ändringslogg och säkerhetshändelser',
    icon: FileText,
    color: 'text-slate-600 dark:text-slate-400',
    bg: 'bg-slate-50 dark:bg-slate-950/30',
    path: '/org/enterprise-settings/audit',
  },
] as const;

export default function EnterpriseSettingsPage() {
  const navigate = useNavigate();
  const ctx = useEnterpriseSettings();

  if (!ctx.isEnterprise) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-2">
          <Shield className="w-10 h-10 mx-auto text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">Enterprise-inställningar är bara tillgängliga för Enterprise-planen.</p>
        </div>
      </div>
    );
  }

  // Quick stats from settings summary (safe even when data is null)
  const summary = ctx.data?.settingsSummary;
  const ssoEnabled = summary?.ssoEnabled;
  const lockCount = summary?.lockCount || 0;
  const customRoleCount = summary?.customRoleCount || 0;
  const defaultLoginHostname = summary?.defaultLoginHostname;
  const companyName = ctx.data?.company?.name;

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => navigate('/org/settings')} className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold">Enterprise</h1>
            {companyName ? (
              <p className="text-sm text-muted-foreground mt-0.5 truncate">{companyName}</p>
            ) : (
              <div className="h-4 w-32 bg-muted rounded animate-pulse mt-1" />
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary" className="bg-primary/15 text-primary text-xs gap-1">
              <Building2 className="w-3 h-3" />Enterprise
            </Badge>
          </div>
        </div>

        {!ctx.loading && !ctx.canEdit && (
          <div className="mb-6 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20 text-xs text-amber-700 dark:text-amber-300">
            Du har läsbehörighet men kan inte ändra enterprise-inställningar.
          </div>
        )}

        {/* Quick status bar */}
        {ctx.data ? (
          <div className="flex flex-wrap gap-3 mb-8">
            {ssoEnabled && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 text-xs text-green-700 dark:text-green-400">
                <Shield className="w-3 h-3" />SSO aktivt
              </div>
            )}
            {defaultLoginHostname && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/10 text-xs text-foreground">
                <Globe className="w-3 h-3 text-primary" />
                <span className="font-mono text-[11px]">{defaultLoginHostname}</span>
              </div>
            )}
            {lockCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-700 dark:text-amber-400">
                <Lock className="w-3 h-3" />{lockCount} låsta fält
              </div>
            )}
            {customRoleCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-400">
                <Users className="w-3 h-3" />{customRoleCount} roller
              </div>
            )}
          </div>
        ) : (
          <div className="flex gap-3 mb-8 animate-pulse">
            <div className="h-8 w-24 bg-muted rounded-full" />
            <div className="h-8 w-32 bg-muted rounded-full" />
          </div>
        )}

        {/* Section grid */}
        <div className="grid gap-3 sm:grid-cols-2">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.key}
                onClick={() => navigate(section.path)}
                className="group flex items-start gap-3.5 p-4 rounded-xl border border-border bg-card hover:border-primary/20 hover:shadow-sm transition-all text-left"
              >
                <div className={`p-2 rounded-lg ${section.bg} shrink-0`}>
                  <Icon className={`w-4 h-4 ${section.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium group-hover:text-primary transition-colors">{section.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{section.description}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary/50 mt-0.5 shrink-0 transition-colors" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
