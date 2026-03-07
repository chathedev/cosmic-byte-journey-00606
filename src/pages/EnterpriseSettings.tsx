import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Building2, Lock, Palette, Video, Link2, Users, FileText, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useEnterpriseSettings } from '@/hooks/useEnterpriseSettings';
import { EnterpriseSettingsIdentity } from '@/components/enterprise/EnterpriseSettingsIdentity';
import { EnterpriseSettingsWorkspace } from '@/components/enterprise/EnterpriseSettingsWorkspace';
import { EnterpriseSettingsDomains } from '@/components/enterprise/EnterpriseSettingsDomains';
import { EnterpriseSettingsSecurity } from '@/components/enterprise/EnterpriseSettingsSecurity';
import { EnterpriseSettingsMeeting } from '@/components/enterprise/EnterpriseSettingsMeeting';
import { EnterpriseSettingsIntegrations } from '@/components/enterprise/EnterpriseSettingsIntegrations';
import { EnterpriseSettingsRoles } from '@/components/enterprise/EnterpriseSettingsRoles';
import { EnterpriseSettingsAudit } from '@/components/enterprise/EnterpriseSettingsAudit';
import { cn } from '@/lib/utils';

const sections = [
  { key: 'identity', title: 'Identitet & SSO', icon: Shield, color: 'text-blue-600 dark:text-blue-400' },
  { key: 'workspace', title: 'Arbetsyta & Domäner', icon: Palette, color: 'text-purple-600 dark:text-purple-400' },
  { key: 'security', title: 'Säkerhet', icon: Lock, color: 'text-amber-600 dark:text-amber-400' },
  { key: 'meeting', title: 'Möten & Innehåll', icon: Video, color: 'text-green-600 dark:text-green-400' },
  { key: 'integrations', title: 'Integrationer', icon: Link2, color: 'text-cyan-600 dark:text-cyan-400' },
  { key: 'roles', title: 'Roller', icon: Users, color: 'text-rose-600 dark:text-rose-400' },
  { key: 'audit', title: 'Historik', icon: FileText, color: 'text-slate-600 dark:text-slate-400' },
] as const;

type SectionKey = typeof sections[number]['key'];

export default function EnterpriseSettingsPage() {
  const navigate = useNavigate();
  const ctx = useEnterpriseSettings();
  const [activeTab, setActiveTab] = useState<SectionKey>('identity');

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

  if (ctx.loading || !ctx.data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const renderContent = () => {
    if (!ctx.data) return null;

    switch (activeTab) {
      case 'identity':
        return (
          <EnterpriseSettingsIdentity
            settings={ctx.data.settings.identityAccess}
            locks={ctx.data.locks}
            canEdit={ctx.canEdit}
            onUpdate={ctx.handleUpdate}
            onTestSSO={ctx.handleTestSSO}
            onConnectSSO={ctx.handleConnectSSO}
            providerReadiness={ctx.data.settingsSummary?.providerReadiness}
            hasVerifiedDomain={!!(ctx.data.settings.adminWorkspace as any)?.customDomains?.domains?.some((d: any) => d.status === 'verified')}
            defaultLoginHostname={(ctx.data.settings.adminWorkspace as any)?.customDomains?.defaultLoginHostname || ctx.data.settingsSummary?.defaultLoginHostname || null}
          />
        );
      case 'workspace':
        return (
          <div className="space-y-8">
            <EnterpriseSettingsWorkspace
              settings={ctx.data.settings.adminWorkspace}
              locks={ctx.data.locks}
              canEdit={ctx.canEdit}
              onUpdate={ctx.handleUpdate}
            />
            {ctx.companyId && (
              <EnterpriseSettingsDomains
                companyId={ctx.companyId}
                customDomains={(ctx.data.settings.adminWorkspace as any)?.customDomains}
                canEdit={ctx.canEdit}
                onDomainsChanged={ctx.loadSettings}
              />
            )}
          </div>
        );
      case 'security':
        return (
          <EnterpriseSettingsSecurity
            settings={ctx.data.settings.securityCompliance}
            locks={ctx.data.locks}
            canEdit={ctx.canEdit}
            onUpdate={ctx.handleUpdate}
          />
        );
      case 'meeting':
        return (
          <EnterpriseSettingsMeeting
            settings={ctx.data.settings.meetingContentControls}
            locks={ctx.data.locks}
            canEdit={ctx.canEdit}
            onUpdate={ctx.handleUpdate}
          />
        );
      case 'integrations':
        return (
          <EnterpriseSettingsIntegrations
            settings={ctx.data.settings.integrations}
            locks={ctx.data.locks}
            canEdit={ctx.canEdit}
            onUpdate={ctx.handleUpdate}
          />
        );
      case 'roles':
        return (
          <EnterpriseSettingsRoles
            companyId={ctx.companyId!}
            canEdit={ctx.canEdit}
            initialRoles={ctx.data.settings.customRoles}
          />
        );
      case 'audit':
        return <EnterpriseSettingsAudit companyId={ctx.companyId!} />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-5xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/org/settings')} className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-semibold">Enterprise-inställningar</h1>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{ctx.data.company?.name}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary" className="bg-primary/15 text-primary text-xs gap-1">
              <Building2 className="w-3 h-3" />Enterprise
            </Badge>
            {ctx.hasLocks && (
              <Badge variant="outline" className="text-xs gap-1 border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400">
                <Lock className="w-3 h-3" />Låsta fält
              </Badge>
            )}
          </div>
        </div>

        {!ctx.canEdit && (
          <div className="mb-4 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20 text-xs text-amber-700 dark:text-amber-300">
            Du har läsbehörighet men kan inte ändra enterprise-inställningar.
          </div>
        )}

        {/* Tab navigation + content */}
        <div className="flex flex-col sm:flex-row gap-6">
          {/* Sidebar tabs */}
          <nav className="sm:w-52 shrink-0">
            <div className="sm:sticky sm:top-6 flex sm:flex-col gap-1 overflow-x-auto sm:overflow-visible pb-2 sm:pb-0 -mx-1 px-1">
              {sections.map((section) => {
                const Icon = section.icon;
                const isActive = activeTab === section.key;
                return (
                  <button
                    key={section.key}
                    onClick={() => setActiveTab(section.key)}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all whitespace-nowrap text-sm",
                      isActive
                        ? "bg-primary/10 text-primary font-medium shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    )}
                  >
                    <Icon className={cn("w-4 h-4 shrink-0", isActive ? 'text-primary' : section.color)} />
                    <span className="truncate">{section.title}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
