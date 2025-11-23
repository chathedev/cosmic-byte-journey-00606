import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Shield, KeyRound, AlertCircle, Sparkles, Copy, Check, Download, Smartphone } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Alert, AlertDescription } from '@/components/ui/alert';
import tivlyLogo from '@/assets/tivly-logo.png';
import QRCode from 'qrcode';
import { apiClient } from '@/lib/api';

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

// Detect if user is on mobile device
function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
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
  const { toast } = useToast();
  const { user, isLoading, refreshUser } = useAuth();

  const [email, setEmail] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('welcome');
  const [totpQrCode, setTotpQrCode] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [isMobile] = useState(isMobileDevice());
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
            setViewMode('totp');
            toast({
              title: '✓ Konfiguration klar!',
              description: 'Ange koden från din app för att logga in.',
            });
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [setupPolling, email, toast]);

  const handleCheckAuthMethods = async () => {
    const isIoDomain = window.location.hostname.includes('io.tivly.se');
    const debug = (msg: string, data?: any) => {
      const logMsg = data ? `${msg} ${JSON.stringify(data)}` : msg;
      console.log(logMsg);
      if (isIoDomain) alert(logMsg);
    };

    debug('[Auth] handleCheckAuthMethods called', { email });
    const sanitized = sanitizeEmail(email);
    
    if (!sanitized) {
      debug('[Auth] Invalid email', { email });
      toast({
        variant: 'destructive',
        title: 'Ogiltig e-postadress',
        description: 'Vänligen ange en giltig e-postadress.',
      });
      return;
    }

    debug('[Auth] Sanitized email', { sanitized });
    setLoading(true);
    
    try {
      debug('[Auth] Fetching auth methods from API...');
      const response = await fetch('https://api.tivly.se/auth/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: sanitized }),
      });

      debug('[Auth] Response status', { status: response.status });

      if (response.ok) {
        const data: AuthCheckResponse = await response.json();
        debug('[Auth] Auth methods data', data);
        const { authMethods } = data;

        if (authMethods.totp) {
          debug('[Auth] TOTP configured, showing TOTP input');
          setViewMode('totp');
        } else {
          debug('[Auth] No TOTP configured, starting setup');
          await handleStartTotpSetup();
        }
      } else if (response.status === 404) {
        debug('[Auth] User not found');
        setViewMode('new-user');
      } else {
        const errorText = await response.text();
        debug('[Auth] API error', { status: response.status, error: errorText });
        throw new Error(`API returned ${response.status}: ${errorText}`);
      }
    } catch (error: any) {
      debug('[Auth] CATCH ERROR', { message: error.message, stack: error.stack });
      toast({
        variant: 'destructive',
        title: 'Något gick fel',
        description: error.message || 'Kunde inte kontrollera autentiseringsmetoder.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopySecret = async () => {
    if (!totpSecret) return;
    
    try {
      await navigator.clipboard.writeText(totpSecret);
      setCopied(true);
      toast({
        title: '✓ Kopierat!',
        description: 'Klistra nu in koden i din autentiseringsapp.',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Kunde inte kopiera',
        description: 'Skriv av koden manuellt istället.',
      });
    }
  };

  const handleVerifyTotp = async () => {
    if (totpCode.length !== 6 || !/^\d{6}$/.test(totpCode)) {
      toast({
        variant: 'destructive',
        title: 'Ogiltig kod',
        description: 'Ange en giltig 6-siffrig kod.',
      });
      return;
    }

    const sanitized = sanitizeEmail(email);
    if (!sanitized) return;

    setLoading(true);
    
    toast({
      title: 'Verifierar kod...',
      description: 'Ett ögonblick...',
    });

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

        toast({
          title: '✓ Inloggad!',
          description: 'Omdirigerar...',
        });

        await refreshUser();
        setTimeout(() => navigate('/', { replace: true }), 300);
      } else {
        const error = await response.json();
        toast({
          variant: 'destructive',
          title: 'Ogiltig kod',
          description: error.message || 'Autentiseringen misslyckades. Kontrollera koden och försök igen.',
        });
        setTotpCode('');
      }
    } catch (error: any) {
      console.error('TOTP verification failed:', error);
      toast({
        variant: 'destructive',
        title: 'Autentisering misslyckades',
        description: 'Kontrollera din internetanslutning och försök igen.',
      });
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
      
      // Only generate QR code for desktop
      if (!isMobile) {
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
      toast({
        variant: 'destructive',
        title: 'Kunde inte starta konfiguration',
        description: 'Försök igen.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEnableTotp = async () => {
    if (totpCode.length !== 6 || !/^\d{6}$/.test(totpCode)) {
      toast({
        variant: 'destructive',
        title: 'Ogiltig kod',
        description: 'Ange en giltig 6-siffrig kod.',
      });
      return;
    }

    const sanitized = sanitizeEmail(email);
    if (!sanitized) return;

    setLoading(true);
    
    toast({
      title: 'Aktiverar autentiseringsapp...',
      description: 'Ett ögonblick...',
    });

    try {
      const response = await fetch('https://api.tivly.se/auth/totp/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: sanitized, token: totpCode }),
      });

      if (response.ok) {
        toast({
          title: '✓ Autentiseringsapp aktiverad!',
          description: 'Loggar in...',
        });
        
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
        toast({
          variant: 'destructive',
          title: 'Ogiltig verifieringskod',
          description: error.message || 'Kontrollera koden i din app och försök igen.',
        });
        setTotpCode('');
      }
    } catch (error: any) {
      console.error('TOTP enable failed:', error);
      toast({
        variant: 'destructive',
        title: 'Kunde inte aktivera TOTP',
        description: 'Kontrollera din internetanslutning och försök igen.',
      });
      setTotpCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-secondary/10" />
      
      <Card className="w-full max-w-md relative z-10 shadow-2xl border-2 backdrop-blur-sm bg-card/95">
        {viewMode === 'welcome' ? (
          <>
            <CardHeader className="space-y-6 text-center pb-8 pt-12">
              <div className="mx-auto w-32 h-32 animate-in fade-in zoom-in duration-500">
                <img src={tivlyLogo} alt="Tivly Logo" className="w-full h-full object-contain" />
              </div>
              
              <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150">
                <CardTitle className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  Välkommen till Tivly
                </CardTitle>
                <CardDescription className="text-lg">
                  Säker och enkel inloggning med autentiseringsapp
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="pb-12 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
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
          </>
        ) : (
          <>
            <CardHeader className="space-y-4 text-center pb-8">
              <div className="mx-auto w-24 h-24">
                <img src={tivlyLogo} alt="Tivly Logo" className="w-full h-full object-contain" />
              </div>
              
              <div className="space-y-2">
                 <CardTitle className="text-3xl font-bold">
                   {viewMode === 'totp' ? 'Ange verifieringskod' : 
                   viewMode === 'new-user' ? 'Välkommen!' :
                   viewMode === 'setup-totp' ? 'Konfigurera autentiseringsapp' :
                   'Logga in'}
                 </CardTitle>
                 <CardDescription className="text-base">
                   {viewMode === 'totp' ? 'Ange koden från din autentiseringsapp' :
                   viewMode === 'new-user' ? 'Inget konto hittades med denna e-postadress' :
                   viewMode === 'setup-totp' ? (isMobile ? 'Följ instruktionerna nedan' : 'Skanna QR-koden med din autentiseringsapp') :
                   'Ange din e-post för att fortsätta'}
                 </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="pb-8">
              {viewMode === 'totp' ? (
            <div className="space-y-6">
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
                    onChange={(value) => {
                      setTotpCode(value);
                      if (value.length === 6 && /^\d{6}$/.test(value)) {
                        handleVerifyTotp();
                      }
                    }}
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
                  {loading ? 'Verifierar...' : 'Verifiera'}
                </Button>
              </div>
            </div>
          ) : viewMode === 'new-user' ? (
            <div className="space-y-6">
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
            </div>
          ) : viewMode === 'setup-totp' ? (
            <div className="space-y-6">
              {/* Desktop: Show QR code */}
              {!isMobile && totpQrCode && (
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

              {/* Mobile: Show manual code with copy button and instructions */}
              {isMobile && totpSecret && (
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
                    onChange={(value) => {
                      setTotpCode(value);
                      if (value.length === 6 && /^\d{6}$/.test(value)) {
                        handleEnableTotp();
                      }
                    }}
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
                  {loading ? 'Aktiverar...' : 'Aktivera'}
                </Button>
              </div>
              
              {setupPolling && (
                <p className="text-xs text-center text-muted-foreground animate-pulse">
                  Sidan uppdateras automatiskt när konfigurationen är klar...
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-6">
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
                onClick={() => {
                  const isIoDomain = window.location.hostname.includes('io.tivly.se');
                  if (isIoDomain) alert('[Auth] Fortsätt button clicked');
                  console.log('[Auth] Fortsätt button clicked');
                  handleCheckAuthMethods();
                }}
                disabled={loading || !email.trim()}
                className="w-full h-12"
                type="button"
              >
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
            </div>
          )}
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
