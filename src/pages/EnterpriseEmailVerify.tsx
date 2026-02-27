import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

const API_BASE_URL = 'https://api.tivly.se';

export default function EnterpriseEmailVerify() {
  const [params] = useSearchParams();
  const [state, setState] = useState<'loading' | 'verified' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const draftId = params.get('draftId');
    const token = params.get('token');

    if (!draftId || !token) {
      setState('error');
      setMessage('Ogiltig verifieringslänk.');
      return;
    }

    fetch(`${API_BASE_URL}/enterprise/onboarding/verify-email/verify?draftId=${encodeURIComponent(draftId)}&token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (res.ok) {
          setState('verified');
        } else {
          const body = await res.json().catch(() => ({}));
          setState('error');
          setMessage(body.message || body.error || 'Verifieringen misslyckades.');
        }
      })
      .catch(() => {
        setState('error');
        setMessage('Kunde inte nå servern. Försök igen.');
      });
  }, [params]);

  // Auto-close countdown after verification
  useEffect(() => {
    if (state !== 'verified') return;
    if (countdown <= 0) {
      window.close();
      // Fallback if window.close() is blocked
      return;
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [state, countdown]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-sm w-full text-center space-y-6">
        {state === 'loading' && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">Verifierar din e-post…</p>
          </>
        )}

        {state === 'verified' && (
          <>
            <div className="h-16 w-16 mx-auto border-2 border-primary/20 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h1 className="text-lg font-semibold text-foreground">E-post verifierad</h1>
              <p className="text-sm text-muted-foreground">
                Du kan stänga den här sidan och gå tillbaka till onboarding-flödet.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Sidan stängs automatiskt om {countdown}s…
            </p>
          </>
        )}

        {state === 'error' && (
          <>
            <div className="h-16 w-16 mx-auto border-2 border-destructive/20 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <div className="space-y-2">
              <h1 className="text-lg font-semibold text-foreground">Verifiering misslyckades</h1>
              <p className="text-sm text-muted-foreground">{message}</p>
            </div>
          </>
        )}

        <p className="text-[11px] text-muted-foreground">© {new Date().getFullYear()} Tivly AB</p>
      </div>
    </div>
  );
}
