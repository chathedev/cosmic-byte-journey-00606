import { useState } from 'react';
import { Palette, Globe } from 'lucide-react';
import { EnterpriseSettingsLayout } from '@/components/enterprise/EnterpriseSettingsLayout';
import { EnterpriseSettingsWorkspace as WorkspaceContent } from '@/components/enterprise/EnterpriseSettingsWorkspace';
import { EnterpriseSettingsDomains } from '@/components/enterprise/EnterpriseSettingsDomains';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'workspace', label: 'Arbetsyta', icon: Palette },
  { id: 'domains', label: 'Domäner', icon: Globe },
] as const;

type TabId = typeof TABS[number]['id'];

export default function EnterpriseSettingsWorkspacePage() {
  const [activeTab, setActiveTab] = useState<TabId>('workspace');

  return (
    <EnterpriseSettingsLayout
      title="Arbetsyta & Domäner"
      description="Branding, logotyper, anpassade domäner och e-postmallar"
      icon={<Palette className="w-5 h-5 text-purple-600 dark:text-purple-400" />}
    >
      {(ctx) => (
        <div className="space-y-6">
          {/* Tab navigation */}
          <div className="flex gap-1 p-1 rounded-lg bg-muted/50 border border-border w-fit">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
                    isActive
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          {activeTab === 'workspace' && (
            <WorkspaceContent
              settings={ctx.data!.settings.adminWorkspace}
              locks={ctx.data!.locks}
              canEdit={ctx.canEdit}
              onUpdate={ctx.handleUpdate}
            />
          )}

          {activeTab === 'domains' && ctx.companyId && (
            <EnterpriseSettingsDomains
              companyId={ctx.companyId}
              customDomains={(ctx.data!.settings.adminWorkspace as any)?.customDomains}
              canEdit={ctx.canEdit}
            />
          )}
        </div>
      )}
    </EnterpriseSettingsLayout>
  );
}
