import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { startSSOLogin, type PublicWorkspaceInfo } from '@/lib/enterpriseDomainApi';

const MicrosoftIcon = () => (
  <svg width="18" height="18" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
    <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
    <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
    <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
  </svg>
);

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 019.5 24c0-1.59.28-3.14.76-4.59l-7.98-6.19A23.99 23.99 0 000 24c0 3.77.9 7.35 2.56 10.54l7.97-5.95z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 5.95C6.51 42.62 14.62 48 24 48z"/>
  </svg>
);

const OktaIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="#007DC1" strokeWidth="2.5" fill="none"/>
    <circle cx="12" cy="12" r="4" fill="#007DC1"/>
  </svg>
);

const SSOIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

const PROVIDER_META: Record<string, { label: string; icon: () => JSX.Element; bgHover: string }> = {
  microsoft: { label: 'Microsoft', icon: MicrosoftIcon, bgHover: 'hover:bg-[#f3f3f3] dark:hover:bg-[#2b2b2b]' },
  google: { label: 'Google', icon: GoogleIcon, bgHover: 'hover:bg-[#f8f9fa] dark:hover:bg-[#2b2b2b]' },
  okta: { label: 'Okta', icon: OktaIcon, bgHover: 'hover:bg-[#f0f8ff] dark:hover:bg-[#1a2a3a]' },
  oidc: { label: 'SSO', icon: SSOIcon, bgHover: 'hover:bg-muted' },
  saml: { label: 'SSO', icon: SSOIcon, bgHover: 'hover:bg-muted' },
};

interface Props {
  workspace: PublicWorkspaceInfo;
}

export function EnterpriseSSOLogin({ workspace }: Props) {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Accept providers from allowedProviders or fall back to primaryProvider
  let providers = workspace.allowedProviders?.filter(p => p && p !== 'email') || [];
  
  // If no allowedProviders but primaryProvider exists, use that
  if (providers.length === 0 && workspace.primaryProvider && workspace.primaryProvider !== 'email') {
    providers = [workspace.primaryProvider];
  }

  const primaryProvider = workspace.primaryProvider;

  // Sort: primary first
  const sorted = [...providers].sort((a, b) => {
    if (a === primaryProvider) return -1;
    if (b === primaryProvider) return 1;
    return 0;
  });

  const handleSSOLogin = async (provider: string) => {
    setError(null);
    setLoadingProvider(provider);
    try {
      const redirect = window.location.origin + '/auth/sso/callback';
      const result = await startSSOLogin(workspace.companyId, provider, redirect);
      if (result.authorizationUrl) {
        window.location.href = result.authorizationUrl;
      } else {
        setError('Kunde inte starta SSO-inloggning.');
        setLoadingProvider(null);
      }
    } catch (err: any) {
      console.error('[EnterpriseSSOLogin] Failed:', err);
      setError(err.message || 'SSO-inloggning misslyckades.');
      setLoadingProvider(null);
    }
  };

  if (sorted.length === 0) return null;

  return (
    <div className="space-y-3">
      {sorted.map(provider => {
        const meta = PROVIDER_META[provider] || PROVIDER_META.oidc;
        const isLoading = loadingProvider === provider;
        const Icon = meta.icon;

        return (
          <Button
            key={provider}
            variant="outline"
            onClick={() => handleSSOLogin(provider)}
            disabled={!!loadingProvider}
            className={`w-full h-12 rounded-lg text-sm font-medium gap-3 border-border ${meta.bgHover} transition-all duration-150`}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Icon />
            )}
            Logga in med {meta.label}
          </Button>
        );
      })}

      {error && (
        <p className="text-xs text-destructive text-center pt-1">{error}</p>
      )}
    </div>
  );
}
