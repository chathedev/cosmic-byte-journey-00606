import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { AlertCircle, Loader2, CheckCircle2, ArrowLeft, Shield, Mic, FileText, ListChecks, FileOutput, ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { apiClient } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import NoAppAccessScreen from '@/components/NoAppAccessScreen';
import { Card, CardContent } from '@/components/ui/card';

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

const FEATURES = [
  { label: 'Realtidstranskribering', desc: 'Automatisk text från ljud i realtid', Icon: Mic },
  { label: 'AI-protokoll', desc: 'Genererade mötesprotokoll på sekunder', Icon: FileText },
  { label: 'Action points', desc: 'Uppgifter och beslut automatiskt', Icon: ListChecks },
  { label: 'Export', desc: 'Word, PDF och enkel delning', Icon: FileOutput },
];


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
  const handleBackToWelcome = () => { setViewMode('welcome'); setEmail(''); setPinCode(''); setCodeExpiry(600); setCodeSent(false); setAuthError(null); };
  const handleGetStarted = () => { localStorage.setItem('tivly_seen_welcome', 'true'); setViewMode('email'); };
  const formatTime = (seconds: number) => { const m = Math.floor(seconds / 60); const s = seconds % 60; return `${m}:${String(s).padStart(2, '0')}`; };

  if (viewMode === 'no-access') {
    return <NoAppAccessScreen onLogout={() => { setViewMode('email'); setEmail(''); setPinCode(''); }} />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 sm:px-8 py-12 relative">
      {/* Subtle pattern */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.02]" style={{
        backgroundImage: 'radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
      }} />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="text-center mb-8">
          <span className="text-xs font-semibold tracking-[0.3em] uppercase text-foreground">Tivly</span>
        </motion.div>

          {/* Auth card */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
          >
            <Card className="border-border/50 shadow-lg shadow-primary/5 overflow-hidden">
              {/* Progress bar */}
              <div className="flex">
                <div className={`h-1 flex-1 rounded-bl transition-colors duration-300 ${viewMode === 'welcome' || viewMode === 'email' || viewMode === 'code-entry' ? 'bg-primary' : 'bg-border'}`} />
                <div className={`h-1 flex-1 transition-colors duration-300 ${viewMode === 'email' || viewMode === 'code-entry' ? 'bg-primary' : 'bg-border'}`} />
                <div className={`h-1 flex-1 rounded-br transition-colors duration-300 ${viewMode === 'code-entry' ? 'bg-primary' : 'bg-border'}`} />
              </div>

              <CardContent className="p-8">
                <AnimatePresence mode="wait">
                  {/* WELCOME */}
                  {viewMode === 'welcome' && (
                    <motion.div key="welcome" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="space-y-6">
                      <div className="space-y-2">
                        <h1 className="text-xl font-bold text-foreground">Välkommen</h1>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          Logga in eller skapa ett gratis konto för att börja.
                        </p>
                      </div>

                      {/* Features list — visible on mobile since left panel is hidden */}
                      <div className="space-y-0 divide-y divide-border/50">
                        {FEATURES.map((item) => (
                          <div key={item.label} className="flex items-center gap-3 py-3">
                            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <item.Icon className="w-4 h-4 text-primary" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">{item.label}</p>
                              <p className="text-xs text-muted-foreground">{item.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>


                      <div className="space-y-3">
                        <Button
                          onClick={() => { setIsSignup(false); handleGetStarted(); }}
                          className="w-full h-11 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl no-hover-lift shadow-md shadow-primary/15"
                        >
                          Logga in
                          <ArrowRight className="w-4 h-4 ml-1.5" />
                        </Button>
                        <Button
                          onClick={() => { setIsSignup(true); handleGetStarted(); }}
                          variant="outline"
                          className="w-full h-11 text-sm font-medium rounded-xl no-hover-lift"
                        >
                          Skapa gratis konto
                        </Button>
                      </div>
                    </motion.div>
                  )}

                  {/* EMAIL */}
                  {viewMode === 'email' && (
                    <motion.div key="email" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="space-y-6">
                      <div className="space-y-1.5">
                        <h1 className="text-xl font-bold text-foreground">
                          {isSignup ? 'Skapa konto' : 'Logga in'}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                          {isSignup ? 'Ange din e-post så skapar vi ditt konto.' : 'Vi skickar en engångskod till din e-post.'}
                        </p>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">E-post</Label>
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
                            className="h-11 text-sm bg-background rounded-xl"
                          />
                        </div>

                        <Button
                          onClick={handleRequestCode}
                          disabled={loading || !email.trim()}
                          className="w-full h-11 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl no-hover-lift shadow-md shadow-primary/15"
                          type="button"
                        >
                          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Skickar...</> : isSignup ? 'Skapa konto' : 'Fortsätt'}
                        </Button>
                      </div>

                      <AnimatePresence>
                        {authError && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                            <Card className="border-destructive/20 bg-destructive/5">
                              <CardContent className="p-3 flex items-center gap-2">
                                <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                                <p className="text-xs text-destructive font-medium">{authError}</p>
                              </CardContent>
                            </Card>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Toggle between login/signup */}
                      <p className="text-center text-xs text-muted-foreground">
                        {isSignup ? (
                          <>Har redan ett konto?{' '}<button onClick={() => setIsSignup(false)} className="text-primary font-medium hover:text-primary/70 transition-colors">Logga in</button></>
                        ) : (
                          <>Inget konto?{' '}<button onClick={() => setIsSignup(true)} className="text-primary font-medium hover:text-primary/70 transition-colors">Skapa gratis konto</button></>
                        )}
                      </p>

                      {!isAppDomain() && !isIoDomain() && (
                        <button onClick={handleBackToWelcome} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto">
                          <ArrowLeft className="w-3 h-3" /> Tillbaka
                        </button>
                      )}
                    </motion.div>
                  )}

                  {/* CODE ENTRY */}
                  {viewMode === 'code-entry' && (
                    <motion.div key="code-entry" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="space-y-6">
                      <div className="space-y-1.5">
                        <h1 className="text-xl font-bold text-foreground">
                          {isNavigating ? 'Välkommen!' : verifying ? 'Verifierar...' : 'Verifiering'}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                          {isNavigating ? 'Du loggas in...' : verifying ? 'Kontrollerar koden...' : <>Kod skickad till <span className="font-medium text-foreground">{email}</span></>}
                        </p>
                      </div>

                      <div className="flex justify-center py-2">
                        <InputOTP maxLength={6} value={pinCode} onChange={(value) => { if (!verifying && !isNavigating) { setPinCode(value); setAuthError(null); } }} disabled={verifying || isNavigating} autoFocus>
                          <InputOTPGroup className="gap-2">
                            {[0, 1, 2, 3, 4, 5].map((i) => (
                              <InputOTPSlot key={i} index={i} className="w-11 h-12 rounded-xl border-border text-base font-medium" />
                            ))}
                          </InputOTPGroup>
                        </InputOTP>
                      </div>

                      <div className="text-center min-h-[28px]">
                        {verifying && <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" />Verifierar</span>}
                        {isNavigating && <span className="inline-flex items-center gap-1.5 text-xs text-primary font-medium"><CheckCircle2 className="w-3.5 h-3.5" />Inloggning lyckades</span>}
                        {!verifying && !isNavigating && codeExpiry > 0 && <p className="text-xs text-muted-foreground">Giltig i {formatTime(codeExpiry)}</p>}
                        {!verifying && !isNavigating && codeExpiry === 0 && <p className="text-xs text-destructive font-medium">Koden har gått ut</p>}
                      </div>

                      <AnimatePresence>
                        {authError && !verifying && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                            <Card className="border-destructive/20 bg-destructive/5">
                              <CardContent className="p-3 flex items-center gap-2">
                                <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                                <p className="text-xs text-destructive font-medium">{authError}</p>
                              </CardContent>
                            </Card>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {!isNavigating && (
                        <div className="flex items-center justify-between pt-1">
                          <button onClick={handleStartOver} disabled={verifying} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40">
                            <ArrowLeft className="w-3 h-3" /> Ändra e-post
                          </button>
                          <button onClick={handleResendCode} disabled={verifying || loading} className="text-xs font-medium text-primary hover:text-primary/70 transition-colors disabled:opacity-40">
                            {loading ? 'Skickar...' : 'Skicka ny kod'}
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>

              {/* Footer */}
              <div className="px-8 pb-6">
                <div className="h-px bg-border/50 mb-4" />
                <div className="flex items-center justify-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Shield className="w-3 h-3 text-primary/50" />Krypterad</span>
                  <span className="w-px h-2.5 bg-border" />
                  <span>GDPR</span>
                  <span className="w-px h-2.5 bg-border" />
                  <span>ISO 27001</span>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Below card */}
          <div className="text-center mt-8 space-y-3">
            <a href="/enterprise/onboarding" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/70 transition-colors">
              Starta Enterprise-trial <ArrowRight className="w-3 h-3" />
            </a>
            <p className="text-[10px] text-muted-foreground/50">© {new Date().getFullYear()} Tivly AB</p>
        </div>
      </div>
    </div>
  );
}
