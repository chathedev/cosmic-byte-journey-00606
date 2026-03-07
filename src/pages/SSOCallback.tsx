import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { exchangeSSOSession } from '@/lib/enterpriseDomainApi';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

export default function SSOCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const sessionToken = searchParams.get('session_token') || searchParams.get('token');
    if (!sessionToken) {
      setError('Ingen SSO-session hittades. Försök logga in igen.');
      return;
    }

    (async () => {
      try {
        const result = await exchangeSSOSession(sessionToken);
        if (result.token) {
          apiClient.applyAuthToken(result.token);
          setSuccess(true);
          await refreshUser();
          const target = result.redirectTarget || '/';
          setTimeout(() => navigate(target, { replace: true }), 600);
        } else {
          setError('SSO-inloggning misslyckades. Inget token mottaget.');
        }
      } catch (err: any) {
        console.error('[SSOCallback] Exchange failed:', err);
        setError(err.message || 'SSO-inloggning misslyckades. Försök igen.');
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
              <AlertCircle className="w-6 h-6 text-destructive" />
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
