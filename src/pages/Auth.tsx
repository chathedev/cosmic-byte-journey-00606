import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

import { ArrowLeft, Shield, KeyRound, AlertCircle, Sparkles, Copy, Check, Download, Smartphone, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Alert, AlertDescription } from '@/components/ui/alert';
import tivlyLogo from '@/assets/tivly-logo.png';
import QRCode from 'qrcode';
import { apiClient } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Auth - TOTP-only authentication (App-based)
 * Works on both app.tivly.se and io.tivly.se domains
 */

declare global {
  interface Window {
    authToken?: string;
  }
}

type ViewMode = 'welcome' | 'email' | 'totp' | 'new-user' | 'setup-totp';

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

// Detect if user is on iPhone specifically
function isIPhone(): boolean {
  if (typeof window === 'undefined') return false;
  return /iPhone/i.test(navigator.userAgent);
}

// Generate QR code from otpauth:// URL
async function generateQRCodeFromUrl(otpauthUrl: string): Promise<string> {
  try {
    const dataUrl = await QRCode.toDataURL(otpauthUrl, {
      width: 256,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' }
    });
    return dataUrl;
  } catch (error) {
    console.error('Failed to generate QR code:', error);
    throw new Error('Could not generate QR code');
  }
}

export default function Auth() {
  const navigate = useNavigate();
  const { user, isLoading, refreshUser } = useAuth();

  const [email, setEmail] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => (isAppDomain() ? 'email' : 'welcome'));
  const [totpQrCode, setTotpQrCode] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [setupPolling, setSetupPolling] = useState(false);

  useEffect(() => {
    if (!isLoading && user) {
      navigate('/');
    }
  }, [user, isLoading, navigate]);

  // Poll for TOTP setup completion
  useEffect(() => {
    if (!setupPolling) return;

    const pollInterval = setInterval(async () => {
      const sanitized = sanitizeEmail(email);
      if (!sanitized) return;

      try {
        const response = await fetch('https://api.tivly.se/auth/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email: sanitized }),
        });

        if (response.ok) {
          const data: AuthCheckResponse = await response.json();
          if (data.authMethods.totp) {
            setSetupPolling(false);
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [setupPolling, email]);

  const handleCheckAuthMethods = async () => {
    const sanitized = sanitizeEmail(email);
    
    if (!sanitized) {
      console.error('[Auth] Invalid email:', email);
      return;
    }

    const onIoDomain = isIoDomain();

    console.log('[Auth] Email validated, checking auth methods...', { onIoDomain });
    setLoading(true);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.error('[Auth] auth/check request timed out after 10s');
        controller.abort();
      }, 10000);

      const response = await fetch('https://api.tivly.se/auth/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: sanitized }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log('[Auth] auth/check status:', response.status);

      if (response.ok) {
        const data: AuthCheckResponse = await response.json();
        const { authMethods } = data;

        if (authMethods.totp) {
          console.log('[Auth] TOTP enabled, switching to login screen');
          setViewMode('totp');
        } else {
          console.log('[Auth] No TOTP configured, starting setup');
          await handleStartTotpSetup();
        }
      } else if (response.status === 404) {
        if (onIoDomain) {
          console.log('[Auth] 404 on io.tivly.se, forcing TOTP setup flow');
          await handleStartTotpSetup();
        } else {
          console.log('[Auth] 404 on web domain, staying on email screen');
        }
      } else if (onIoDomain) {
        console.log('[Auth] Non-success response on io.tivly.se, still starting TOTP setup', {
          status: response.status,
        });
        await handleStartTotpSetup();
      } else {
        const errorText = await response.text();
        console.error('[Auth] auth/check error:', response.status, errorText);
      }
    } catch (error) {
      console.error('[Auth] Error during auth check:', error);

      if (isIoDomain()) {
        console.log('[Auth] Network error on io.tivly.se, still starting TOTP setup');
        try {
          await handleStartTotpSetup();
        } catch (setupError) {
          console.error('[Auth] Failed to start TOTP setup after error:', setupError);
        }
      }
    } finally {
      setLoading(false);
    }
  };
  const handleCopySecret = async () => {
    if (!totpSecret) return;
    
    try {
      await navigator.clipboard.writeText(totpSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy TOTP secret:', error);
    }
  };

  const handleVerifyTotp = async () => {
    if (totpCode.length !== 6 || !/^\d{6}$/.test(totpCode)) {
      return;
    }

    const sanitized = sanitizeEmail(email);
    if (!sanitized) return;

    setLoading(true);

    try {
      const response = await fetch('https://api.tivly.se/auth/totp/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: sanitized, token: totpCode }),
      });

      if (response.ok) {
        const { token } = await response.json();
        apiClient.applyAuthToken(token);


        await refreshUser();
        setTimeout(() => navigate('/', { replace: true }), 300);
      } else {
        const error = await response.json();
        console.error('Invalid TOTP code:', error);
        setTotpCode('');
      }
    } catch (error: any) {
      console.error('TOTP verification failed:', error);
      setTotpCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleStartOver = () => {
    setViewMode('welcome');
    setEmail('');
    setTotpCode('');
    setTotpQrCode(null);
    setTotpSecret(null);
    setSetupPolling(false);
  };

  const handleGetStarted = () => {
    setViewMode('email');
  };


  const handleStartTotpSetup = async () => {
    const sanitized = sanitizeEmail(email);
    if (!sanitized) return;

    setLoading(true);
    try {
      const response = await fetch('https://api.tivly.se/auth/totp/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: sanitized }),
      });

      if (!response.ok) {
        throw new Error('Failed to setup TOTP');
      }

      const { qrCode, otpauthUrl, manualEntryKey } = await response.json();
      
      // Only generate QR code for desktop/non-iPhone devices
      // Skip QR code on iPhone but show on PC/tablets/Android
      const shouldShowQR = !isIPhone();
      if (shouldShowQR) {
        if (qrCode) {
          setTotpQrCode(qrCode);
        } else if (otpauthUrl) {
          const qrCodeDataUrl = await generateQRCodeFromUrl(otpauthUrl);
          setTotpQrCode(qrCodeDataUrl);
        }
      }
      
      setTotpSecret(manualEntryKey);
      setViewMode('setup-totp');
      setSetupPolling(true);
    } catch (error: any) {
      console.error('TOTP setup failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEnableTotp = async () => {
    if (totpCode.length !== 6 || !/^\d{6}$/.test(totpCode)) {
      return;
    }

    const sanitized = sanitizeEmail(email);
    if (!sanitized) return;

    setLoading(true);

    try {
      const response = await fetch('https://api.tivly.se/auth/totp/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: sanitized, token: totpCode }),
      });

      if (response.ok) {
        
        setTimeout(async () => {
          const checkResponse = await fetch('https://api.tivly.se/auth/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email: sanitized }),
          });

          if (checkResponse.ok) {
            await handleVerifyTotp();
          } else {
            setViewMode('totp');
            setTotpCode('');
          }
        }, 500);
      } else {
        const error = await response.json();
        console.error('Invalid TOTP setup code:', error);
        setTotpCode('');
      }
    } catch (error: any) {
      console.error('TOTP enable failed:', error);
      setTotpCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-secondary/10" />
      
      <Card className="w-full max-w-md relative z-10 shadow-2xl border-2 backdrop-blur-sm bg-card/95">
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
                    Välkommen till Tivly
                  </CardTitle>
                  <CardDescription className="text-lg">
                    Säker och enkel inloggning med autentiseringsapp
                  </CardDescription>
                </motion.div>
              </CardHeader>

              <CardContent className="pb-12 space-y-6">{/* ... keep existing code */}
              <div className="space-y-4">
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-start gap-3">
                    <Smartphone className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Autentiseringsapp krävs</p>
                      <p className="text-xs text-muted-foreground">
                        Använd Google Authenticator, Microsoft Authenticator eller Authy
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-start gap-3">
                    <Shield className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Bankäker säkerhet</p>
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
                   {viewMode === 'totp' ? 'Ange verifieringskod' : 
                   viewMode === 'new-user' ? 'Välkommen!' :
                   viewMode === 'setup-totp' ? 'Konfigurera autentiseringsapp' :
                   'Logga in'}
                 </CardTitle>
                 <CardDescription className="text-base">
                   {viewMode === 'totp' ? 'Ange koden från din autentiseringsapp' :
                   viewMode === 'new-user' ? 'Inget konto hittades med denna e-postadress' :
                   viewMode === 'setup-totp' ? (isIPhone() ? 'Följ instruktionerna nedan' : 'Skanna QR-koden med din autentiseringsapp') :
                   'Ange din e-post för att fortsätta'}
                 </CardDescription>
                 
                 {/* Progress indicator */}
                 {(viewMode === 'email' || viewMode === 'setup-totp' || viewMode === 'totp') && (
                   <motion.div 
                     className="flex gap-1.5 justify-center pt-3"
                     initial={{ opacity: 0 }}
                     animate={{ opacity: 1 }}
                     transition={{ delay: 0.2 }}
                   >
                     <div className={`h-1.5 rounded-full transition-all duration-300 ${viewMode === 'email' ? 'w-8 bg-primary' : 'w-1.5 bg-primary/30'}`} />
                     <div className={`h-1.5 rounded-full transition-all duration-300 ${viewMode === 'setup-totp' ? 'w-8 bg-primary' : 'w-1.5 bg-primary/30'}`} />
                     <div className={`h-1.5 rounded-full transition-all duration-300 ${viewMode === 'totp' ? 'w-8 bg-primary' : 'w-1.5 bg-primary/30'}`} />
                   </motion.div>
                 )}
              </motion.div>
            </CardHeader>

            <CardContent className="pb-8">
              <AnimatePresence mode="wait">
                {viewMode === 'totp' ? (
              <motion.div 
                key="totp-view"
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
                <Label htmlFor="totp" className="text-center block font-medium">
                  Ange kod från din autentiseringsapp
                </Label>
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={totpCode}
                    onChange={(value) => setTotpCode(value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && totpCode.length === 6) {
                        e.preventDefault();
                        handleVerifyTotp();
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
                </div>
                <div className="text-center space-y-1">
                  <p className="text-xs text-muted-foreground">
                    Använd Google Authenticator, Authy eller liknande app
                  </p>
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
                  onClick={handleVerifyTotp}
                  disabled={loading || totpCode.length !== 6}
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
            ) : viewMode === 'setup-totp' ? (
              <motion.div 
                key="setup-totp-view"
                className="space-y-6"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
              {/* Desktop/Non-iPhone: Show QR code */}
              {!isIPhone() && totpQrCode && (
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                  <p className="text-sm text-center font-medium">Skanna QR-koden med din app</p>
                  <div className="flex justify-center">
                    <img src={totpQrCode} alt="QR Code" className="w-56 h-56" />
                  </div>
                  
                  {totpSecret && (
                    <div className="space-y-2">
                      <p className="text-xs text-center text-muted-foreground">
                        Eller ange manuellt:
                      </p>
                      <div className="rounded bg-muted p-3 text-center font-mono text-sm break-all">
                        {totpSecret}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* iPhone: Show manual code with copy button and instructions */}
              {isIPhone() && totpSecret && (
                <div className="space-y-4">
                  <Alert>
                    <Download className="h-4 w-4" />
                    <AlertDescription className="space-y-2">
                      <p className="font-medium">Steg 1: Ladda ner en autentiseringsapp</p>
                      <p className="text-xs">
                        Google Authenticator, Microsoft Authenticator eller Authy
                      </p>
                    </AlertDescription>
                  </Alert>

                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                    <p className="text-sm font-medium text-center">Steg 2: Kopiera denna kod</p>
                    <div className="rounded bg-background p-3 text-center">
                      <code className="text-sm font-mono break-all block mb-3">{totpSecret}</code>
                      <Button
                        onClick={handleCopySecret}
                        variant="outline"
                        size="sm"
                        className="w-full"
                      >
                        {copied ? (
                          <>
                            <Check className="w-4 h-4 mr-2" />
                            Kopierad!
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4 mr-2" />
                            Kopiera kod
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-center text-muted-foreground">
                      Steg 3: Klistra in i din autentiseringsapp under "Lägg till konto"
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <Label htmlFor="totp-setup" className="text-center block font-medium">
                  Ange koden från din app för att verifiera
                </Label>
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={totpCode}
                    onChange={(value) => setTotpCode(value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && totpCode.length === 6) {
                        e.preventDefault();
                        handleEnableTotp();
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
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setViewMode('email');
                    setTotpCode('');
                    setTotpQrCode(null);
                    setTotpSecret(null);
                    setSetupPolling(false);
                  }}
                  disabled={loading}
                  className="flex-1"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Tillbaka
                </Button>
                <Button
                  onClick={handleEnableTotp}
                  disabled={loading || totpCode.length !== 6}
                  className="flex-1"
                >
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {loading ? 'Aktiverar...' : 'Aktivera'}
                </Button>
              </div>
              
              {setupPolling && (
                <p className="text-xs text-center text-muted-foreground animate-pulse">
                  Sidan uppdateras automatiskt när konfigurationen är klar...
                </p>
              )}
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
                      handleCheckAuthMethods();
                    }
                  }}
                  disabled={loading}
                  autoComplete="email"
                  autoFocus
                  className="h-12"
                />
              </div>

              <Button
                onClick={handleCheckAuthMethods}
                disabled={loading || !email.trim()}
                className="w-full h-12 relative"
                type="button"
              >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {loading ? 'Kontrollerar...' : 'Fortsätt'}
              </Button>

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
