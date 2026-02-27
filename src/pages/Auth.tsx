import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AlertCircle, Loader2, CheckCircle2, ArrowLeft, ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { apiClient } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import NoAppAccessScreen from '@/components/NoAppAccessScreen';

declare global {
  interface Window {
    authToken?: string;
  }
}

type ViewMode = 'email' | 'code-entry' | 'no-access';

function sanitizeEmail(email: string | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return trimmed && emailRegex.test(trimmed) ? trimmed : null;
}

function isAppDomain(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.includes('app.tivly.se');
}

function isIoDomain(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.includes('io.tivly.se');
}

function getAuthBaseUrl(): string {
  return 'https://api.tivly.se';
}

function hasAppAccess(userData: any): boolean {
  if (!userData) return false;
  if (userData.isAdmin === true) return true;
  if (userData.role === 'admin' || userData.role === 'owner') return true;
  if (Array.isArray(userData.roles)) {
    if (userData.roles.includes('admin') || userData.roles.includes('owner')) return true;
  }
  const planType = typeof userData.plan === 'string' ? userData.plan : userData.plan?.plan;
  if (planType?.toLowerCase() === 'enterprise') return true;
  if (userData.enterprise?.active || userData.enterprise?.companyName) return true;
  if (userData.company?.planTier === 'enterprise') return true;
  return false;
}

