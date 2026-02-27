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
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="border border-border bg-card rounded-lg overflow-hidden">
          {/* Card header */}
          <div className="px-8 pt-8 pb-0">
            <div className="flex items-center justify-between mb-6">
              <span className="text-[11px] font-semibold tracking-[0.3em] uppercase text-foreground select-none">
                Tivly
              </span>
              <span className="text-[10px] font-medium tracking-wider uppercase text-muted-foreground">
                {viewMode === 'code-entry' ? 'Verifiering' : 'Logga in'}
              </span>
            </div>
            <Separator className="bg-border" />
          </div>

          {/* Card body */}
          <div className="px-8 py-6">
            <AnimatePresence mode="wait">
              {/* WELCOME */}
              {viewMode === 'welcome' && (
                <motion.div
                  key="welcome"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-5"
                >
                  <div>
                    <h1 className="text-lg font-semibold text-foreground leading-tight">
                      Mötesdokumentation med AI
                    </h1>
                    <p className="text-[13px] text-muted-foreground mt-1.5 leading-relaxed">
                      Transkribera, sammanfatta och exportera – automatiskt.
                    </p>
                  </div>

                  <div className="space-y-2.5">
                    {[
                      'Realtidstranskribering',
                      'Automatiska protokoll',
                      'Action points & uppföljning',
                      'Export till Word & PDF',
                    ].map((item) => (
                      <div key={item} className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
                        <div className="w-1 h-1 rounded-full bg-foreground/40 shrink-0" />
                        {item}
                      </div>
                    ))}
                  </div>

                  <Button
                    onClick={handleGetStarted}
                    className="w-full h-10 text-[13px] font-medium bg-foreground text-background hover:bg-foreground/90 no-hover-lift"
                  >
                    Kom igång
                  </Button>
                </motion.div>
              )}

              {/* EMAIL */}
              {viewMode === 'email' && (
                <motion.div
                  key="email"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-5"
                >
                  <div>
                    <h1 className="text-lg font-semibold text-foreground leading-tight">
                      {platform === 'ios' ? 'Enterprise-inloggning' : 'Logga in på ditt konto'}
                    </h1>
                    <p className="text-[13px] text-muted-foreground mt-1.5">
                      {platform === 'ios'
                        ? 'Appen kräver ett Enterprise-konto.'
                        : 'Vi skickar en engångskod till din e-post.'}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="email" className="text-[12px] font-medium text-muted-foreground uppercase tracking-wider">
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
                        className="h-10 text-[13px] bg-background"
                      />
                    </div>

                    <Button
                      onClick={handleRequestCode}
                      disabled={loading || !email.trim()}
                      className="w-full h-10 text-[13px] font-medium bg-foreground text-background hover:bg-foreground/90 no-hover-lift"
                      type="button"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                          Skickar...
                        </>
                      ) : (
                        <>
                          <Mail className="w-3.5 h-3.5 mr-1.5" />
                          Skicka verifieringskod
                        </>
                      )}
                    </Button>
                  </div>

                  <AnimatePresence>
                    {authError && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="rounded bg-destructive/8 border border-destructive/15 px-3 py-2.5"
                      >
                        <p className="text-[12px] text-destructive text-center font-medium">{authError}</p>
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
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-5"
                >
                  <div>
                    <h1 className="text-lg font-semibold text-foreground leading-tight">
                      {isNavigating ? 'Välkommen' : verifying ? 'Verifierar' : 'Ange din kod'}
                    </h1>
                    <p className="text-[13px] text-muted-foreground mt-1.5">
                      {isNavigating
                        ? 'Du loggas in...'
                        : verifying
                          ? 'Kontrollerar koden...'
                          : <>Skickad till <span className="font-medium text-foreground">{email}</span></>
                      }
                    </p>
                  </div>

                  <div className="flex justify-center py-1">
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
                      <InputOTPGroup>
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                          <InputOTPSlot key={i} index={i} />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  {/* Status */}
                  <div className="text-center">
                    {verifying && (
                      <div className="flex items-center justify-center gap-2 text-[12px] text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Verifierar...
                      </div>
                    )}
                    {isNavigating && (
                      <div className="flex items-center justify-center gap-2 text-[12px] text-foreground font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Inloggning lyckades
                      </div>
                    )}
                    {!verifying && !isNavigating && codeExpiry > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        Giltig i {formatTime(codeExpiry)}
                      </p>
                    )}
                    {!verifying && !isNavigating && codeExpiry === 0 && (
                      <p className="text-[11px] text-destructive font-medium">
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
                        className="rounded bg-destructive/8 border border-destructive/15 px-3 py-2.5"
                      >
                        <div className="flex items-center gap-1.5 justify-center">
                          <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                          <p className="text-[12px] text-destructive font-medium">{authError}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {!isNavigating && (
                    <>
                      <Separator className="bg-border" />
                      <div className="flex items-center justify-between">
                        <button
                          onClick={handleStartOver}
                          disabled={verifying}
                          className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                        >
                          <ArrowLeft className="w-3 h-3" />
                          Ändra e-post
                        </button>
                        <button
                          onClick={handleResendCode}
                          disabled={verifying || loading}
                          className="text-[12px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                        >
                          {loading ? 'Skickar...' : 'Ny kod'}
                        </button>
                      </div>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Card footer */}
          <div className="px-8 pb-5">
            <Separator className="bg-border mb-4" />
            <div className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
              <Shield className="w-3 h-3" />
              Krypterad anslutning · End-to-end säkerhet
            </div>
          </div>
        </div>

        {/* Below card */}
        <p className="text-center text-[10px] text-muted-foreground mt-6">
          © {new Date().getFullYear()} Tivly AB
        </p>
      </div>
    </div>
  );
}
