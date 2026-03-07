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
        const settings = ctx.data?.settings ?? ctx.data ?? {};
        const summary = ctx.data?.settingsSummary ?? ctx.data?.summary ?? {};

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
            hasVerifiedDomain={!!(settings?.customDomains ?? ctx.data?.customDomains)?.domains?.some((d: any) => d.status === 'verified')}
            defaultLoginHostname={settings?.customDomains?.defaultLoginHostname || summary?.defaultLoginHostname || null}
          />
        );
      }}
    </EnterpriseSettingsLayout>
  );
}
