import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useSubscription } from './SubscriptionContext';
import { getEnterpriseSettings } from '@/lib/enterpriseSettingsApi';
import tivlyLogo from '@/assets/tivly-logo.png';

interface EnterpriseBranding {
  logoUrl: string; // Falls back to tivlyLogo
  workspaceName: string | null;
  isEnterprise: boolean;
  refreshBranding: () => Promise<void>;
}

const EnterpriseBrandingContext = createContext<EnterpriseBranding>({
  logoUrl: tivlyLogo,
  workspaceName: null,
  isEnterprise: false,
  refreshBranding: async () => {},
});

const CACHE_KEY = 'tivly_enterprise_branding';

export function EnterpriseBrandingProvider({ children }: { children: ReactNode }) {
  const { enterpriseMembership, userPlan } = useSubscription();
  const isEnterprise = userPlan?.plan === 'enterprise' || enterpriseMembership?.isMember === true;
  const companyId = enterpriseMembership?.company?.id;

  const [logoUrl, setLogoUrl] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const data = JSON.parse(cached);
          if (data.logoUrl) return data.logoUrl;
        }
      } catch {}
    }
    return tivlyLogo;
  });
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);

  const fetchBranding = useCallback(async () => {
    if (!companyId || !isEnterprise) {
      setLogoUrl(tivlyLogo);
      setWorkspaceName(null);
      localStorage.removeItem(CACHE_KEY);
      return;
    }

    try {
      const res = await getEnterpriseSettings(companyId);
      const branding = res.settings?.adminWorkspace?.branding;
      const logo = branding?.logoUrl || tivlyLogo;
      const name = branding?.workspaceDisplayName || null;
      setLogoUrl(logo);
      setWorkspaceName(name);

      localStorage.setItem(CACHE_KEY, JSON.stringify({
        logoUrl: branding?.logoUrl || null,
        workspaceName: name,
        companyId,
      }));
    } catch {
      // If user doesn't have admin access, try cached values
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const data = JSON.parse(cached);
          if (data.companyId === companyId) {
            if (data.logoUrl) setLogoUrl(data.logoUrl);
            if (data.workspaceName) setWorkspaceName(data.workspaceName);
            return;
          }
        }
      } catch {}
    }
  }, [companyId, isEnterprise]);

  useEffect(() => { fetchBranding(); }, [fetchBranding]);

  // Reset when not enterprise
  useEffect(() => {
    if (!isEnterprise) {
      setLogoUrl(tivlyLogo);
      setWorkspaceName(null);
    }
  }, [isEnterprise]);

  return (
    <EnterpriseBrandingContext.Provider value={{
      logoUrl: isEnterprise ? logoUrl : tivlyLogo,
      workspaceName,
      isEnterprise,
      refreshBranding: fetchBranding,
    }}>
      {children}
    </EnterpriseBrandingContext.Provider>
  );
}

export const useEnterpriseBranding = () => useContext(EnterpriseBrandingContext);
