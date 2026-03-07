import { Lock } from 'lucide-react';
import { EnterpriseSettingsLayout } from '@/components/enterprise/EnterpriseSettingsLayout';
import { EnterpriseSettingsSecurity as SecurityContent } from '@/components/enterprise/EnterpriseSettingsSecurity';

export default function EnterpriseSettingsSecurityPage() {
  return (
    <EnterpriseSettingsLayout
      title="Säkerhet & Efterlevnad"
      description="Datalagring, IP-begränsningar och exportkontroller"
      icon={<Lock className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
    >
      {(ctx) => (
        <SecurityContent
          settings={ctx.data!.settings.securityCompliance}
          locks={ctx.data!.locks}
          canEdit={ctx.canEdit}
          onUpdate={ctx.handleUpdate}
        />
      )}
    </EnterpriseSettingsLayout>
  );
}
