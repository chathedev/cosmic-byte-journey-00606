import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import tivlyLogo from '@/assets/tivly-logo.png';
import { getRedirectDomain } from '@/utils/environment';

type State = 'verifying' | 'success' | 'error' | 'invalid';

const MagicLogin = () => {
  const [searchParams] = useSearchParams();
  const { refreshUser } = useAuth();
  const [state, setState] = useState<State>('verifying');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const verify = async () => {
      const token = searchParams.get('token');
      const returnUrl = searchParams.get('return');

      if (!token) {
        setState('invalid');
        setErrorMessage('Ingen verifieringstoken hittades i länken.');
        return;
      }

      try {
        const response = await apiClient.verifyMagicLink(token);
        setState('success');

        // Refresh auth context
        try { await refreshUser(); } catch {}

        // Redirect instantly — no delay
        const target = returnUrl || getRedirectDomain();
        const url = response.token
          ? `${target}${target.includes('?') ? '&' : '?'}token=${encodeURIComponent(response.token)}`
          : target;

        window.location.replace(url);
      } catch (error: any) {
        setState('error');
        const msg = error?.message || '';
        if (msg.includes('invalid_token') || msg.includes('token_not_found')) {
          setErrorMessage('Länken är ogiltig eller har redan använts.');
        } else if (msg.includes('expired')) {
          setErrorMessage('Länken har gått ut. Begär en ny.');
        } else if (msg.includes('Failed to fetch')) {
          setErrorMessage('Nätverksfel. Kontrollera din anslutning och försök igen.');
        } else {
          setErrorMessage(msg || 'Verifiering misslyckades.');
        }
      }
    };

    verify();
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-xs text-center space-y-6">
        {/* Logo */}
        <img src={tivlyLogo} alt="Tivly" className="w-12 h-12 mx-auto" />

        {/* Verifying */}
        {state === 'verifying' && (
          <div className="space-y-3 animate-in fade-in duration-200">
            <Loader2 className="h-8 w-8 mx-auto text-muted-foreground animate-spin" />
            <p className="text-sm text-muted-foreground">Verifierar länken…</p>
          </div>
        )}

        {/* Success — shown briefly before redirect */}
        {state === 'success' && (
          <div className="space-y-3 animate-in fade-in duration-150">
            <CheckCircle2 className="h-8 w-8 mx-auto text-primary" />
            <p className="text-sm text-foreground font-medium">Verifierad</p>
            <p className="text-xs text-muted-foreground">Omdirigerar…</p>
          </div>
        )}

        {/* Error */}
        {(state === 'error' || state === 'invalid') && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <XCircle className="h-8 w-8 mx-auto text-destructive" />
            <p className="text-sm text-destructive font-medium">{errorMessage}</p>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.replace(getRedirectDomain())}
              >
                Gå till appen
              </Button>
              <a
                href="mailto:support@tivly.se"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Kontakta support
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MagicLogin;
