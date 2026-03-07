import { Shield } from 'lucide-react';
import { EnterpriseSettingsLayout } from '@/components/enterprise/EnterpriseSettingsLayout';
import { EnterpriseSettingsIdentity as IdentityContent } from '@/components/enterprise/EnterpriseSettingsIdentity';

export default function EnterpriseSettingsIdentityPage() {
  return (
    <EnterpriseSettingsLayout
      title="Identitet & SSO"
      description="Leverantörer, provisionering och domänbegränsningar"
      icon={<Shield className="w-5 h-5 text-primary" />}
    >
      {(ctx) => (
        <IdentityContent
          settings={ctx.data!.settings.identityAccess}
          locks={ctx.data!.locks}
          canEdit={ctx.canEdit}
          onUpdate={ctx.handleUpdate}
          onTestSSO={ctx.handleTestSSO}
          onConnectSSO={ctx.handleConnectSSO}
          onDisableProvider={ctx.handleDisableProvider}
          onRemoveProvider={ctx.handleRemoveProvider}
          onResetProvider={ctx.handleResetProvider}
          providerReadiness={ctx.data!.settingsSummary?.providerReadiness}
          hasVerifiedDomain={!!(ctx.data!.settings.adminWorkspace as any)?.customDomains?.domains?.some((d: any) => d.status === 'verified')}
          defaultLoginHostname={(ctx.data!.settings.adminWorkspace as any)?.customDomains?.defaultLoginHostname || ctx.data!.settingsSummary?.defaultLoginHostname || null}
        />
      )}
    </EnterpriseSettingsLayout>
  );
}
