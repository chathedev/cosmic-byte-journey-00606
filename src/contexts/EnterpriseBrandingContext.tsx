import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useSubscription } from './SubscriptionContext';
import { getEnterpriseSettings } from '@/lib/enterpriseSettingsApi';
import tivlyLogo from '@/assets/tivly-logo.png';

interface EnterpriseBranding {
  logoUrl: string;
  wordmarkUrl: string | null;
  faviconUrl: string | null;
  workspaceName: string | null;
  isEnterprise: boolean;
  brandingReady: boolean;
  refreshBranding: () => Promise<void>;
}

const CACHE_KEY = 'tivly_enterprise_branding';

function readCache(): {
  logoUrl: string | null;
  wordmarkUrl: string | null;
  faviconUrl: string | null;
  workspaceName: string | null;
  companyId: string | null;
} | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

const EnterpriseBrandingContext = createContext<EnterpriseBranding>({
  logoUrl: tivlyLogo,
  wordmarkUrl: null,
  faviconUrl: null,
  workspaceName: null,
  isEnterprise: false,
  brandingReady: false,
  refreshBranding: async () => {},
});

/** Apply favicon to <head> */
function applyFavicon(url: string) {
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  if (link.href !== url) link.href = url;

  // Also update apple-touch-icon if present
  const apple = document.querySelector<HTMLLinkElement>("link[rel='apple-touch-icon']");
  if (apple && apple.href !== url) apple.href = url;
}

/** Apply page title from workspace name */
function applyTitle(name: string | null) {
  document.title = name ? `Dashboard - ${name}` : 'Dashboard - Tivly';
}

const DEFAULT_FAVICON = '/favicon.png';

export function EnterpriseBrandingProvider({ children }: { children: ReactNode }) {
  const { enterpriseMembership, userPlan } = useSubscription();
  const isEnterprise = userPlan?.plan === 'enterprise' || enterpriseMembership?.isMember === true;
  const companyId = enterpriseMembership?.company?.id;

  // Initialize from cache unconditionally to prevent flash
  // (companyId may not be available yet on first render)
  const cached = readCache();
  const hasCachedBranding = cached && cached.logoUrl;

  const [logoUrl, setLogoUrl] = useState<string>(
    () => (hasCachedBranding && cached.logoUrl) ? cached.logoUrl : tivlyLogo
  );
  const [wordmarkUrl, setWordmarkUrl] = useState<string | null>(
    () => (hasCachedBranding && cached.wordmarkUrl) || null
  );
  const [faviconUrl, setFaviconUrl] = useState<string | null>(
    () => (hasCachedBranding && cached.faviconUrl) || null
  );
  const [workspaceName, setWorkspaceName] = useState<string | null>(
    () => (hasCachedBranding && cached.workspaceName) || null
  );
  const [brandingReady, setBrandingReady] = useState(false);
  const [cachedCompanyId] = useState(() => cached?.companyId || null);

  // Apply favicon + title on mount from cache immediately (no flash)
  useEffect(() => {
    if (hasCachedBranding) {
      if (cached.faviconUrl) applyFavicon(cached.faviconUrl);
      applyTitle(cached.workspaceName || null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchBranding = useCallback(async () => {
    if (!companyId || !isEnterprise) {
      setLogoUrl(tivlyLogo);
      setWordmarkUrl(null);
      setFaviconUrl(null);
      setWorkspaceName(null);
      applyFavicon(DEFAULT_FAVICON);
      applyTitle(null);
      localStorage.removeItem(CACHE_KEY);
      setBrandingReady(true);
      return;
    }

    try {
      const res = await getEnterpriseSettings(companyId);
      const branding = res.settings?.adminWorkspace?.branding;
      const logo = branding?.logoUrl || tivlyLogo;
      const wordmark = (branding as any)?.wordmarkUrl || null;
      const favicon = (branding as any)?.faviconUrl || null;
      const name = branding?.workspaceDisplayName || null;

      setLogoUrl(logo);
      setWordmarkUrl(wordmark);
      setFaviconUrl(favicon);
      setWorkspaceName(name);

      // Apply favicon and title immediately
      applyFavicon(favicon || DEFAULT_FAVICON);
      applyTitle(name);

      localStorage.setItem(CACHE_KEY, JSON.stringify({
        logoUrl: branding?.logoUrl || null,
        wordmarkUrl: wordmark,
        faviconUrl: favicon,
        workspaceName: name,
        companyId,
      }));
    } catch {
      // Fall back to cache
      try {
        const c = readCache();
        if (c && c.companyId === companyId) {
          if (c.logoUrl) setLogoUrl(c.logoUrl);
          if (c.wordmarkUrl) setWordmarkUrl(c.wordmarkUrl);
          if (c.faviconUrl) {
            setFaviconUrl(c.faviconUrl);
            applyFavicon(c.faviconUrl);
          }
          if (c.workspaceName) {
            setWorkspaceName(c.workspaceName);
            applyTitle(c.workspaceName);
          }
        }
      } catch {}
    }
    setBrandingReady(true);
  }, [companyId, isEnterprise]);

  useEffect(() => { fetchBranding(); }, [fetchBranding]);

  // Reset when not enterprise
  useEffect(() => {
    if (!isEnterprise) {
      setLogoUrl(tivlyLogo);
      setWordmarkUrl(null);
      setFaviconUrl(null);
      setWorkspaceName(null);
      applyFavicon(DEFAULT_FAVICON);
      applyTitle(null);
    }
  }, [isEnterprise]);

  // Sync favicon/title whenever they change
  useEffect(() => {
    if (isEnterprise && faviconUrl) applyFavicon(faviconUrl);
  }, [isEnterprise, faviconUrl]);

  useEffect(() => {
    if (isEnterprise) applyTitle(workspaceName);
  }, [isEnterprise, workspaceName]);

  return (
    <EnterpriseBrandingContext.Provider value={{
      logoUrl: isEnterprise ? logoUrl : tivlyLogo,
      wordmarkUrl: isEnterprise ? wordmarkUrl : null,
      faviconUrl: isEnterprise ? faviconUrl : null,
      workspaceName: isEnterprise ? workspaceName : null,
      isEnterprise,
      brandingReady,
      refreshBranding: fetchBranding,
    }}>
      {children}
    </EnterpriseBrandingContext.Provider>
  );
}

export const useEnterpriseBranding = () => useContext(EnterpriseBrandingContext);
