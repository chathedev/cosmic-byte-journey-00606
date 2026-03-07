import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useToast } from '@/hooks/use-toast';
import { translateError } from '@/lib/errorTranslation';
import {
  getEnterpriseSettings, updateEnterpriseSettings, testSSO, connectSSO,
  disableSSOProvider, removeSSOProvider, resetSSOProvider,
  type EnterpriseSettingsResponse,
} from '@/lib/enterpriseSettingsApi';

export function useEnterpriseSettings() {
  const navigate = useNavigate();
  const { enterpriseMembership } = useSubscription();
  const { toast } = useToast();
  const [data, setData] = useState<EnterpriseSettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const companyId = enterpriseMembership?.company?.id;
  const planType = enterpriseMembership?.company?.planType || (enterpriseMembership?.company as any)?.plan;
  const isEnterprise = planType === 'enterprise';

  const loadSettings = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await getEnterpriseSettings(companyId);
      setData(res);
    } catch (err: any) {
      if (err.code === 'enterprise_only_feature') {
        toast({ title: 'Ej tillgängligt', description: 'Enterprise-inställningar är bara tillgängliga för Enterprise-planen.', variant: 'destructive' });
        navigate('/org/settings');
      }
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleUpdate = async (patch: Record<string, any>) => {
    if (!companyId) return;
    try {
      const res = await updateEnterpriseSettings(companyId, patch);
      setData(res);
      toast({ title: 'Inställningar sparade' });
    } catch (err: any) {
      if (err.status === 423) {
        toast({ title: 'Låst inställning', description: 'Denna inställning är låst av en administratör.', variant: 'destructive' });
      } else {
        toast({ title: 'Fel', description: err.message, variant: 'destructive' });
      }
    }
  };

  const handleTestSSO = async (provider: string, config?: Record<string, any>) => {
    if (!companyId) return;
    try {
      const result = await testSSO(companyId, provider, config);
      toast({ title: result.ready ? `${provider} är redo` : `${provider} saknar konfiguration` });
    } catch (err: any) {
      toast({ title: 'SSO-test misslyckades', description: err.message, variant: 'destructive' });
    }
  };

  const handleConnectSSO = async (provider: string, config?: Record<string, any>) => {
    if (!companyId) return;
    try {
      const result = await connectSSO(companyId, provider, config);
      if (result.authorizationUrl) window.location.href = result.authorizationUrl;
    } catch (err: any) {
      toast({ title: 'Anslutning misslyckades', description: err.message, variant: 'destructive' });
    }
  };

  const handleDisableProvider = async (provider: string) => {
    if (!companyId) return;
    try {
      await disableSSOProvider(companyId, provider);
      toast({ title: `${provider} inaktiverad`, description: 'Providern är pausad men konfigurationen finns kvar.' });
      await loadSettings();
    } catch (err: any) {
      toast({ title: 'Kunde inte inaktivera', description: err.message, variant: 'destructive' });
    }
  };

  const handleRemoveProvider = async (provider: string) => {
    if (!companyId) return;
    try {
      await removeSSOProvider(companyId, provider);
      toast({ title: `${provider} borttagen`, description: 'Providern och dess konfiguration har raderats.' });
      await loadSettings();
    } catch (err: any) {
      toast({ title: 'Kunde inte ta bort', description: err.message, variant: 'destructive' });
    }
  };

  const handleResetProvider = async (provider: string) => {
    if (!companyId) return;
    try {
      await resetSSOProvider(companyId, provider);
      toast({ title: `${provider} återställd`, description: 'Nästa anslutningsförsök kräver interaktiv godkännande.' });
      await loadSettings();
    } catch (err: any) {
      toast({ title: 'Kunde inte återställa', description: err.message, variant: 'destructive' });
    }
  };

  return {
    data,
    loading,
    companyId,
    isEnterprise,
    canEdit: data?.viewer?.canManageEnterpriseSettings ?? false,
    hasLocks: Object.keys(data?.locks || {}).length > 0,
    handleUpdate,
    handleTestSSO,
    handleConnectSSO,
    handleDisableProvider,
    handleRemoveProvider,
    handleResetProvider,
    loadSettings,
  };
}
