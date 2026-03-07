import { Lock } from 'lucide-react';
import { EnterpriseSettingsLayout } from '@/components/enterprise/EnterpriseSettingsLayout';
import { EnterpriseSettingsSecurity as SecurityContent } from '@/components/enterprise/EnterpriseSettingsSecurity';

export default function EnterpriseSettingsSecurityPage() {
  return (
    <EnterpriseSettingsLayout
      title="Säkerhet & Efterlevnad"
      description="Datalagring, åtkomstkontroll och exportregler"
      icon={<Lock className="w-5 h-5 text-primary" />}
    >
      {(ctx) => (
        <SecurityContent
          settings={ctx.data!.settings.securityCompliance}
          locks={ctx.data!.locks}
          canEdit={ctx.canEdit}
          onUpdate={ctx.handleUpdate}
          customizationBoundaries={ctx.customizationBoundaries}
        />
      )}
    </EnterpriseSettingsLayout>
  );
}