export default function Auth() {
  const navigate = useNavigate();
  const { user, isLoading, refreshUser } = useAuth();

  const [email, setEmail] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('email');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [codeExpiry, setCodeExpiry] = useState<number>(600);
  const [platform, setPlatform] = useState<'ios' | 'web'>('web');
  const [codeSent, setCodeSent] = useState(false);
  const verifyingRef = useRef(false);
  const [isSignup, setIsSignup] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    const isIosDomain = window.location.hostname === 'io.tivly.se';
    const isIosDevice = /iPhone|iPad|iPod/.test(navigator.userAgent);
    setPlatform(isIosDomain || isIosDevice ? 'ios' : 'web');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const viewport = window.visualViewport;
    const updateViewport = () => {
      const nextHeight = Math.round(viewport?.height ?? window.innerHeight);
      setViewportHeight(nextHeight);

      const keyboardDelta = window.innerHeight - nextHeight;
      setIsKeyboardOpen(keyboardDelta > 140);
    };

    updateViewport();
    viewport?.addEventListener('resize', updateViewport);
    viewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('orientationchange', updateViewport);

    return () => {
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
    };
  }, []);

  useEffect(() => {
    if (!isLoading && user && !isNavigating) {
      setIsNavigating(true);
      const urlParams = new URLSearchParams(window.location.search);
      const redirectUrl = urlParams.get('redirect');
      if (redirectUrl) {
        try {
          const url = new URL(redirectUrl);
          if (url.hostname.endsWith('tivly.se') || url.hostname.endsWith('.lovableproject.com')) {
            const token = apiClient.getAuthToken();
            if (token) {
              url.searchParams.set('authToken', token);
              window.location.href = url.toString();
              return;
            }
          }
        } catch (e) {
          console.error('[Auth] Invalid redirect URL:', redirectUrl);
        }
      }
      navigate('/', { replace: true });
    }
  }, [user, isLoading, navigate, isNavigating]);

  useEffect(() => {
    if (viewMode !== 'code-entry' || !codeSent) return;
    const timer = setInterval(() => {
      setCodeExpiry((prev) => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [viewMode, codeSent]);

  useEffect(() => {
    if (pinCode.length === 6 && /^\d{6}$/.test(pinCode) && !verifyingRef.current && !verifying) {
      handleVerifyPin();
    }
  }, [pinCode]);

  const handleRequestCode = async () => {
    const sanitized = sanitizeEmail(email);
    setAuthError(null);
    if (!sanitized) { setAuthError('Ange en giltig e-postadress.'); return; }
    if (sanitized === 'demo@tivly.se') {
      setLoading(true);
      const demoToken = 'demo-token-' + Date.now();
      const demoUser = {
        id: 'demo-user-id', uid: 'demo-user-id', email: 'demo@tivly.se',
        displayName: 'Demo User', emailVerified: true,
        plan: { plan: 'enterprise', type: 'enterprise', meetingsUsed: 5, meetingsLimit: null, protocolsUsed: 12, protocolsLimit: null },
        enterprise: { active: true, companyName: 'Demo Enterprise AB' }
      };
      localStorage.setItem('authToken', demoToken);
      localStorage.setItem('demoUser', JSON.stringify(demoUser));
      await new Promise(resolve => setTimeout(resolve, 500));
      setIsNavigating(true);
      await refreshUser();
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(`${getAuthBaseUrl()}/auth/totp/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: sanitized }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (response.ok) {
        setCodeExpiry(600);
        setCodeSent(true);
        setViewMode('code-entry');
        setPinCode('');
      } else {
        setAuthError('Kunde inte skicka verifieringskod. Försök igen.');
      }
    } catch {
      setAuthError('Nätverksfel. Kontrollera din uppkoppling.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => { setAuthError(null); setPinCode(''); await handleRequestCode(); };

  const handleVerifyPin = async () => {
    if (pinCode.length !== 6 || !/^\d{6}$/.test(pinCode) || verifyingRef.current) return;
    const sanitized = sanitizeEmail(email);
    if (!sanitized) return;
    verifyingRef.current = true;
    setVerifying(true);
    setAuthError(null);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(`${getAuthBaseUrl()}/auth/totp/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: sanitized, token: pinCode }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const responseText = await response.text().catch(() => '');
      if (response.ok) {
        let userData = null;
        if (responseText && responseText.trim().length > 0) {
          try {
            const data = JSON.parse(responseText);
            userData = data.user;
            if (data.token) apiClient.applyAuthToken(data.token);
          } catch { /* cookie-based auth */ }
        }
        if (isIoDomain()) {
          if (!userData) { try { userData = await apiClient.getMe(); } catch {} }
          if (!hasAppAccess(userData)) {
            setViewMode('no-access');
            setVerifying(false);
            verifyingRef.current = false;
            return;
          }
        }
        setIsNavigating(true);
        await refreshUser();
        return;
      }
      if (!responseText || responseText.trim() === '') {
        setAuthError('Fel kod. Försök igen.');
      } else {
        try {
          const error = JSON.parse(responseText);
          setAuthError(error.error || error.message || 'Fel kod. Försök igen.');
        } catch { setAuthError('Fel kod. Försök igen.'); }
      }
      setPinCode('');
    } catch {
      setAuthError('Nätverksfel. Försök igen.');
      setPinCode('');
    } finally {
      setVerifying(false);
      verifyingRef.current = false;
    }
  };

  const handleStartOver = () => { setViewMode('email'); setPinCode(''); setCodeExpiry(600); setCodeSent(false); setAuthError(null); };
  const formatTime = (seconds: number) => { const m = Math.floor(seconds / 60); const s = seconds % 60; return `${m}:${String(s).padStart(2, '0')}`; };

  if (viewMode === 'no-access') {
    return <NoAppAccessScreen onLogout={() => { setViewMode('email'); setEmail(''); setPinCode(''); }} />;
  }

  return (
    <div className="relative min-h-screen bg-background overflow-x-hidden flex flex-col" style={viewportHeight ? { height: `${viewportHeight}px` } : { minHeight: '100dvh' }}>
      <div
        className="absolute inset-0 pointer-events-none opacity-60"
        style={{
          backgroundImage:
            'linear-gradient(180deg, hsl(var(--primary) / 0.08) 0%, transparent 45%), radial-gradient(circle at 15% 20%, hsl(var(--accent) / 0.12), transparent 35%)',
        }}
      />

      <header className={`relative z-10 px-4 sm:px-6 pt-5 pb-3 ${isKeyboardOpen ? 'hidden sm:block' : ''}`}>
        <div className="max-w-md mx-auto flex items-center justify-between">
          <span className="text-[12px] font-semibold tracking-[0.26em] uppercase text-foreground/80">Tivly</span>
          <a
            href="/enterprise/onboarding"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Enterprise
          </a>
        </div>
      </header>

      <main className="relative z-10 flex-1 overflow-y-auto overscroll-contain touch-pan-y px-4 sm:px-6">
        <div className={`w-full max-w-5xl mx-auto min-h-full flex flex-col py-6 sm:py-10 lg:py-14 ${isKeyboardOpen ? 'justify-start' : 'justify-center'}`}>
          <AnimatePresence mode="wait">
            {viewMode === 'email' && (
              <motion.div
                key="email"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-xl lg:max-w-2xl mx-auto border border-border/70 bg-card shadow-xl shadow-primary/10 rounded-2xl p-6 sm:p-8 space-y-6"
              >
                <div className="space-y-1.5">
                  <h1 className="text-2xl sm:text-3xl font-bold text-card-foreground tracking-tight">
                    {isSignup ? 'Skapa konto' : 'Logga in'}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {isSignup
                      ? 'Ange e-post så skapar vi ditt konto direkt.'
                      : 'Vi skickar en engångskod till din e-post.'}
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      E-post
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="namn@foretag.se"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleRequestCode(); } }}
                      disabled={loading}
                      autoComplete="email"
                      autoFocus
                      className="h-12 text-base rounded-xl bg-background touch-manipulation"
                    />
                  </div>

                  <Button
                    onClick={handleRequestCode}
                    disabled={loading || !email.trim()}
                    className="w-full h-12 rounded-xl text-sm font-medium no-hover-lift"
                    type="button"
                  >
                    {loading ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Skickar...</>
                    ) : (
                      <>{isSignup ? 'Skapa konto' : 'Fortsätt'}<ArrowRight className="w-4 h-4 ml-2" /></>
                    )}
                  </Button>
                </div>

                <AnimatePresence>
                  {authError && (
                    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                      <div className="flex items-center gap-2 p-3 border border-destructive/20 rounded-xl bg-destructive/5">
                        <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                        <p className="text-xs text-destructive font-medium">{authError}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="pt-3 border-t border-border/60">
                  <p className="text-center text-xs text-muted-foreground">
                    {isSignup ? (
                      <>Har redan konto?{' '}<button onClick={() => setIsSignup(false)} className="text-foreground font-medium hover:text-primary transition-colors">Logga in</button></>
                    ) : (
                      <>Inget konto?{' '}<button onClick={() => setIsSignup(true)} className="text-foreground font-medium hover:text-primary transition-colors">Skapa gratis</button></>
                    )}
                  </p>
                </div>
              </motion.div>
            )}

            {viewMode === 'code-entry' && (
              <motion.div
                key="code-entry"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="w-full max-w-xl lg:max-w-2xl mx-auto border border-border/70 bg-card shadow-xl shadow-primary/10 rounded-2xl p-6 sm:p-8 space-y-6"
              >
                <div className="space-y-1.5">
                  <h1 className="text-2xl sm:text-3xl font-bold text-card-foreground tracking-tight">
                    {isNavigating ? 'Välkommen!' : verifying ? 'Verifierar' : 'Ange kod'}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {isNavigating ? 'Du loggas in...' : verifying ? 'Kontrollerar koden...' : (
                      <>Kod skickad till <span className="font-medium text-card-foreground">{email}</span></>
                    )}
                  </p>
                </div>

                <div className="flex justify-center py-1">
                  <InputOTP
                    maxLength={6}
                    value={pinCode}
                    onChange={(value) => { if (!verifying && !isNavigating) { setPinCode(value); setAuthError(null); } }}
                    disabled={verifying || isNavigating}
                    autoFocus
                  >
                    <InputOTPGroup className="gap-2">
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <InputOTPSlot
                          key={i}
                          index={i}
                          className="w-11 h-12 rounded-xl border-border text-base font-medium"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                <div className="text-center min-h-[24px]">
                  {verifying && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" />Verifierar
                    </span>
                  )}
                  {isNavigating && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-primary font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />Klar
                    </span>
                  )}
                  {!verifying && !isNavigating && codeExpiry > 0 && (
                    <p className="text-xs text-muted-foreground">Giltig i {formatTime(codeExpiry)}</p>
                  )}
                  {!verifying && !isNavigating && codeExpiry === 0 && (
                    <p className="text-xs text-destructive font-medium">Koden har gått ut</p>
                  )}
                </div>

                <AnimatePresence>
                  {authError && !verifying && (
                    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                      <div className="flex items-center gap-2 p-3 border border-destructive/20 rounded-xl bg-destructive/5">
                        <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                        <p className="text-xs text-destructive font-medium">{authError}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {!isNavigating && (
                  <div className="flex items-center justify-between pt-3 border-t border-border/60">
                    <button
                      onClick={handleStartOver}
                      disabled={verifying}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                    >
                      <ArrowLeft className="w-3 h-3" /> Ändra e-post
                    </button>
                    <button
                      onClick={handleResendCode}
                      disabled={verifying || loading}
                      className="text-xs font-medium text-primary hover:text-primary/70 transition-colors disabled:opacity-40"
                    >
                      {loading ? 'Skickar...' : 'Skicka ny kod'}
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <footer className="relative z-10 px-4 sm:px-6 pb-5 pt-3 hidden sm:block">
        <div className="max-w-md mx-auto flex items-center justify-between text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>GDPR</span>
            <span>ISO 27001</span>
            <span>Krypterad</span>
          </div>
          <p>© {new Date().getFullYear()} Tivly AB</p>
        </div>
      </footer>
    </div>
  );
}
