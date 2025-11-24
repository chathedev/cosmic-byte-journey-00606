import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

import { ArrowLeft, Shield, KeyRound, AlertCircle, Sparkles, Mail, Loader2, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Alert, AlertDescription } from '@/components/ui/alert';
import tivlyLogo from '@/assets/tivly-logo.png';
import { apiClient } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Auth - Email + PIN authentication
 * Works on both app.tivly.se and io.tivly.se domains
 * Users receive 6-digit codes via email
 */

declare global {
  interface Window {
    authToken?: string;
  }
}

type ViewMode = 'welcome' | 'email' | 'verify-code' | 'new-user' | 'awaiting-code';

interface AuthCheckResponse {
  authMethods: {
    totp: boolean;
  };
}

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

// Detect if running on io.tivly.se (auto-proceed to setup)
function isIoDomain(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.includes('io.tivly.se');
}

// Determine which base URL to use for auth-related backend calls
// For iOS app shell (io.tivly.se) the backend is still api.tivly.se –
// we only vary the Origin header, not the server URL.
function getAuthBaseUrl(): string {
  return 'https://api.tivly.se';
}

export default function Auth() {
  const navigate = useNavigate();
  const { user, isLoading, refreshUser } = useAuth();

  const [email, setEmail] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    // Check if user has already seen welcome screen
    const hasSeenWelcome = localStorage.getItem('tivly_seen_welcome') === 'true';
    
    // App domain or already seen welcome -> go straight to email
    if (isAppDomain() || hasSeenWelcome) {
      return 'email';
    }
    
    return 'welcome';
  });
  const [authError, setAuthError] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [codeExpiry, setCodeExpiry] = useState<number>(600); // 10 minutes in seconds
  const [platform, setPlatform] = useState<'ios' | 'web'>('web');


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
    if (viewMode !== 'awaiting-code' && viewMode !== 'verify-code') return;

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
  }, [viewMode]);

  const handleRequestCode = async () => {
    const sanitized = sanitizeEmail(email);
    setAuthError(null);
    
    if (!sanitized) {
      console.error(`[Auth] ❌ Invalid email on ${platform} platform:`, email);
      const errorMsg = platform === 'ios' 
        ? 'Ange en giltig e-postadress'
        : 'Ogiltig e-postadress. Kontrollera och försök igen.';
      setAuthError(errorMsg);
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
        const responseText = await response.text();
        console.log(`[Auth] 📥 Code request successful for ${platform}, showing verification screen`);
        
        // Reset expiry timer
        setCodeExpiry(600); // 10 minutes
        setViewMode('awaiting-code');
        setPinCode('');
      } else {
        const errorText = await response.text().catch(() => '');
        console.error(`[Auth] ❌ Code request failed (${platform}):`, response.status, response.statusText);
        const errorMsg = platform === 'ios'
          ? 'Kunde inte skicka kod. Försök igen.'
          : 'Kunde inte skicka verifieringskod. Försök igen.';
        setAuthError(errorMsg);
      }
    } catch (error) {
      console.error(`[Auth] 💥 Error requesting code (${platform}):`, error);
      const errorMsg = platform === 'ios'
        ? 'Anslutningen misslyckades. Kontrollera din internetanslutning.'
        : 'Ett nätverksfel uppstod. Kontrollera din uppkoppling och försök igen.';
      setAuthError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPin = async () => {
    if (pinCode.length !== 6 || !/^\d{6}$/.test(pinCode)) {
      return;
    }

    const sanitized = sanitizeEmail(email);
    if (!sanitized) return;

    setLoading(true);
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

      if (isIoDomain()) {
        if (response.ok) {
          console.log(`[Auth] ✅ iOS login successful (${platform}), processing response...`);

          if (responseText && responseText.trim().length > 0) {
            try {
              const data = JSON.parse(responseText);
              console.log('[Auth] 📊 Parsed login response:', { hasToken: !!data.token, hasUser: !!data.user });
              
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

          console.log('[Auth] 🚀 Redirecting to dashboard...');
          setIsNavigating(true);
          await refreshUser();
          setTimeout(() => {
            navigate('/', { replace: true });
          }, 500);
          return;
        }

        // iOS error handling - parse backend error
        console.error(`[Auth] ❌ iOS login failed (${platform}):`, response.status, response.statusText);
        console.log(`[Auth] 📥 iOS error response body:`, responseText);
        
        if (!responseText || responseText.trim() === '') {
          console.error('[Auth] Empty error response from backend (iOS)');
          setAuthError('Servern returnerade ett tomt svar. Försök igen.');
        } else {
          try {
            const error = JSON.parse(responseText);
            console.error('[Auth] iOS parsed error:', error);
            setAuthError(error.error || error.message || 'Fel kod. Försök igen eller begär en ny kod.');
          } catch (parseError) {
            console.error('[Auth] Non-JSON iOS error response:', responseText, parseError);
            setAuthError('Fel kod. Försök igen eller begär en ny kod.');
          }
        }
        setPinCode('');
        return;
      }

      // STANDARD WEB FLOW
      if (response.ok) {
        if (!responseText || responseText.trim() === '') {
          console.error('[Auth] /auth/totp/login returned empty body on success (web)');
          setAuthError('Servern returnerade ett tomt svar. Försök igen.');
          setPinCode('');
          return;
        }

        let data: { token: string };
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          console.error('[Auth] Failed to parse login response:', parseError);
          setAuthError('Ogiltigt svar från servern. Försök igen.');
          setPinCode('');
          return;
        }

        console.log('[Auth] Email + PIN login successful, applying auth token');
        apiClient.applyAuthToken(data.token);
        setIsNavigating(true);
        await refreshUser();
        setTimeout(() => {
          navigate('/', { replace: true });
        }, 500);
      } else {
        if (!responseText || responseText.trim() === '') {
          console.error('[Auth] /auth/totp/login returned empty error body (web)');
          setAuthError('Ogiltig kod. Kontrollera att du angav rätt 6-siffrig kod från din e-post.');
          setPinCode('');
          return;
        }

        try {
          const error = JSON.parse(responseText);
          console.error('[Auth] Login error:', error);
          setAuthError(error.error || error.message || 'Ogiltig kod. Försök igen.');
        } catch {
          console.error('[Auth] Non-JSON error response:', responseText);
          setAuthError('Ogiltig kod. Kontrollera att du angav rätt 6-siffrig kod från din e-post.');
        }
        setPinCode('');
      }
    } catch (error: any) {
      console.error('[Auth] PIN verification failed:', error);
      setAuthError('Ett nätverksfel uppstod. Kontrollera din uppkoppling och försök igen.');
      setPinCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleStartOver = () => {
    setViewMode('welcome');
    setEmail('');
    setPinCode('');
    setCodeExpiry(600);
  };

  const handleGetStarted = () => {
    localStorage.setItem('tivly_seen_welcome', 'true');
    setViewMode('email');
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
      {/* Animated background with gradient orbs */}
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
      
      <Card className="w-full max-w-md relative z-10 shadow-2xl border-2 backdrop-blur-xl bg-card/98 hover:shadow-primary/10 hover:shadow-3xl transition-all duration-300">
        <AnimatePresence mode="wait">
          {viewMode === 'welcome' ? (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <CardHeader className="space-y-6 text-center pb-8 pt-12">
                <motion.div 
                  className="mx-auto w-32 h-32"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1, duration: 0.4 }}
                >
                  <img src={tivlyLogo} alt="Tivly Logo" className="w-full h-full object-contain" />
                </motion.div>
                
                <motion.div 
                  className="space-y-3"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.4 }}
                >
                  <CardTitle className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                    {platform === 'ios' ? 'Välkommen till Tivly' : 'Välkommen till Tivly'}
                  </CardTitle>
                  <CardDescription className="text-lg">
                    {platform === 'ios' 
                      ? 'Din smarta mötesassistent med AI - optimerad för iOS'
                      : 'Säker och enkel inloggning med e-postkod'}
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
        ) : (
          <motion.div
            key={viewMode}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
          >
            <CardHeader className="space-y-4 text-center pb-8">
              <motion.div 
                className="mx-auto w-24 h-24"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <img src={tivlyLogo} alt="Tivly Logo" className="w-full h-full object-contain" />
              </motion.div>
              
              <motion.div 
                className="space-y-2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.3 }}
              >
                 <CardTitle className="text-3xl font-bold">
                   {viewMode === 'verify-code' ? (platform === 'ios' ? 'Verifiera din kod' : 'Ange verifieringskod') : 
                   viewMode === 'awaiting-code' ? 'Kolla din e-post' :
                   viewMode === 'new-user' ? 'Välkommen!' :
                   (platform === 'ios' ? 'Logga in i Tivly' : 'Logga in')}
                 </CardTitle>
                 <CardDescription className="text-base">
                   {viewMode === 'verify-code' ? (
                     platform === 'ios' 
                       ? `Ange den 6-siffriga koden från ditt e-postmeddelande`
                       : 'Ange koden från din e-post'
                   ) :
                   viewMode === 'awaiting-code' ? 'Vi har skickat en 6-siffrig kod till din e-post' :
                   viewMode === 'new-user' ? 'Inget konto hittades med denna e-postadress' :
                   (platform === 'ios' 
                     ? 'Ange din e-postadress så skickar vi en 6-siffrig kod'
                     : 'Ange din e-post för att fortsätta')}
                 </CardDescription>
                 
                 {/* Progress indicator */}
                 {(viewMode === 'email' || viewMode === 'awaiting-code' || viewMode === 'verify-code') && (
                   <motion.div 
                     className="flex gap-1.5 justify-center pt-3"
                     initial={{ opacity: 0 }}
                     animate={{ opacity: 1 }}
                     transition={{ delay: 0.2 }}
                   >
                     <div className={`h-1.5 rounded-full transition-all duration-300 ${viewMode === 'email' ? 'w-8 bg-primary' : 'w-1.5 bg-primary/30'}`} />
                     <div className={`h-1.5 rounded-full transition-all duration-300 ${viewMode === 'awaiting-code' ? 'w-8 bg-primary' : 'w-1.5 bg-primary/30'}`} />
                     <div className={`h-1.5 rounded-full transition-all duration-300 ${viewMode === 'verify-code' ? 'w-8 bg-primary' : 'w-1.5 bg-primary/30'}`} />
                   </motion.div>
                 )}
              </motion.div>
            </CardHeader>

            <CardContent className="pb-8">
              <AnimatePresence mode="wait">
                {viewMode === 'verify-code' ? (
              <motion.div 
                key="verify-code-view"
                className="space-y-6"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex items-start gap-3">
                  <KeyRound className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium">E-postadress:</p>
                    <p className="text-sm text-muted-foreground">{email}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label htmlFor="pin" className="text-center block font-medium">
                  Ange 6-siffrig kod från din e-post
                </Label>
                <motion.div 
                  className="flex justify-center"
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1 }}
                >
                  <InputOTP
                    maxLength={6}
                    value={pinCode}
                    onChange={(value) => setPinCode(value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && pinCode.length === 6) {
                        e.preventDefault();
                        handleVerifyPin();
                      }
                    }}
                    disabled={loading}
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
                <div className="text-center space-y-1">
                  <p className="text-xs text-muted-foreground">
                    Kolla din inkorg efter koden
                  </p>
                  {codeExpiry > 0 && (
                    <p className="text-xs text-primary font-medium flex items-center justify-center gap-1">
                      <Clock className="h-3 w-3" />
                      Giltig i {Math.floor(codeExpiry / 60)}:{String(codeExpiry % 60).padStart(2, '0')}
                    </p>
                  )}
                  {loading && (
                    <p className="text-xs text-primary font-medium animate-pulse">
                      Verifierar kod...
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={handleStartOver}
                  disabled={loading}
                  className="flex-1"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Tillbaka
                </Button>
                <Button
                  onClick={handleVerifyPin}
                  disabled={loading || pinCode.length !== 6}
                  className="flex-1"
                >
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {loading ? 'Verifierar...' : 'Verifiera'}
                </Button>
              </div>
              </motion.div>
            ) : viewMode === 'new-user' ? (
              <motion.div 
                key="new-user-view"
                className="space-y-6"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Inget konto finns med e-postadressen: <strong>{email}</strong>
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground text-center">
                  Kontakta administratören för att få tillgång till systemet.
                </p>
              </div>

              <Button
                variant="outline"
                onClick={handleStartOver}
                className="w-full"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Tillbaka
              </Button>
              </motion.div>
            ) : viewMode === 'awaiting-code' ? (
              <motion.div 
                key="awaiting-code-view"
                className="space-y-6"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
              <motion.div 
                className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3 text-center"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                >
                  <Mail className="h-12 w-12 mx-auto text-primary" />
                </motion.div>
                <motion.div 
                  className="space-y-2"
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <p className="font-medium">E-post skickad!</p>
                  <p className="text-sm text-muted-foreground">
                    Vi har skickat en 6-siffrig verifieringskod till:
                  </p>
                  <p className="text-sm font-medium">{email}</p>
                </motion.div>
              </motion.div>

              <Alert>
                <Clock className="h-4 w-4" />
                <AlertDescription className="space-y-1">
                  <p className="font-medium">Koden är giltig i 10 minuter</p>
                  <p className="text-xs">
                    Hittar du inte e-posten? Kolla i skräpposten också.
                  </p>
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <Label htmlFor="pin-await" className="text-center block font-medium">
                  Ange 6-siffrig kod från din e-post
                </Label>
                <motion.div 
                  className="flex justify-center"
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <InputOTP
                    maxLength={6}
                    value={pinCode}
                    onChange={(value) => {
                      setPinCode(value);
                      if (value.length === 6) {
                        setViewMode('verify-code');
                      }
                    }}
                    disabled={loading}
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
                {codeExpiry > 0 && (
                  <p className="text-xs text-center text-primary font-medium flex items-center justify-center gap-1">
                    <Clock className="h-3 w-3" />
                    Giltig i {Math.floor(codeExpiry / 60)}:{String(codeExpiry % 60).padStart(2, '0')}
                  </p>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={handleStartOver}
                  disabled={loading}
                  className="flex-1"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Avbryt
                </Button>
                <Button
                  onClick={handleRequestCode}
                  variant="ghost"
                  disabled={loading}
                  className="flex-1"
                >
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Skicka ny kod
                </Button>
              </div>
              </motion.div>
            ) : (
              <motion.div 
                key="email-view"
                className="space-y-6"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
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

              {authError && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg bg-destructive/10 border border-destructive/20 p-3"
                >
                  <p className="text-sm text-destructive text-center font-medium">
                    {authError}
                  </p>
                </motion.div>
              )}

              <Button
                variant="ghost"
                onClick={handleStartOver}
                className="w-full"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Tillbaka
              </Button>
              </motion.div>
            )}
              </AnimatePresence>
            </CardContent>
          </motion.div>
        )}
        </AnimatePresence>
      </Card>
    </div>
  );
}
