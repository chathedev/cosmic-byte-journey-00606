import { Palette } from 'lucide-react';
import { EnterpriseSettingsLayout } from '@/components/enterprise/EnterpriseSettingsLayout';
import { EnterpriseSettingsWorkspace as WorkspaceContent } from '@/components/enterprise/EnterpriseSettingsWorkspace';
import { EnterpriseSettingsDomains } from '@/components/enterprise/EnterpriseSettingsDomains';

export default function EnterpriseSettingsWorkspacePage() {
  return (
    <EnterpriseSettingsLayout
      title="Arbetsyta & Domäner"
      description="Branding, logotyper, anpassade domäner och e-postmallar"
      icon={<Palette className="w-5 h-5 text-purple-600 dark:text-purple-400" />}
    >
      {(ctx) => (
        <div className="space-y-8">
          <WorkspaceContent
            settings={ctx.data!.settings.adminWorkspace}
            locks={ctx.data!.locks}
            canEdit={ctx.canEdit}
            onUpdate={ctx.handleUpdate}
          />
          {ctx.companyId && (
            <EnterpriseSettingsDomains
              companyId={ctx.companyId}
              customDomains={(ctx.data!.settings.adminWorkspace as any)?.customDomains}
              canEdit={ctx.canEdit}
              onDomainsChanged={ctx.loadSettings}
            />
          )}
        </div>
      )}
    </EnterpriseSettingsLayout>
  );
}
