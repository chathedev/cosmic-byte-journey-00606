import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

import { ArrowLeft, Shield, AlertCircle, Sparkles, Mail, Loader2, Clock, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import tivlyLogo from '@/assets/tivly-logo.png';
import { apiClient } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import NoAppAccessScreen from '@/components/NoAppAccessScreen';

/**
 * Auth - Email + PIN authentication
 * Works on both app.tivly.se and io.tivly.se domains
 * Users receive 6-digit codes via email
 * 
 * iOS App (io.tivly.se):
 * - No account creation allowed (must create on web)
 * - Login only for Pro/Enterprise users
 */

declare global {
  interface Window {
    authToken?: string;
  }
}

type ViewMode = 'welcome' | 'email' | 'code-entry' | 'no-access';

// Email sanitization
function sanitizeEmail(email: string | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return trimmed && emailRegex.test(trimmed) ? trimmed : null;
}

// Detect if running on app.tivly.se (skip welcome screen)
function isAppDomain(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.includes('app.tivly.se');
}

// Detect if running on io.tivly.se (iOS app - login only, no signup)
function isIoDomain(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.includes('io.tivly.se');
}

// Determine which base URL to use for auth-related backend calls
function getAuthBaseUrl(): string {
  return 'https://api.tivly.se';
}

// Check if user has app access - ENTERPRISE or ADMIN for iOS app
function hasAppAccess(userData: any): boolean {
  if (!userData) return false;
  
  // Check for admin flag
  if (userData.isAdmin === true) return true;
  
  // Check for admin/owner role (single role field)
  if (userData.role === 'admin' || userData.role === 'owner') return true;
  
  // Check roles array for admin/owner
  if (Array.isArray(userData.roles)) {
    if (userData.roles.includes('admin') || userData.roles.includes('owner')) return true;
  }
  
  // Check plan type - enterprise allowed on iOS app
  const planType = typeof userData.plan === 'string' ? userData.plan : userData.plan?.plan;
  if (planType?.toLowerCase() === 'enterprise') return true;
  
  // Check enterprise membership
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
    // iOS app: skip welcome, go directly to email entry (login only)
    if (isIoDomain()) {
      return 'email';
    }
    const hasSeenWelcome = localStorage.getItem('tivly_seen_welcome') === 'true';
    if (isAppDomain() || hasSeenWelcome) {
      return 'email';
    }
    return 'welcome';
  });
  const [authError, setAuthError] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [codeExpiry, setCodeExpiry] = useState<number>(600);
  const [platform, setPlatform] = useState<'ios' | 'web'>('web');
  const [codeSent, setCodeSent] = useState(false);
  const verifyingRef = useRef(false);

  // Detect platform on mount
  useEffect(() => {
    const isIosDomain = window.location.hostname === 'io.tivly.se';
    const isIosDevice = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const detectedPlatform = isIosDomain || isIosDevice ? 'ios' : 'web';
    setPlatform(detectedPlatform);
    console.log(`[Auth] 🎯 Platform detected: ${detectedPlatform.toUpperCase()}`);
  }, []);

  // Handle redirect param for cross-domain auth (e.g., connect.tivly.se)
  useEffect(() => {
    if (!isLoading && user && !isNavigating) {
      setIsNavigating(true);
      
      // Check for redirect param (used by connect.tivly.se and other subdomains)
      const urlParams = new URLSearchParams(window.location.search);
      const redirectUrl = urlParams.get('redirect');
      
      if (redirectUrl) {
        try {
          const url = new URL(redirectUrl);
          // Only allow redirects to tivly.se subdomains for security
          if (url.hostname.endsWith('tivly.se') || url.hostname.endsWith('.lovableproject.com')) {
            const token = apiClient.getAuthToken();
            if (token) {
              // Append token to redirect URL for cross-domain auth
              url.searchParams.set('authToken', token);
              console.log('[Auth] Redirecting to external URL with token:', url.origin);
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

  // Countdown timer for code expiry
  useEffect(() => {
    if (viewMode !== 'code-entry' || !codeSent) return;

    const timer = setInterval(() => {
      setCodeExpiry((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [viewMode, codeSent]);

  // Auto-verify when 6 digits are entered
  useEffect(() => {
    if (pinCode.length === 6 && /^\d{6}$/.test(pinCode) && !verifyingRef.current && !verifying) {
      handleVerifyPin();
    }
  }, [pinCode]);

  const handleRequestCode = async () => {
    const sanitized = sanitizeEmail(email);
    setAuthError(null);
    
    if (!sanitized) {
      console.error(`[Auth] ❌ Invalid email on ${platform} platform:`, email);
      setAuthError(platform === 'ios' 
        ? 'Ange en giltig e-postadress'
        : 'Ogiltig e-postadress. Kontrollera och försök igen.');
      return;
    }

    // DEMO ACCOUNT: Instant login without backend
    if (sanitized === 'demo@tivly.se') {
      console.log('[Auth] 🎯 Demo account detected - instant login');
      setLoading(true);
      
      // Create a fake demo token and user
      const demoToken = 'demo-token-' + Date.now();
      const demoUser = {
        id: 'demo-user-id',
        uid: 'demo-user-id',
        email: 'demo@tivly.se',
        displayName: 'Demo User',
        emailVerified: true,
        plan: {
          plan: 'enterprise',
          type: 'enterprise',
          meetingsUsed: 5,
          meetingsLimit: null,
          protocolsUsed: 12,
          protocolsLimit: null,
        },
        enterprise: {
          active: true,
          companyName: 'Demo Enterprise AB',
        }
      };
      
      // Store demo token
      localStorage.setItem('authToken', demoToken);
      localStorage.setItem('demoUser', JSON.stringify(demoUser));
      
      // Brief delay for UX
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setIsNavigating(true);
      await refreshUser();
      // IMPORTANT: do not navigate here.
      // The /auth route wrapper handles redirecting (including cross-domain ?redirect=... flows).
      setLoading(false);
      return;
    }

    console.log(`[Auth] 📧 Email validated for ${platform.toUpperCase()} platform, requesting verification code...`);
    setLoading(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.error(`[Auth] ⏰ totp/setup request timed out after 15s (${platform})`);
        controller.abort();
      }, 15000);

      const authBaseUrl = getAuthBaseUrl();
      console.log(`[Auth] 🔧 Calling /auth/totp/setup from ${window.location.href} (${platform}) using base ${authBaseUrl}`);
      
      const response = await fetch(`${authBaseUrl}/auth/totp/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email: sanitized }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log(`[Auth] 📊 /auth/totp/setup status: ${response.status} ${response.statusText} (${platform})`);

      if (response.ok) {
        console.log(`[Auth] 📥 Code request successful for ${platform}, showing code entry`);
        setCodeExpiry(600);
        setCodeSent(true);
        setViewMode('code-entry');
        setPinCode('');
      } else {
        const errorText = await response.text().catch(() => '');
        console.error(`[Auth] ❌ Code request failed (${platform}):`, response.status, response.statusText);
        setAuthError(platform === 'ios'
          ? 'Kunde inte skicka kod. Försök igen.'
          : 'Kunde inte skicka verifieringskod. Försök igen.');
      }
    } catch (error) {
      console.error(`[Auth] 💥 Error requesting code (${platform}):`, error);
      setAuthError(platform === 'ios'
        ? 'Anslutningen misslyckades. Kontrollera din internetanslutning.'
        : 'Ett nätverksfel uppstod. Kontrollera din uppkoppling och försök igen.');
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
    if (pinCode.length !== 6 || !/^\d{6}$/.test(pinCode) || verifyingRef.current) {
      return;
    }

    const sanitized = sanitizeEmail(email);
    if (!sanitized) return;

    verifyingRef.current = true;
    setVerifying(true);
    setAuthError(null);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.error('[Auth] ⏰ totp/login request timed out after 15s');
        controller.abort();
      }, 15000);

      const authBaseUrl = getAuthBaseUrl();
      console.log(`[Auth] 🔐 Calling /auth/totp/login from ${window.location.href} (${platform}) using base ${authBaseUrl}`);
      
      const response = await fetch(`${authBaseUrl}/auth/totp/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email: sanitized, token: pinCode }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log(`[Auth] 📊 /auth/totp/login status: ${response.status} ${response.statusText} (${platform})`);

      const responseText = await response.text().catch(() => '');
      console.log(`[Auth] 📥 /auth/totp/login raw response length: ${responseText?.length || 0} (${platform})`);

      if (response.ok) {
        console.log(`[Auth] ✅ Login successful (${platform}), processing response...`);

        let userData = null;
        if (responseText && responseText.trim().length > 0) {
          try {
            const data = JSON.parse(responseText);
            console.log('[Auth] 📊 Parsed login response:', { hasToken: !!data.token, hasUser: !!data.user });
            userData = data.user;
            
            if (data.token) {
              console.log('[Auth] 🔑 Applying JWT token from response');
              apiClient.applyAuthToken(data.token);
            }
          } catch (parseError) {
            console.warn('[Auth] ⚠️ JSON parse failed, using cookie-based auth:', parseError);
          }
        } else {
          console.log('[Auth] 🍪 Empty response body, using cookie-based authentication');
        }

        // iOS app: Check if user has Pro/Enterprise plan
        if (isIoDomain()) {
          console.log('[Auth] 📱 iOS app - checking plan access...');
          
          // Fetch user data if not in response
          if (!userData) {
            try {
              userData = await apiClient.getMe();
            } catch (e) {
              console.error('[Auth] Failed to fetch user data for access check:', e);
            }
          }
          
          console.log('[Auth] 📋 User plan data:', userData?.plan);
          
          if (!hasAppAccess(userData)) {
            console.log('[Auth] ❌ User does not have app access - showing no-access screen');
            setViewMode('no-access');
            setVerifying(false);
            verifyingRef.current = false;
            return;
          }
          
          console.log('[Auth] ✅ User has app access, proceeding...');
        }

        console.log('[Auth] ✅ Authenticated, handing off to route redirect...');
        setIsNavigating(true);
        await refreshUser();
        // IMPORTANT: do not navigate here.
        // The /auth route wrapper handles redirecting (including cross-domain ?redirect=... flows).
        return;
      }

      // Handle errors
      console.error(`[Auth] ❌ Login failed (${platform}):`, response.status, response.statusText);
      
      if (!responseText || responseText.trim() === '') {
        setAuthError('Fel kod. Försök igen.');
      } else {
        try {
          const error = JSON.parse(responseText);
          setAuthError(error.error || error.message || 'Fel kod. Försök igen.');
        } catch {
          setAuthError('Fel kod. Försök igen.');
        }
      }
      setPinCode('');
    } catch (error: any) {
      console.error('[Auth] PIN verification failed:', error);
      setAuthError('Ett nätverksfel uppstod. Försök igen.');
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

  // Show no-access screen for iOS users without Pro/Enterprise
  if (viewMode === 'no-access') {
    return (
      <NoAppAccessScreen 
        onLogout={() => {
          setViewMode('email');
          setEmail('');
          setPinCode('');
        }} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Clean header */}
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold tracking-widest uppercase text-foreground">TIVLY</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-8 shadow-sm">
          <AnimatePresence mode="wait">
            {viewMode === 'welcome' && (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <h1 className="text-2xl font-bold text-foreground mb-2">
                  Välkommen till Tivly
                </h1>
                <p className="text-sm text-muted-foreground mb-6">
                  Hej! Logga in för att komma igång.
                </p>

                <p className="text-sm font-medium text-foreground mb-3">
                  Tivly hjälper dig med:
                </p>
                <ul className="space-y-1.5 mb-8 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-foreground">–</span>
                    AI-transkribering av möten
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground">–</span>
                    Automatiska sammanfattningar
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground">–</span>
                    Action points och uppföljning
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground">–</span>
                    Export till Word/PDF
                  </li>
                </ul>

                <Button 
                  onClick={handleGetStarted}
                  className="w-full h-11 text-sm font-medium bg-foreground text-background hover:bg-foreground/90 no-hover-lift"
                  size="lg"
                >
                  Kom igång
                </Button>
              </motion.div>
            )}

            {viewMode === 'email' && (
              <motion.div
                key="email"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <h1 className="text-2xl font-bold text-foreground mb-1">
                  {platform === 'ios' ? 'Tivly Enterprise' : 'Logga in'}
                </h1>
                <p className="text-sm text-muted-foreground mb-6">
                  {platform === 'ios' 
                    ? 'Appen är tillgänglig för Enterprise-konton'
                    : 'Ange din e-post så skickar vi en verifieringskod.'}
                </p>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-sm font-medium text-foreground">E-postadress</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="din@email.se"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleRequestCode();
                        }
                      }}
                      disabled={loading}
                      autoComplete="email"
                      autoFocus
                      className="h-11"
                    />
                  </div>

                  <Button
                    onClick={handleRequestCode}
                    disabled={loading || !email.trim()}
                    className="w-full h-11 text-sm font-medium bg-foreground text-background hover:bg-foreground/90 no-hover-lift"
                    type="button"
                  >
                    {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {loading ? 'Skickar kod...' : 'Skicka verifieringskod'}
                  </Button>

                  <AnimatePresence>
                    {authError && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="rounded-md bg-destructive/10 border border-destructive/20 p-3"
                      >
                        <p className="text-sm text-destructive text-center font-medium">
                          {authError}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {!isAppDomain() && !isIoDomain() && (
                    <button
                      onClick={handleBackToWelcome}
                      className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors text-center py-2"
                    >
                      ← Tillbaka
                    </button>
                  )}

                  {isIoDomain() && (
                    <p className="text-xs text-center text-muted-foreground pt-1">
                      Endast för Enterprise-användare
                    </p>
                  )}
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
              >
                <h1 className="text-2xl font-bold text-foreground mb-1">
                  {isNavigating ? 'Inloggad!' : verifying ? 'Verifierar...' : 'Ange kod'}
                </h1>
                <p className="text-sm text-muted-foreground mb-6">
                  {isNavigating 
                    ? 'Du loggas in...'
                    : verifying 
                      ? 'Vänta medan vi verifierar din kod'
                      : `Vi skickade en 6-siffrig kod till ${email}`
                  }
                </p>

                <div className="space-y-5">
                  <div className="flex justify-center">
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
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  {/* Status */}
                  <div className="text-center">
                    {verifying && (
                      <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Verifierar...
                      </p>
                    )}
                    {isNavigating && (
                      <p className="text-sm text-foreground font-medium flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Inloggning lyckades!
                      </p>
                    )}
                    {!verifying && !isNavigating && codeExpiry > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Koden giltig i {formatTime(codeExpiry)}
                      </p>
                    )}
                    {!verifying && !isNavigating && codeExpiry === 0 && (
                      <p className="text-xs text-destructive font-medium">
                        Koden har gått ut. Begär en ny kod.
                      </p>
                    )}
                  </div>

                  <AnimatePresence>
                    {authError && !verifying && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="rounded-md bg-destructive/10 border border-destructive/20 p-3"
                      >
                        <div className="flex items-center gap-2 justify-center">
                          <AlertCircle className="w-4 h-4 text-destructive" />
                          <p className="text-sm text-destructive font-medium">
                            {authError}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {!isNavigating && (
                    <div className="flex gap-3 pt-1">
                      <button
                        onClick={handleStartOver}
                        disabled={verifying}
                        className="flex-1 text-sm text-muted-foreground hover:text-foreground transition-colors py-2 disabled:opacity-50"
                      >
                        ← Ändra e-post
                      </button>
                      <button
                        onClick={handleResendCode}
                        disabled={verifying || loading}
                        className="flex-1 text-sm text-muted-foreground hover:text-foreground transition-colors py-2 disabled:opacity-50"
                      >
                        {loading ? 'Skickar...' : 'Skicka ny kod'}
                      </button>
                    </div>
                  )}

                  {!verifying && !isNavigating && (
                    <p className="text-xs text-center text-muted-foreground">
                      Hittar du inte koden? Kolla i skräpposten.
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center space-y-1">
          <p className="text-xs text-muted-foreground">
            Frågor? Kontakta oss på support@tivly.se
          </p>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Tivly
          </p>
        </div>
      </div>
    </div>
  );
}
