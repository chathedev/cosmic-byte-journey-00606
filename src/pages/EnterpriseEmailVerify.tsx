import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE_URL = 'https://api.tivly.se';

export default function EnterpriseEmailVerify() {
  const [params] = useSearchParams();
  const [state, setState] = useState<'loading' | 'verified' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const draftId = params.get('draftId');
    const token = params.get('token');

    if (!draftId || !token) {
      setState('error');
      setMessage('Ogiltig verifieringslänk.');
      return;
    }

    // Use POST /verify-email/complete as per new backend contract
    fetch(`${API_BASE_URL}/enterprise/onboarding/verify-email/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ draftId, token }),
    })
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

  // Fast auto-close after verification
  useEffect(() => {
    if (state !== 'verified') return;
    if (countdown <= 0) {
      window.close();
      return;
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [state, countdown]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-sm w-full text-center space-y-6">
        <AnimatePresence mode="wait">
          {state === 'loading' && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">Verifierar din e-post…</p>
            </motion.div>
          )}

          {state === 'verified' && (
            <motion.div key="verified" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="space-y-5">
              <div className="h-16 w-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-1">
                <h1 className="text-lg font-semibold text-foreground">E-post verifierad</h1>
                <p className="text-sm text-muted-foreground">
                  Gå tillbaka till onboarding-fliken.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Stängs om {countdown}s…
              </p>
            </motion.div>
          )}

          {state === 'error' && (
            <motion.div key="error" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="space-y-5">
              <div className="h-16 w-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <div className="space-y-1">
                <h1 className="text-lg font-semibold text-foreground">Verifiering misslyckades</h1>
                <p className="text-sm text-muted-foreground">{message}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-[11px] text-muted-foreground">© {new Date().getFullYear()} Tivly AB</p>
      </div>
    </div>
  );
}
