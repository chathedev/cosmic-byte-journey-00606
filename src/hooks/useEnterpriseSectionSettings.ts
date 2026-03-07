import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useToast } from '@/hooks/use-toast';
import {
  getEnterpriseSectionSettings, updateEnterpriseSectionSettings,
  testSSO, connectSSO, disableSSOProvider, removeSSOProvider, resetSSOProvider,
  type CustomizationBoundaries,
} from '@/lib/enterpriseSettingsApi';

/**
 * Hook for section-specific enterprise settings.
 * Calls GET /enterprise/companies/:companyId/settings/<sectionSlug>
 * and PATCH to the same section endpoint.
 *
 * Backend response shape for standard sections:
 *   { company, section, data: {...}, locks, settingsSummary, setupChecklist, viewer, timestamp }
 *
 * The actual settings live in response.data — exposed here as `sectionData`.
 */
export function useEnterpriseSectionSettings(sectionSlug: string) {
  const navigate = useNavigate();
  const { enterpriseMembership } = useSubscription();
  const { toast } = useToast();
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const companyId = enterpriseMembership?.company?.id;
  const planType = enterpriseMembership?.company?.planType || (enterpriseMembership?.company as any)?.plan;
  const isEnterprise = planType === 'enterprise';

  const loadSettings = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await getEnterpriseSectionSettings(companyId, sectionSlug);
      setResponse(res);
    } catch (err: any) {
      if (err.code === 'enterprise_only_feature') {
        toast({ title: 'Ej tillgängligt', description: 'Enterprise-inställningar är bara tillgängliga för Enterprise-planen.', variant: 'destructive' });
        navigate('/org/settings');
      }
    } finally {
      setLoading(false);
    }
  }, [companyId, sectionSlug]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  // Derived data from the response
  const viewer = response?.viewer;
  const canEdit = viewer?.canManageEnterpriseSettings ?? viewer?.canManageRoles ?? false;
  const locks = response?.locks ?? {};
  const hasLocks = Object.keys(locks).length > 0;
  const customizationBoundaries: CustomizationBoundaries | undefined = response?.customizationBoundaries;
  const settingsSummary = response?.settingsSummary;

  // The actual section settings — lives in response.data for standard sections
  const sectionData = useMemo(() => response?.data ?? {}, [response]);

  const handleUpdate = async (patch: Record<string, any>) => {
    if (!companyId) return;
    const previousResponse = response;
    // Optimistic update — patch response.data
    if (response) {
      setResponse({
        ...response,
        data: { ...response.data, ...patch },
      });
    }
    try {
      const res = await updateEnterpriseSectionSettings(companyId, sectionSlug, patch);
      setResponse(res);
      toast({ title: 'Inställningar sparade' });
    } catch (err: any) {
      setResponse(previousResponse);
      if (err.status === 423) {
        toast({ title: 'Låst inställning', description: 'Denna inställning är låst av en administratör.', variant: 'destructive' });
      } else {
        toast({ title: 'Fel', description: err.message, variant: 'destructive' });
      }
    }
  };

  // SSO actions (identity section)
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
      toast({ title: `${provider} inaktiverad` });
      await loadSettings();
    } catch (err: any) {
      toast({ title: 'Kunde inte inaktivera', description: err.message, variant: 'destructive' });
    }
  };

  const handleRemoveProvider = async (provider: string) => {
    if (!companyId) return;
    try {
      await removeSSOProvider(companyId, provider);
      toast({ title: `${provider} borttagen` });
      await loadSettings();
    } catch (err: any) {
      toast({ title: 'Kunde inte ta bort', description: err.message, variant: 'destructive' });
    }
  };

  const handleResetProvider = async (provider: string) => {
    if (!companyId) return;
    try {
      await resetSSOProvider(companyId, provider);
      toast({ title: `${provider} återställd` });
      await loadSettings();
    } catch (err: any) {
      toast({ title: 'Kunde inte återställa', description: err.message, variant: 'destructive' });
    }
  };

  return {
    /** Full API response — use for accessing viewer, settingsSummary, setupChecklist, etc. */
    data: response,
    /** The actual section settings (response.data) — use for rendering settings UI */
    sectionData,
    loading,
    companyId,
    isEnterprise,
    canEdit,
    hasLocks,
    locks,
    customizationBoundaries,
    settingsSummary,
    handleUpdate,
    handleTestSSO,
    handleConnectSSO,
    handleDisableProvider,
    handleRemoveProvider,
    handleResetProvider,
    loadSettings,
  };
}
