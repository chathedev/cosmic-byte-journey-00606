import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Building2, Lock, Palette, Video, Link2, Users, FileText, Globe, ChevronRight, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useEnterpriseSettings } from '@/hooks/useEnterpriseSettings';

const sections = [
  {
    key: 'identity',
    title: 'Identitet & SSO',
    description: 'Single sign-on, leverantörer, domänbegränsningar och JIT-provisionering',
    icon: Shield,
    path: '/org/enterprise-settings/identity',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  {
    key: 'workspace',
    title: 'Arbetsyta & Domäner',
    description: 'Branding, logotyper, anpassade domäner och e-postmallar',
    icon: Palette,
    path: '/org/enterprise-settings/workspace',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-500/10',
  },
  {
    key: 'security',
    title: 'Säkerhet & Efterlevnad',
    description: 'Datalagring, IP-begränsningar, exportkontroller och EU-residens',
    icon: Lock,
    path: '/org/enterprise-settings/security',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-500/10',
  },
  {
    key: 'meeting',
    title: 'Möten & Innehåll',
    description: 'Inspelning, transkribering, AI-sammanfattning och delningspolicyer',
    icon: Video,
    path: '/org/enterprise-settings/meetings',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-500/10',
  },
  {
    key: 'integrations',
    title: 'Integrationer',
    description: 'Teams, Zoom, Google Meet, Slack, API-åtkomst och webhooks',
    icon: Link2,
    path: '/org/enterprise-settings/integrations',
    color: 'text-cyan-600 dark:text-cyan-400',
    bgColor: 'bg-cyan-500/10',
  },
  {
    key: 'roles',
    title: 'Roller & Behörigheter',
    description: 'Anpassade roller, behörighetspaket och rollmallar',
    icon: Users,
    path: '/org/enterprise-settings/roles',
    color: 'text-rose-600 dark:text-rose-400',
    bgColor: 'bg-rose-500/10',
  },
  {
    key: 'audit',
    title: 'Historik & Audit',
    description: 'Ändringslogg, inloggningshistorik och säkerhetshändelser',
    icon: FileText,
    path: '/org/enterprise-settings/audit',
    color: 'text-slate-600 dark:text-slate-400',
    bgColor: 'bg-slate-500/10',
  },
];

export default function EnterpriseSettingsPage() {
  const navigate = useNavigate();
  const { isEnterprise, loading, data, hasLocks } = useEnterpriseSettings();

  if (!isEnterprise) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-2">
          <Shield className="w-10 h-10 mx-auto text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">Enterprise-inställningar är bara tillgängliga för Enterprise-planen.</p>
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-4xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => navigate('/org/settings')} className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold">Enterprise-inställningar</h1>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{data.company?.name}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary" className="bg-primary/15 text-primary text-xs gap-1">
              <Building2 className="w-3 h-3" />Enterprise
            </Badge>
            {hasLocks && (
              <Badge variant="outline" className="text-xs gap-1 border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400">
                <Lock className="w-3 h-3" />Låsta fält
              </Badge>
            )}
          </div>
        </div>

        {/* Section cards */}
        <div className="space-y-3">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.key}
                onClick={() => navigate(section.path)}
                className="w-full text-left rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors group"
              >
                <div className="p-4 sm:p-5 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl ${section.bgColor} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-5 h-5 ${section.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-semibold text-foreground">{section.title}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{section.description}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
