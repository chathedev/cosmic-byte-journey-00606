import { Shield } from 'lucide-react';
import { EnterpriseSettingsLayout } from '@/components/enterprise/EnterpriseSettingsLayout';
import { EnterpriseSettingsIdentity as IdentityContent } from '@/components/enterprise/EnterpriseSettingsIdentity';

export default function EnterpriseSettingsIdentityPage() {
  return (
    <EnterpriseSettingsLayout
      title="Identitet & SSO"
      description="Leverantörer, provisionering och domänbegränsningar"
      icon={<Shield className="w-5 h-5 text-primary" />}
      sectionSlug="identity-access"
    >
      {(ctx) => {
        // Backend: response.data = { ssoEnabled, providers, ... }
        const settings = ctx.sectionData;
        const summary = ctx.settingsSummary ?? {};

        return (
          <IdentityContent
            settings={settings}
            locks={ctx.locks}
            canEdit={ctx.canEdit}
            onUpdate={ctx.handleUpdate}
            onTestSSO={ctx.handleTestSSO}
            onConnectSSO={ctx.handleConnectSSO}
            onDisableProvider={ctx.handleDisableProvider}
            onRemoveProvider={ctx.handleRemoveProvider}
            onResetProvider={ctx.handleResetProvider}
            providerReadiness={summary?.providerReadiness}
            hasVerifiedDomain={summary?.ssoCustomDomainReady ?? false}
            defaultLoginHostname={summary?.defaultLoginHostname || null}
          />
        );
      }}
    </EnterpriseSettingsLayout>
  );
}
