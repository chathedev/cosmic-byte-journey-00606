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

/**
 * Extract all query/hash params from the full raw URL.
 * Handles edge cases where the URL path is doubled (e.g. /auth/sso/callback/https://host/auth/sso/callback?token=...).
 */
function getAllSearchParams(): URLSearchParams {
  const fullUrl = window.location.href;
  const params = new URLSearchParams();

  // 1. Normal query string
  const qIdx = fullUrl.indexOf('?');
  if (qIdx !== -1) {
    const hashIdx = fullUrl.indexOf('#', qIdx);
    const qString = hashIdx !== -1 ? fullUrl.slice(qIdx + 1, hashIdx) : fullUrl.slice(qIdx + 1);
    new URLSearchParams(qString).forEach((v, k) => { if (!params.has(k)) params.set(k, v); });
  }

  // 2. Hash fragment params
  const hIdx = fullUrl.indexOf('#');
  if (hIdx !== -1) {
    let raw = fullUrl.slice(hIdx + 1);
    if (raw.startsWith('?')) raw = raw.slice(1);
    // Could also contain a nested ? from doubled URLs
    const nestedQ = raw.indexOf('?');
    if (nestedQ !== -1) {
      new URLSearchParams(raw.slice(nestedQ + 1)).forEach((v, k) => { if (!params.has(k)) params.set(k, v); });
    }
    new URLSearchParams(raw.split('?')[0]).forEach((v, k) => { if (!params.has(k)) params.set(k, v); });
  }

  // 3. Handle doubled-path URLs: look for a second '?' in the full path portion
  const pathPortion = qIdx !== -1 ? fullUrl.slice(0, qIdx) : (hIdx !== -1 ? fullUrl.slice(0, hIdx) : fullUrl);
  // Check if path contains an embedded URL with its own query string (doubled callback)
  const embeddedMatch = pathPortion.match(/\/auth\/sso\/callback.*\/auth\/sso\/callback/);
  if (embeddedMatch) {
    console.warn('[SSOCallback] Detected doubled callback URL, extracting params from full URL');
  }

  return params;
}

function readSessionToken(searchParams: URLSearchParams): string | null {
  // Try react-router params first
  for (const key of SSO_TOKEN_KEYS) {
    const fromRouter = readParam(searchParams, key);
    if (fromRouter) return fromRouter;
  }

  // Try raw window params (handles doubled URLs etc.)
  const rawParams = getAllSearchParams();
  for (const key of SSO_TOKEN_KEYS) {
    const fromRaw = readParam(rawParams, key);
    if (fromRaw) return fromRaw;
  }

  return null;
}

type RedirectDecision = { kind: 'navigate'; path: string } | { kind: 'location'; url: string };

function resolvePostLoginRedirect(rawTarget: unknown): RedirectDecision {
  const fallback: RedirectDecision = { kind: 'navigate', path: '/' };

  if (typeof rawTarget !== 'string') return fallback;
  const target = rawTarget.trim();
  if (!target) return fallback;

  if (target.includes('/auth/sso/callback')) return fallback;

  if (/^https?:\/\//i.test(target)) {
    try {
      const url = new URL(target);
      const isAllowedHost =
        url.hostname === window.location.hostname ||
        url.hostname.endsWith('tivly.se') ||
        url.hostname.endsWith('.lovableproject.com');

      if (!isAllowedHost || url.pathname.startsWith('/auth/sso/callback')) {
        return fallback;
      }

      if (url.origin === window.location.origin) {
        return { kind: 'navigate', path: `${url.pathname}${url.search}${url.hash}` || '/' };
      }

      return { kind: 'location', url: url.toString() };
    } catch {
      return fallback;
    }
  }

  const normalizedPath = target.startsWith('/') ? target : `/${target}`;
  if (normalizedPath.startsWith('/auth/sso/callback')) return fallback;

  return { kind: 'navigate', path: normalizedPath };
}

export default function SSOCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    console.log('[SSOCallback] URL:', window.location.href);
    console.log('[SSOCallback] pathname:', window.location.pathname);
    console.log('[SSOCallback] search:', window.location.search);
    console.log('[SSOCallback] hash:', window.location.hash);

    const sessionToken = readSessionToken(searchParams);
    const errorParam = searchParams.get('error') || getAllSearchParams().get('error');

    // Only show direct error when no session token alias exists
    if (errorParam && !sessionToken) {
      const msg = ERROR_MESSAGES[errorParam] || searchParams.get('error_description') || getAllSearchParams().get('error_description') || 'SSO-inloggning misslyckades.';
      setError(msg);
      setErrorCode(errorParam);
      return;
    }

    if (!sessionToken) {
      if (apiClient.isAuthenticated()) {
        console.warn('[SSOCallback] Missing session token, but auth token exists. Redirecting home.');
        setSuccess(true);
        setTimeout(() => navigate('/', { replace: true }), 250);
        return;
      }

      console.error('[SSOCallback] No session token found in URL');
      setError('Ingen SSO-session hittades. Försök logga in igen.');
      return;
    }

    console.log('[SSOCallback] Found session token, exchanging...');

    (async () => {
      try {
        const result = await exchangeSSOSession(sessionToken);
        const typedResult = result as any;
        console.log('[SSOCallback] Exchange result keys:', Object.keys(typedResult));

        if (typedResult.token) {
          apiClient.applyAuthToken(typedResult.token);
          setSuccess(true);
          await refreshUser();
          // Always navigate to root on custom domains; use redirectTarget on generic domain
          const target = typedResult.redirectTarget || '/';
          console.log('[SSOCallback] Redirecting to:', target);
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

