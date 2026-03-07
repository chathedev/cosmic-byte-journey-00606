import { FileText } from 'lucide-react';
import { EnterpriseSettingsLayout } from '@/components/enterprise/EnterpriseSettingsLayout';
import { EnterpriseSettingsAudit as AuditContent } from '@/components/enterprise/EnterpriseSettingsAudit';

export default function EnterpriseSettingsAuditPage() {
  return (
    <EnterpriseSettingsLayout
      title="Historik & Audit"
      description="Ändringslogg, inloggningshistorik och säkerhetshändelser"
      icon={<FileText className="w-5 h-5 text-primary" />}
    >
      {(ctx) => (
        <AuditContent companyId={ctx.companyId ?? ''} />
      )}
    </EnterpriseSettingsLayout>
  );
}
