import { FileText } from 'lucide-react';
import { EnterpriseSettingsLayout } from '@/components/enterprise/EnterpriseSettingsLayout';
import { EnterpriseSettingsAudit as AuditContent } from '@/components/enterprise/EnterpriseSettingsAudit';

export default function EnterpriseSettingsAuditPage() {
  return (
    <EnterpriseSettingsLayout
      title="Historik & Audit"
      description="Ändringslogg, inloggningshistorik och säkerhetshändelser"
      icon={<FileText className="w-5 h-5 text-slate-600 dark:text-slate-400" />}
    >
      {(ctx) => (
        <AuditContent companyId={ctx.companyId!} />
      )}
    </EnterpriseSettingsLayout>
  );
}
