import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle, CheckCircle2, Shield } from 'lucide-react';
import { exchangeSSOSession } from '@/lib/enterpriseDomainApi';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

const ERROR_MESSAGES: Record<string, string> = {
  enterprise_sso_member_not_provisioned: 'Ditt konto har inte provisionerats för den här arbetsytan. Kontakta din organisations ägare eller administratör för att bli inbjuden, eller be dem aktivera Just-in-Time-provisionering.',
  enterprise_sso_required: 'Din organisation kräver SSO-inloggning.',
  enterprise_sso_domain_restriction: 'Din e-postdomän är inte godkänd för denna arbetsyta.',
  enterprise_sso_disabled: 'SSO är inte aktiverat för denna arbetsyta.',
  enterprise_sso_provider_not_ready: 'SSO-providern är inte korrekt konfigurerad. Kontakta din administratör.',
  session_expired: 'SSO-sessionen har gått ut. Försök logga in igen.',
  enterprise_sso_callback_failed: 'SSO-inloggning misslyckades i callback-steget. Försök igen.',
  invalid_session: 'SSO-sessionen har gått ut. Försök logga in igen.',
};

const SSO_TOKEN_KEYS = ['sessionToken', 'enterpriseSsoSession', 'ssoSession', 'session_token', 'token'] as const;

function readParam(searchParams: URLSearchParams, key: string): string | null {
  const value = searchParams.get(key);
  return value && value.trim() ? value.trim() : null;
}

function readSessionToken(searchParams: URLSearchParams): string | null {
  for (const key of SSO_TOKEN_KEYS) {
    const fromRouter = readParam(searchParams, key);
    if (fromRouter) return fromRouter;
  }

  const rawParams = new URLSearchParams(window.location.search);
  for (const key of SSO_TOKEN_KEYS) {
    const fromRaw = readParam(rawParams, key);
    if (fromRaw) return fromRaw;
  }

  const rawHash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const hashParams = new URLSearchParams(rawHash.startsWith('?') ? rawHash.slice(1) : rawHash);
  for (const key of SSO_TOKEN_KEYS) {
    const fromHash = readParam(hashParams, key);
    if (fromHash) return fromHash;
  }

  return null;
}

export default function SSOCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const sessionToken = readSessionToken(searchParams);
    const errorParam = searchParams.get('error');

    // Only show direct error when no session token alias exists (backend can include token even on failure)
    if (errorParam && !sessionToken) {
      const msg = ERROR_MESSAGES[errorParam] || searchParams.get('error_description') || 'SSO-inloggning misslyckades.';
      setError(msg);
      setErrorCode(errorParam);
      return;
    }

    if (!sessionToken) {
      setError('Ingen SSO-session hittades. Försök logga in igen.');
      return;
    }

    (async () => {
      try {
        const result = await exchangeSSOSession(sessionToken);
        const typedResult = result as any;

        if (typedResult.token) {
          apiClient.applyAuthToken(typedResult.token);
          setSuccess(true);
          await refreshUser();
          const target = typedResult.redirectTarget || '/';
          setTimeout(() => navigate(target, { replace: true }), 600);
          return;
        }

        if (typedResult.error || typedResult.code) {
          const code = typedResult.error || typedResult.code;
          setErrorCode(code);
          setError(ERROR_MESSAGES[code] || typedResult.message || 'SSO-inloggning misslyckades.');
          return;
        }

        setError('SSO-inloggning misslyckades. Inget token mottaget.');
      } catch (err: any) {
        console.error('[SSOCallback] Exchange failed:', err);
        const code = err.code || err.error || '';
        setErrorCode(code);
        setError(ERROR_MESSAGES[code] || err.message || 'SSO-inloggning misslyckades. Försök igen.');
      }
    })();
  }, []);

  return (
    <div className="min-h-[100svh] bg-background flex items-center justify-center p-5">
      <div className="w-full max-w-sm text-center space-y-4">
        {!error && !success && (
          <>
            <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Slutför SSO-inloggning…</p>
          </>
        )}
        {success && (
          <>
            <CheckCircle2 className="w-10 h-10 text-primary mx-auto" />
            <p className="text-sm font-medium text-foreground">Inloggad! Omdirigerar…</p>
          </>
        )}
        {error && (
          <>
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              {errorCode === 'enterprise_sso_member_not_provisioned' ? (
                <Shield className="w-6 h-6 text-destructive" />
              ) : (
                <AlertCircle className="w-6 h-6 text-destructive" />
              )}
            </div>
            <p className="text-sm text-destructive font-medium">{error}</p>
            <button
              onClick={() => navigate('/auth', { replace: true })}
              className="text-sm text-primary hover:text-primary/80 transition-colors"
            >
              Tillbaka till inloggning
            </button>
          </>
        )}
      </div>
    </div>
  );
}

