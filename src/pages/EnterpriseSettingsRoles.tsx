import { Users } from 'lucide-react';
import { EnterpriseSettingsLayout } from '@/components/enterprise/EnterpriseSettingsLayout';
import { EnterpriseSettingsRoles as RolesContent } from '@/components/enterprise/EnterpriseSettingsRoles';

export default function EnterpriseSettingsRolesPage() {
  return (
    <EnterpriseSettingsLayout
      title="Roller & Behörigheter"
      description="Anpassade roller, behörighetspaket och rollmallar"
      icon={<Users className="w-5 h-5 text-primary" />}
    >
      {(ctx) => (
        <RolesContent
          companyId={ctx.companyId ?? ''}
          canEdit={ctx.canEdit}
          initialRoles={ctx.data?.settings?.customRoles ?? []}
        />
      )}
    </EnterpriseSettingsLayout>
  );
}
