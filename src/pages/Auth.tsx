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

// Check if user has app access - ENTERPRISE ONLY for iOS app
function hasAppAccess(userData: any): boolean {
  if (!userData) return false;
  
  // Check for admin role
  const isAdmin = userData.role === 'admin' || userData.role === 'owner';
  if (isAdmin) return true;
  
  // Check plan type - ONLY enterprise allowed on iOS app
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

  useEffect(() => {
    if (!isLoading && user && !isNavigating) {
      setIsNavigating(true);
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

        console.log('[Auth] 🚀 Redirecting to dashboard...');
        setIsNavigating(true);
        await refreshUser();
        setTimeout(() => {
          navigate('/', { replace: true });
        }, 300);
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
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-secondary/10">
        <motion.div 
          className="absolute top-20 -left-20 w-72 h-72 bg-primary/20 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div 
          className="absolute bottom-20 -right-20 w-96 h-96 bg-accent/20 rounded-full blur-3xl"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
      
      <Card className="w-full max-w-md relative z-10 shadow-2xl border-2 backdrop-blur-xl bg-card/98">
        <AnimatePresence mode="wait">
          {viewMode === 'welcome' && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <CardHeader className="space-y-6 text-center pb-8 pt-12">
                <motion.div 
                  className="mx-auto w-32 h-32"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1, duration: 0.3 }}
                >
                  <img src={tivlyLogo} alt="Tivly Logo" className="w-full h-full object-contain" />
                </motion.div>
                
                <motion.div 
                  className="space-y-3"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, duration: 0.3 }}
                >
                  <CardTitle className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                    Välkommen till Tivly
                  </CardTitle>
                  <CardDescription className="text-lg">
                    Säker och enkel inloggning med e-postkod
                  </CardDescription>
                </motion.div>
              </CardHeader>

              <CardContent className="pb-12 space-y-6">
                <div className="space-y-4">
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <div className="flex items-start gap-3">
                      <Mail className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Kod via e-post</p>
                        <p className="text-xs text-muted-foreground">
                          Få en 6-siffrig kod direkt i din inkorg
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <div className="flex items-start gap-3">
                      <Shield className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Banksäker säkerhet</p>
                        <p className="text-xs text-muted-foreground">
                          Krypterad autentisering som skyddar dina uppgifter
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <div className="flex items-start gap-3">
                      <Sparkles className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Snabbt och smidigt</p>
                        <p className="text-xs text-muted-foreground">
                          Logga in på sekunder utan att komma ihåg lösenord
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <Button 
                  onClick={handleGetStarted}
                  className="w-full h-12 text-base font-medium"
                  size="lg"
                >
                  Kom igång
                </Button>
              </CardContent>
            </motion.div>
          )}

          {viewMode === 'email' && (
            <motion.div
              key="email"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <CardHeader className="space-y-4 text-center pb-6">
                <motion.div 
                  className="mx-auto w-20 h-20"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  <img src={tivlyLogo} alt="Tivly Logo" className="w-full h-full object-contain" />
                </motion.div>
                
                <div className="space-y-2">
                  <CardTitle className="text-2xl font-bold">
                    {platform === 'ios' ? 'Tivly Enterprise' : 'Logga in'}
                  </CardTitle>
                  <CardDescription>
                    {platform === 'ios' 
                      ? 'Appen är endast tillgänglig för Enterprise-konton'
                      : 'Ange din e-post för att fortsätta'}
                  </CardDescription>
                </div>

                {/* Progress indicator */}
                <div className="flex gap-1.5 justify-center pt-2">
                  <div className="h-1.5 w-8 rounded-full bg-primary" />
                  <div className="h-1.5 w-1.5 rounded-full bg-primary/30" />
                </div>
              </CardHeader>

              <CardContent className="pb-8 space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">E-postadress</Label>
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
                    className="h-12"
                  />
                </div>

                <Button
                  onClick={handleRequestCode}
                  disabled={loading || !email.trim()}
                  className="w-full h-12 relative"
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
                      className="rounded-lg bg-destructive/10 border border-destructive/20 p-3"
                    >
                      <p className="text-sm text-destructive text-center font-medium">
                        {authError}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Only show back button on web (not iOS app) */}
                {!isAppDomain() && !isIoDomain() && (
                  <Button
                    variant="ghost"
                    onClick={handleBackToWelcome}
                    className="w-full"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Tillbaka
                  </Button>
                )}

                {/* iOS app notice - enterprise only */}
                {isIoDomain() && (
                  <p className="text-xs text-center text-muted-foreground pt-2">
                    Endast för Enterprise-användare
                  </p>
                )}
              </CardContent>
            </motion.div>
          )}

          {viewMode === 'code-entry' && (
            <motion.div
              key="code-entry"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <CardHeader className="space-y-4 text-center pb-4">
                <motion.div 
                  className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  {verifying ? (
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  ) : isNavigating ? (
                    <CheckCircle2 className="w-8 h-8 text-green-500" />
                  ) : (
                    <Mail className="w-8 h-8 text-primary" />
                  )}
                </motion.div>
                
                <div className="space-y-2">
                  <CardTitle className="text-2xl font-bold">
                    {isNavigating ? 'Inloggad!' : verifying ? 'Verifierar...' : 'Ange kod'}
                  </CardTitle>
                  <CardDescription>
                    {isNavigating 
                      ? 'Du loggas in...'
                      : verifying 
                        ? 'Vänta medan vi verifierar din kod'
                        : `Koden skickades till ${email}`
                    }
                  </CardDescription>
                </div>

                {/* Progress indicator */}
                <div className="flex gap-1.5 justify-center pt-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary/30" />
                  <div className="h-1.5 w-8 rounded-full bg-primary" />
                </div>
              </CardHeader>

              <CardContent className="pb-8 space-y-5">
                {/* Code input */}
                <div className="space-y-4">
                  <motion.div 
                    className="flex justify-center"
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                  >
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
                  </motion.div>

                  {/* Status message */}
                  <div className="text-center space-y-2">
                    {verifying && (
                      <motion.p 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-sm text-primary font-medium"
                      >
                        Verifierar din kod...
                      </motion.p>
                    )}
                    
                    {isNavigating && (
                      <motion.p 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-sm text-green-600 font-medium"
                      >
                        Inloggning lyckades!
                      </motion.p>
                    )}

                    {!verifying && !isNavigating && codeExpiry > 0 && (
                      <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                        <Clock className="h-3 w-3" />
                        Koden giltig i {formatTime(codeExpiry)}
                      </p>
                    )}

                    {!verifying && !isNavigating && codeExpiry === 0 && (
                      <p className="text-xs text-destructive font-medium">
                        Koden har gått ut. Begär en ny kod.
                      </p>
                    )}
                  </div>
                </div>

                {/* Error message */}
                <AnimatePresence>
                  {authError && !verifying && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="rounded-lg bg-destructive/10 border border-destructive/20 p-3"
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

                {/* Action buttons */}
                {!isNavigating && (
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={handleStartOver}
                      disabled={verifying}
                      className="flex-1"
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Ändra e-post
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={handleResendCode}
                      disabled={verifying || loading}
                      className="flex-1"
                    >
                      {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Skicka ny kod
                    </Button>
                  </div>
                )}

                {/* Help text */}
                {!verifying && !isNavigating && (
                  <p className="text-xs text-center text-muted-foreground">
                    Hittar du inte koden? Kolla i skräpposten.
                  </p>
                )}
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </div>
  );
}
