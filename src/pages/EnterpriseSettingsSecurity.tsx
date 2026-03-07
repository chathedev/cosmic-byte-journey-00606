import { Lock } from 'lucide-react';
import { EnterpriseSettingsLayout } from '@/components/enterprise/EnterpriseSettingsLayout';
import { EnterpriseSettingsSecurity as SecurityContent } from '@/components/enterprise/EnterpriseSettingsSecurity';

export default function EnterpriseSettingsSecurityPage() {
  return (
    <EnterpriseSettingsLayout
      title="Säkerhet & Efterlevnad"
      description="Datalagring, åtkomstkontroll och exportregler"
      icon={<Lock className="w-5 h-5 text-primary" />}
      sectionSlug="security-compliance"
    >
      {(ctx) => (
        <SecurityContent
          settings={ctx.sectionData}
          locks={ctx.locks}
          canEdit={ctx.canEdit}
          onUpdate={ctx.handleUpdate}
          customizationBoundaries={ctx.customizationBoundaries}
        />
      )}
    </EnterpriseSettingsLayout>
  );
}
