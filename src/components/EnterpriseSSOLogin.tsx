import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { startSSOLogin, type PublicWorkspaceInfo } from '@/lib/enterpriseDomainApi';

const PROVIDER_META: Record<string, { label: string; icon: string; color: string }> = {
  microsoft: { label: 'Microsoft', icon: '🪟', color: 'hover:bg-[#00a4ef]/10' },
  google: { label: 'Google', icon: '🔵', color: 'hover:bg-[#4285f4]/10' },
  okta: { label: 'Okta', icon: '🔒', color: 'hover:bg-[#007dc1]/10' },
  oidc: { label: 'SSO (OIDC)', icon: '🔐', color: 'hover:bg-muted' },
  saml: { label: 'SSO (SAML)', icon: '🔐', color: 'hover:bg-muted' },
};

interface Props {
  workspace: PublicWorkspaceInfo;
}

export function EnterpriseSSOLogin({ workspace }: Props) {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const providers = workspace.allowedProviders?.filter(p => p && p !== 'email') || [];
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
        const meta = PROVIDER_META[provider] || { label: provider, icon: '🔐', color: 'hover:bg-muted' };
        const isLoading = loadingProvider === provider;

        return (
          <Button
            key={provider}
            variant="outline"
            onClick={() => handleSSOLogin(provider)}
            disabled={!!loadingProvider}
            className={`w-full h-11 rounded-lg text-sm font-medium gap-2.5 border-border ${meta.color} transition-colors`}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <span className="text-base">{meta.icon}</span>
            )}
            Logga in med {meta.label}
          </Button>
        );
      })}

      {error && (
        <p className="text-xs text-destructive text-center">{error}</p>
      )}
    </div>
  );
}
