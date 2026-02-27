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

  useEffect(() => {
    const isIosDomain = window.location.hostname === 'io.tivly.se';
    const isIosDevice = /iPhone|iPad|iPod/.test(navigator.userAgent);
    setPlatform(isIosDomain || isIosDevice ? 'ios' : 'web');
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
    <div className="min-h-screen h-[100svh] bg-foreground flex flex-col overflow-x-hidden">
      {/* Top bar */}
      <div className="px-6 py-5 flex items-center justify-between">
        <span className="text-[13px] font-semibold tracking-[0.25em] uppercase text-background/80">Tivly</span>
        <a href="/enterprise/onboarding" className="text-[11px] text-background/40 hover:text-background/70 transition-colors">
          Enterprise →
        </a>
      </div>

      {/* Center content */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4">
        <div className="w-full max-w-[360px] mx-auto min-h-full flex flex-col justify-center py-6 sm:py-10">
          <AnimatePresence mode="wait">
            {/* EMAIL STEP */}
            {viewMode === 'email' && (
              <motion.div
                key="email"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-8"
              >
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold text-background tracking-tight">
                    {isSignup ? 'Skapa konto' : 'Logga in'}
                  </h1>
                  <p className="text-sm text-background/50">
                    {isSignup
                      ? 'Ange din e-post för att komma igång.'
                      : 'Vi skickar en engångskod till dig.'}
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-[11px] font-medium text-background/40 uppercase tracking-wider">
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
                      className="h-12 text-base bg-background/5 border-background/10 text-background placeholder:text-background/25 rounded-md focus:border-background/30 focus:ring-0 touch-manipulation"
                    />
                  </div>

                  <Button
                    onClick={handleRequestCode}
                    disabled={loading || !email.trim()}
                    className="w-full h-12 text-sm font-medium bg-background text-foreground hover:bg-background/90 rounded-md no-hover-lift"
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
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <div className="flex items-center gap-2 p-3 border border-destructive/30 rounded-md bg-destructive/10">
                        <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                        <p className="text-xs text-destructive font-medium">{authError}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="pt-4 border-t border-background/10">
                  <p className="text-center text-xs text-background/40">
                    {isSignup ? (
                      <>Har redan ett konto?{' '}<button onClick={() => setIsSignup(false)} className="text-background/70 font-medium hover:text-background transition-colors">Logga in</button></>
                    ) : (
                      <>Inget konto?{' '}<button onClick={() => setIsSignup(true)} className="text-background/70 font-medium hover:text-background transition-colors">Skapa gratis</button></>
                    )}
                  </p>
                </div>
              </motion.div>
            )}

            {/* CODE ENTRY STEP */}
            {viewMode === 'code-entry' && (
              <motion.div
                key="code-entry"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-8"
              >
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold text-background tracking-tight">
                    {isNavigating ? 'Välkommen' : verifying ? 'Verifierar' : 'Ange kod'}
                  </h1>
                  <p className="text-sm text-background/50">
                    {isNavigating ? 'Du loggas in...' : verifying ? 'Kontrollerar koden...' : (
                      <>Skickad till <span className="text-background/80">{email}</span></>
                    )}
                  </p>
                </div>

                <div className="flex justify-center">
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
                          className="w-12 h-14 rounded-md border-background/15 bg-background/5 text-background text-lg font-medium"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                <div className="text-center min-h-[24px]">
                  {verifying && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-background/50">
                      <Loader2 className="w-3 h-3 animate-spin" />Verifierar
                    </span>
                  )}
                  {isNavigating && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-background/70 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />Klar
                    </span>
                  )}
                  {!verifying && !isNavigating && codeExpiry > 0 && (
                    <p className="text-xs text-background/30">{formatTime(codeExpiry)}</p>
                  )}
                  {!verifying && !isNavigating && codeExpiry === 0 && (
                    <p className="text-xs text-destructive font-medium">Koden har gått ut</p>
                  )}
                </div>

                <AnimatePresence>
                  {authError && !verifying && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <div className="flex items-center gap-2 p-3 border border-destructive/30 rounded-md bg-destructive/10">
                        <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                        <p className="text-xs text-destructive font-medium">{authError}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {!isNavigating && (
                  <div className="flex items-center justify-between pt-4 border-t border-background/10">
                    <button
                      onClick={handleStartOver}
                      disabled={verifying}
                      className="flex items-center gap-1 text-xs text-background/40 hover:text-background/70 transition-colors disabled:opacity-40"
                    >
                      <ArrowLeft className="w-3 h-3" /> Ändra e-post
                    </button>
                    <button
                      onClick={handleResendCode}
                      disabled={verifying || loading}
                      className="text-xs font-medium text-background/60 hover:text-background transition-colors disabled:opacity-40"
                    >
                      {loading ? 'Skickar...' : 'Skicka ny kod'}
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-5 hidden sm:flex items-center justify-between">
        <div className="flex items-center gap-4 text-[10px] text-background/25">
          <span>GDPR</span>
          <span>ISO 27001</span>
          <span>Krypterad</span>
        </div>
        <p className="text-[10px] text-background/20">© {new Date().getFullYear()} Tivly AB</p>
      </div>
    </div>
  );
}
