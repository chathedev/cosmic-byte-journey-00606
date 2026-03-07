import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AlertCircle, Loader2, CheckCircle2, ArrowLeft, ArrowRight, Mail, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { apiClient } from '@/lib/api';
import { getCommercialPlan } from '@/lib/commercialPlan';
import { motion, AnimatePresence } from 'framer-motion';
import NoAppAccessScreen from '@/components/NoAppAccessScreen';
import tivlyLogo from '@/assets/tivly-logo.png';
import { isEnterpriseCustomDomain, getPublicWorkspace, type PublicWorkspaceInfo } from '@/lib/enterpriseDomainApi';
import { EnterpriseSSOLogin } from '@/components/EnterpriseSSOLogin';

declare global {
  interface Window {
    authToken?: string;
  }
}

type ViewMode = 'email' | 'code-entry' | 'no-access' | 'enterprise-sso-redirect';

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
  const commercialPlan = getCommercialPlan(planType, userData.company?.planType, userData.company?.plan, userData.company?.planTier);
  if (commercialPlan === 'team' || commercialPlan === 'enterprise') return true;
  if (userData.enterprise?.active || userData.enterprise?.companyName) return true;
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
  const [onboardingEnabled, setOnboardingEnabled] = useState(false);
  const [enterpriseRedirect, setEnterpriseRedirect] = useState<{ hostname: string; origin: string } | null>(null);
  const [workspace, setWorkspace] = useState<PublicWorkspaceInfo | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const isCustomDomain = isEnterpriseCustomDomain();

  useEffect(() => {
    const isIosDomain = window.location.hostname === 'io.tivly.se';
    const isIosDevice = /iPhone|iPad|iPod/.test(navigator.userAgent);
    setPlatform(isIosDomain || isIosDevice ? 'ios' : 'web');
  }, []);

  useEffect(() => {
    apiClient.getEnterpriseOnboardingAuto()
      .then(data => setOnboardingEnabled(!!data.enabled))
      .catch(() => setOnboardingEnabled(false));
  }, []);

  const scrollInputIntoView = (target: HTMLElement) => {
    if (window.innerWidth >= 1024) return;
    const ua = navigator.userAgent;
    const isChrome = /Chrome|CriOS/.test(ua) && !/Edg|OPR/.test(ua);
    if (isChrome) return;

    window.scrollTo({ top: 0, behavior: 'auto' });
    window.setTimeout(() => {
      target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
    }, 180);
  };

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
        const errorBody = await response.json().catch(() => ({}));
        const errorCode = errorBody.code || errorBody.error || '';
        if (errorCode === 'enterprise_sso_required') {
          setEnterpriseRedirect({
            hostname: errorBody.loginHostname || '',
            origin: errorBody.workspaceOrigin || '',
          });
          setViewMode('enterprise-sso-redirect');
          return;
        }
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
          const rawError = error.error || error.message || '';
          // Map backend error codes to user-friendly Swedish messages
          const errorMap: Record<string, string> = {
            'invalid_token': 'Koden är ogiltig. Kontrollera att du angett rätt kod och försök igen.',
            'token_expired': 'Koden har gått ut. Begär en ny kod och försök igen.',
            'expired_token': 'Koden har gått ut. Begär en ny kod och försök igen.',
            'invalid_code': 'Koden är ogiltig. Kontrollera att du angett rätt kod och försök igen.',
            'code_expired': 'Koden har gått ut. Begär en ny kod och försök igen.',
            'too_many_attempts': 'För många försök. Vänta en stund och begär sedan en ny kod.',
            'max_attempts_exceeded': 'Maximalt antal försök har uppnåtts. Begär en ny kod.',
            'user_not_found': 'Inget konto hittades med denna e-postadress.',
            'account_locked': 'Kontot är tillfälligt låst. Kontakta support om problemet kvarstår.',
            'account_disabled': 'Kontot är inaktiverat. Kontakta din organisations administratör.',
            'forbidden': 'Åtkomst nekad. Kontakta din organisations administratör.',
            'insufficient_permissions': 'Du har inte behörighet att utföra denna åtgärd.',
            'rate_limited': 'För många förfrågningar. Vänta en stund och försök igen.',
            'server_error': 'Ett tekniskt fel uppstod. Försök igen om en stund.',
          };
          const friendlyMessage = errorMap[rawError.toLowerCase()] 
            || errorMap[rawError.replace(/\s+/g, '_').toLowerCase()]
            || (rawError.toLowerCase().includes('invalid') ? 'Koden är ogiltig. Kontrollera och försök igen.'
            : rawError.toLowerCase().includes('expir') ? 'Koden har gått ut. Begär en ny kod.'
            : rawError.toLowerCase().includes('attempt') ? 'För många försök. Begär en ny kod.'
            : 'Fel kod. Kontrollera och försök igen.');
          setAuthError(friendlyMessage);
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

  if (viewMode === 'enterprise-sso-redirect' && enterpriseRedirect) {
    return (
      <div className="relative min-h-[100svh] bg-background flex items-center justify-center p-5">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-foreground">Enterprise SSO krävs</h1>
            <p className="text-sm text-muted-foreground">
              Din organisation använder Enterprise SSO. Du behöver logga in via din organisations inloggningssida.
            </p>
          </div>
          {enterpriseRedirect.origin && (
            <a
              href={enterpriseRedirect.origin}
              className="inline-flex items-center justify-center gap-2 w-full h-11 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Gå till {enterpriseRedirect.hostname || 'din arbetsyta'}
              <ArrowRight className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={() => { setViewMode('email'); setEnterpriseRedirect(null); setAuthError(null); }}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Tillbaka
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[100svh] md:min-h-[100dvh] bg-background overflow-x-hidden flex flex-col">
      {/* Main area — NO fixed height, allows natural scroll on mobile */}
      <main className="relative z-10 flex-1 flex flex-col">
        {/* Desktop: two-column, Mobile: single centered */}
        <div className="flex-1 flex flex-col lg:flex-row">

          {/* Left panel — branding (desktop only) */}
          <div className="hidden lg:flex lg:w-[45%] xl:w-[40%] bg-muted/40 border-r border-border items-center justify-center p-12 min-h-screen sticky top-0">
            <div className="max-w-sm space-y-8">
              <img src={tivlyLogo} alt="Tivly" className="h-10 w-auto" />
              <div className="space-y-3">
                <h2 className="text-2xl font-semibold text-foreground tracking-tight">
                  Mötesprotokoll på sekunder
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Spela in, transkribera och generera professionella protokoll med AI. Spara timmar varje vecka.
                </p>
              </div>
              {onboardingEnabled && (
                <div className="pt-4">
                  <a
                    href="/team/onboarding"
                    className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                  >
                    Tivly för team <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Right panel — auth form */}
          <div className="flex-1 relative flex flex-col items-center px-5 sm:px-8 py-10 sm:py-12 min-h-[100svh] md:min-h-[100dvh] lg:min-h-screen justify-start lg:justify-center">
            {/* Mobile logo */}
            <div className="lg:hidden flex justify-center mb-8">
              <img src={tivlyLogo} alt="Tivly" className="h-8 w-auto" />
            </div>

            <div className="w-full max-w-[380px] mx-auto">
              <AnimatePresence mode="wait">
                {viewMode === 'email' && (
                  <motion.div
                    key="email"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-6"
                  >
                    <div className="text-center space-y-1.5">
                      <h1 className="text-2xl font-semibold text-foreground tracking-tight">
                        {isSignup ? 'Skapa konto' : 'Välkommen tillbaka'}
                      </h1>
                      <p className="text-sm text-muted-foreground">
                        {isSignup
                          ? 'Ange din e-post så skapar vi ett konto åt dig.'
                          : 'Logga in med din e-postadress.'}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">
                          E-postadress
                        </Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40 pointer-events-none z-10" />
                          <Input
                            id="email"
                            type="email"
                            placeholder="namn@foretag.se"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onFocus={(e) => scrollInputIntoView(e.currentTarget)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleRequestCode(); } }}
                            disabled={loading}
                            className="h-11 text-base pl-10 rounded-lg bg-background border-border focus:border-primary touch-manipulation"
                          />
                        </div>
                      </div>

                      <Button
                        onClick={handleRequestCode}
                        disabled={loading || !email.trim()}
                        className="w-full h-11 rounded-lg text-sm font-medium"
                        type="button"
                      >
                        {loading ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Skickar...</>
                        ) : (
                          <>{isSignup ? 'Skapa konto' : 'Skicka kod'}</>
                        )}
                      </Button>
                    </div>

                    <AnimatePresence>
                      {authError && (
                        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
                          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/15">
                            <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                            <p className="text-xs text-destructive font-medium">{authError}</p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="pt-2">
                      <p className="text-center text-sm text-muted-foreground">
                        {isSignup ? (
                          <>Har du redan konto?{' '}<button onClick={() => setIsSignup(false)} className="text-primary font-medium hover:text-primary/80 transition-colors">Logga in</button></>
                        ) : (
                          <>Nytt här?{' '}<button onClick={() => setIsSignup(true)} className="text-primary font-medium hover:text-primary/80 transition-colors">Skapa konto</button></>
                        )}
                      </p>
                    </div>

                    {/* Enterprise link — mobile only */}
                    {onboardingEnabled && (
                      <div className="lg:hidden text-center pt-2">
                        <a
                          href="/team/onboarding"
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Tivly för team →
                        </a>
                      </div>
                    )}
                  </motion.div>
                )}

                {viewMode === 'code-entry' && (
                  <motion.div
                    key="code-entry"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18 }}
                    className="space-y-6"
                  >
                    <div className="text-center space-y-1.5">
                      <h1 className="text-2xl font-semibold text-foreground tracking-tight">
                        {isNavigating ? 'Välkommen!' : verifying ? 'Verifierar...' : 'Ange kod'}
                      </h1>
                      <p className="text-sm text-muted-foreground">
                        {isNavigating ? 'Du loggas in...' : verifying ? 'Kontrollerar koden...' : (
                          <>Kod skickad till <span className="font-medium text-foreground">{email}</span></>
                        )}
                      </p>
                    </div>

                    <div className="flex justify-center py-2">
                      <InputOTP
                        maxLength={6}
                        value={pinCode}
                        onChange={(value) => { if (!verifying && !isNavigating) { setPinCode(value); setAuthError(null); } }}
                        disabled={verifying || isNavigating}
                      >
                        <InputOTPGroup className="gap-2">
                          {[0, 1, 2, 3, 4, 5].map((i) => (
                            <InputOTPSlot
                              key={i}
                              index={i}
                              className="w-11 h-12 rounded-lg border-border text-base font-medium"
                            />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                    </div>

                    <div className="text-center min-h-[20px]">
                      {verifying && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Loader2 className="w-3 h-3 animate-spin" />Verifierar
                        </span>
                      )}
                      {isNavigating && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-primary font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />Inloggad
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
                        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
                          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/15">
                            <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                            <p className="text-xs text-destructive font-medium">{authError}</p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {!isNavigating && (
                      <div className="flex items-center justify-between pt-2">
                        <button
                          onClick={handleStartOver}
                          disabled={verifying}
                          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                        >
                          <ArrowLeft className="w-3 h-3" /> Ändra e-post
                        </button>
                        <button
                          onClick={handleResendCode}
                          disabled={verifying || loading}
                          className="text-sm font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-40"
                        >
                          {loading ? 'Skickar...' : 'Skicka ny kod'}
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer inside the form panel */}
            <div className="hidden lg:flex w-full justify-center absolute bottom-6 left-0">
              <p className="text-[11px] text-muted-foreground/50 text-center">© {new Date().getFullYear()} <a href="https://lyrio.se" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors">Lyrio AB</a></p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
