import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, Loader2, CheckCircle2, ArrowLeft, Mail, Shield } from 'lucide-react';
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

type ViewMode = 'welcome' | 'email' | 'code-entry' | 'no-access';

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
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (isIoDomain()) return 'email';
    const hasSeenWelcome = localStorage.getItem('tivly_seen_welcome') === 'true';
    if (isAppDomain() || hasSeenWelcome) return 'email';
    return 'welcome';
  });
  const [authError, setAuthError] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [codeExpiry, setCodeExpiry] = useState<number>(600);
  const [platform, setPlatform] = useState<'ios' | 'web'>('web');
  const [codeSent, setCodeSent] = useState(false);
  const verifyingRef = useRef(false);

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
    if (!sanitized) {
      setAuthError('Ange en giltig e-postadress.');
      return;
    }

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
      const authBaseUrl = getAuthBaseUrl();
      const response = await fetch(`${authBaseUrl}/auth/totp/setup`, {
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

  const handleResendCode = async () => {
    setAuthError(null);
    setPinCode('');
    await handleRequestCode();
  };

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
      const authBaseUrl = getAuthBaseUrl();
      const response = await fetch(`${authBaseUrl}/auth/totp/login`, {
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

  const handleStartOver = () => {
    setViewMode('email');
    setPinCode('');
    setCodeExpiry(600);
    setCodeSent(false);
    setAuthError(null);
  };

  const handleBackToWelcome = () => {
    setViewMode('welcome');
    setEmail('');
    setPinCode('');
    setCodeExpiry(600);
    setCodeSent(false);
    setAuthError(null);
  };

  const handleGetStarted = () => {
    localStorage.setItem('tivly_seen_welcome', 'true');
    setViewMode('email');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  if (viewMode === 'no-access') {
    return <NoAppAccessScreen onLogout={() => { setViewMode('email'); setEmail(''); setPinCode(''); }} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Subtle background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-primary/[0.04] blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-accent/[0.03] blur-3xl" />
      </div>

      <div className="w-full max-w-[420px] relative z-10">
        {/* Logo area above card */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 mb-4">
              <span className="text-lg font-bold text-primary">T</span>
            </div>
            <h2 className="text-[11px] font-semibold tracking-[0.35em] uppercase text-muted-foreground">
              Tivly
            </h2>
          </motion.div>
        </div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: 'easeOut' }}
          className="border border-border/80 bg-card rounded-2xl shadow-lg shadow-primary/[0.03] overflow-hidden"
        >
          {/* Accent bar */}
          <div className="h-1 w-full bg-gradient-to-r from-primary via-accent to-primary/60" />

          {/* Card header */}
          <div className="px-8 pt-7 pb-0">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[13px] font-semibold text-foreground">
                {viewMode === 'code-entry' ? 'Verifiering' : viewMode === 'welcome' ? 'Välkommen' : 'Logga in'}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/8 text-[10px] font-medium text-primary">
                <Shield className="w-3 h-3" />
                Krypterad
              </span>
            </div>
            <Separator className="bg-border/60" />
          </div>

          {/* Card body */}
          <div className="px-8 py-7">
            <AnimatePresence mode="wait">
              {/* WELCOME */}
              {viewMode === 'welcome' && (
                <motion.div
                  key="welcome"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  <div>
                    <h1 className="text-xl font-semibold text-foreground leading-tight">
                      Mötesdokumentation med AI
                    </h1>
                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                      Transkribera, sammanfatta och exportera – automatiskt.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Realtidstranskribering', icon: '🎙️' },
                      { label: 'Automatiska protokoll', icon: '📋' },
                      { label: 'Action points', icon: '✅' },
                      { label: 'Export Word & PDF', icon: '📄' },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-secondary/60 border border-border/50">
                        <span className="text-sm">{item.icon}</span>
                        <span className="text-[12px] text-foreground font-medium leading-tight">{item.label}</span>
                      </div>
                    ))}
                  </div>

                  <Button
                    onClick={handleGetStarted}
                    className="w-full h-11 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl shadow-md shadow-primary/20 no-hover-lift"
                  >
                    Kom igång
                  </Button>
                </motion.div>
              )}

              {/* EMAIL */}
              {viewMode === 'email' && (
                <motion.div
                  key="email"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-5"
                >
                  <div>
                    <h1 className="text-xl font-semibold text-foreground leading-tight">
                      {platform === 'ios' ? 'Enterprise-inloggning' : 'Logga in på ditt konto'}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-2">
                      {platform === 'ios'
                        ? 'Appen kräver ett Enterprise-konto.'
                        : 'Vi skickar en engångskod till din e-post.'}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">
                        E-postadress
                      </Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
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
                          className="h-11 text-sm bg-secondary/40 border-border/60 pl-10 rounded-xl focus:bg-background transition-colors"
                        />
                      </div>
                    </div>

                    <Button
                      onClick={handleRequestCode}
                      disabled={loading || !email.trim()}
                      className="w-full h-11 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl shadow-md shadow-primary/20 no-hover-lift"
                      type="button"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Skickar...
                        </>
                      ) : (
                        'Skicka verifieringskod'
                      )}
                    </Button>
                  </div>

                  <AnimatePresence>
                    {authError && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="rounded-xl bg-destructive/8 border border-destructive/15 px-4 py-3"
                      >
                        <div className="flex items-center gap-2 justify-center">
                          <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                          <p className="text-[13px] text-destructive font-medium">{authError}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {!isAppDomain() && !isIoDomain() && (
                    <button
                      onClick={handleBackToWelcome}
                      className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors mx-auto"
                    >
                      <ArrowLeft className="w-3 h-3" />
                      Tillbaka
                    </button>
                  )}
                </motion.div>
              )}

              {/* CODE ENTRY */}
              {viewMode === 'code-entry' && (
                <motion.div
                  key="code-entry"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  <div>
                    <h1 className="text-xl font-semibold text-foreground leading-tight">
                      {isNavigating ? 'Välkommen tillbaka!' : verifying ? 'Verifierar...' : 'Ange din kod'}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-2">
                      {isNavigating
                        ? 'Du loggas in...'
                        : verifying
                          ? 'Kontrollerar koden...'
                          : <>Skickad till <span className="font-medium text-foreground">{email}</span></>
                      }
                    </p>
                  </div>

                  <div className="flex justify-center py-2">
                    <InputOTP
                      maxLength={6}
                      value={pinCode}
                      onChange={(value) => {
                        if (!verifying && !isNavigating) {
                          setPinCode(value);
                          setAuthError(null);
                        }
                      }}
                      disabled={verifying || isNavigating}
                      autoFocus
                    >
                      <InputOTPGroup className="gap-2">
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                          <InputOTPSlot key={i} index={i} className="w-11 h-12 rounded-xl border-border/60 text-lg" />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  {/* Status */}
                  <div className="text-center">
                    {verifying && (
                      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/8 text-[12px] text-primary font-medium">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Verifierar...
                      </div>
                    )}
                    {isNavigating && (
                      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-[12px] text-primary font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Inloggning lyckades
                      </div>
                    )}
                    {!verifying && !isNavigating && codeExpiry > 0 && (
                      <p className="text-[12px] text-muted-foreground">
                        Koden giltig i <span className="font-medium text-foreground">{formatTime(codeExpiry)}</span>
                      </p>
                    )}
                    {!verifying && !isNavigating && codeExpiry === 0 && (
                      <p className="text-[12px] text-destructive font-medium">
                        Koden har gått ut
                      </p>
                    )}
                  </div>

                  <AnimatePresence>
                    {authError && !verifying && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="rounded-xl bg-destructive/8 border border-destructive/15 px-4 py-3"
                      >
                        <div className="flex items-center gap-2 justify-center">
                          <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                          <p className="text-[13px] text-destructive font-medium">{authError}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {!isNavigating && (
                    <>
                      <Separator className="bg-border/60" />
                      <div className="flex items-center justify-between">
                        <button
                          onClick={handleStartOver}
                          disabled={verifying}
                          className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                        >
                          <ArrowLeft className="w-3 h-3" />
                          Ändra e-post
                        </button>
                        <button
                          onClick={handleResendCode}
                          disabled={verifying || loading}
                          className="text-[12px] font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-40"
                        >
                          {loading ? 'Skickar...' : 'Skicka ny kod'}
                        </button>
                      </div>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Card footer */}
          <div className="px-8 pb-6">
            <Separator className="bg-border/60 mb-4" />
            <div className="flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Shield className="w-3 h-3" />
                End-to-end krypterat
              </span>
              <span className="w-px h-3 bg-border" />
              <span>GDPR-kompatibel</span>
            </div>
          </div>
        </motion.div>

        {/* Below card */}
        <div className="text-center mt-8 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Behöver du ett företagskonto?{' '}
            <a href="/enterprise/onboarding" className="text-primary font-medium hover:text-primary/80 transition-colors">
              Starta Enterprise-trial
            </a>
          </p>
          <p className="text-[10px] text-muted-foreground/60">
            © {new Date().getFullYear()} Tivly AB
          </p>
        </div>
      </div>
    </div>
  );
}
