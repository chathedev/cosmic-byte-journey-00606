import { Link2 } from 'lucide-react';
import { EnterpriseSettingsLayout } from '@/components/enterprise/EnterpriseSettingsLayout';
import { EnterpriseSettingsIntegrations as IntegrationsContent } from '@/components/enterprise/EnterpriseSettingsIntegrations';

export default function EnterpriseSettingsIntegrationsPage() {
  return (
    <EnterpriseSettingsLayout
      title="Integrationer"
      description="Teams, Zoom, Google Meet, Slack, API och webhooks"
      icon={<Link2 className="w-5 h-5 text-primary" />}
    >
      {(ctx) => (
        <IntegrationsContent
          settings={ctx.data?.settings?.integrations ?? {}}
          locks={ctx.data?.locks ?? {}}
          canEdit={ctx.canEdit}
          onUpdate={ctx.handleUpdate}
        />
      )}
    </EnterpriseSettingsLayout>
  );
}
