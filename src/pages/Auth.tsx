import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Fingerprint, ArrowLeft, Shield, KeyRound, AlertCircle, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Alert, AlertDescription } from '@/components/ui/alert';
import tivlyLogo from '@/assets/tivly-logo.png';

/**
 * Auth - WebAuthn (Passkey) + TOTP login page
 * 
 * Implements the Tivly WebAuthn + TOTP authentication playbook:
 * - Collects email and checks available auth methods
 * - Primary: WebAuthn (Passkeys) for passwordless auth
 * - Fallback: TOTP (Authenticator apps) with 6-digit codes
 * - No passwords, SMS, or magic links
 */

// Extend Window interface for auth token
declare global {
  interface Window {
    authToken?: string;
  }
}

type AuthMethod = 'passkey' | 'totp' | null;
type ViewMode = 'welcome' | 'email' | 'totp' | 'new-user' | 'setup-required';

interface AuthCheckResponse {
  authMethods: {
    passkey: boolean;
    totp: boolean;
  };
}

// Email sanitization as per playbook
function sanitizeEmail(email: string | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return trimmed && emailRegex.test(trimmed) ? trimmed : null;
}

// Check WebAuthn support
function isWebAuthnSupported(): boolean {
  return typeof window !== 'undefined' && 
         typeof window.PublicKeyCredential !== 'undefined';
}

export default function Auth() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isLoading, refreshUser } = useAuth();

  // State management
  const [email, setEmail] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [authMethod, setAuthMethod] = useState<AuthMethod>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('welcome');
  const [webauthnAvailable, setWebauthnAvailable] = useState(false);

  // Check WebAuthn support on mount
  useEffect(() => {
    setWebauthnAvailable(isWebAuthnSupported());
  }, []);

  // Redirect if logged in
  useEffect(() => {
    if (!isLoading && user) {
      navigate('/');
    }
  }, [user, isLoading, navigate]);

  const handleCheckAuthMethods = async () => {
    const sanitized = sanitizeEmail(email);
    
    if (!sanitized) {
      toast({
        variant: 'destructive',
        title: 'Ogiltig e-postadress',
        description: 'Vänligen ange en giltig e-postadress.',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('https://api.tivly.se/auth/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: sanitized }),
      });

      if (response.ok) {
        const data: AuthCheckResponse = await response.json();
        const { authMethods } = data;

        if (authMethods.passkey && webauthnAvailable) {
          setAuthMethod('passkey');
          await handlePasskeyLogin(sanitized);
        } else if (authMethods.totp) {
          setAuthMethod('totp');
          setViewMode('totp');
        } else {
          // User exists but no auth methods configured
          setViewMode('setup-required');
        }
      } else if (response.status === 404) {
        // New user
        setViewMode('new-user');
      } else {
        throw new Error('Failed to check authentication methods');
      }
    } catch (error: any) {
      console.error('❌ Failed to check auth methods:', error);
      toast({
        variant: 'destructive',
        title: 'Något gick fel',
        description: 'Kunde inte kontrollera autentiseringsmetoder.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async (emailAddress: string) => {
    try {
      // Start WebAuthn authentication
      const startResponse = await fetch('https://api.tivly.se/auth/passkey/login/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: emailAddress }),
      });

      if (!startResponse.ok) {
        throw new Error('Failed to start passkey authentication');
      }

      const { options, challengeKey } = await startResponse.json();

      toast({
        title: 'Använd din passkey',
        description: 'Följ anvisningarna på din enhet...',
      });

      // Start WebAuthn ceremony
      const credential = await navigator.credentials.get({
        publicKey: options,
      });

      if (!credential) {
        throw new Error('No credential received');
      }

      // Finish authentication
      const finishResponse = await fetch('https://api.tivly.se/auth/passkey/login/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: emailAddress,
          credential,
          challengeKey,
        }),
      });

      if (finishResponse.ok) {
        const { token, user: userData } = await finishResponse.json();
        
        // Store token
        window.authToken = token;
        localStorage.setItem('tivly_auth_token', token);
        sessionStorage.setItem('tivly_user', JSON.stringify(userData));

        await refreshUser();
        navigate('/');
      } else {
        throw new Error('Passkey verification failed');
      }
    } catch (error: any) {
      console.error('❌ Passkey authentication failed:', error);

      if (error.name === 'NotAllowedError') {
        toast({
          variant: 'destructive',
          title: 'Autentisering avbruten',
          description: 'Passkey-autentisering avbröts eller misslyckades.',
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Autentisering misslyckades',
          description: 'Kunde inte autentisera med passkey.',
        });
      }

      // Show TOTP fallback if available
      if (authMethod === 'passkey') {
        setAuthMethod('totp');
        setViewMode('totp');
      }
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
    try {
      const response = await fetch('https://api.tivly.se/auth/totp/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: sanitized, token: totpCode }),
      });

      if (response.ok) {
        const { token, user: userData } = await response.json();
        
        // Store token
        window.authToken = token;
        localStorage.setItem('tivly_auth_token', token);
        sessionStorage.setItem('tivly_user', JSON.stringify(userData));

        await refreshUser();
        navigate('/');
      } else {
        const error = await response.json();
        toast({
          variant: 'destructive',
          title: 'Ogiltig kod',
          description: error.message || 'Autentiseringen misslyckades. Försök igen.',
        });
        setTotpCode('');
      }
    } catch (error: any) {
      console.error('❌ TOTP verification failed:', error);
      toast({
        variant: 'destructive',
        title: 'Autentisering misslyckades',
        description: 'Försök igen.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStartOver = () => {
    setViewMode('welcome');
    setEmail('');
    setTotpCode('');
    setAuthMethod(null);
  };

  const handleGetStarted = () => {
    setViewMode('email');
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-secondary/10" />
      
      <Card className="w-full max-w-md relative z-10 shadow-2xl border-2 backdrop-blur-sm bg-card/95">
        {viewMode === 'welcome' ? (
          // Welcome Screen
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
                  Säker och enkel inloggning med passkeys eller autentiseringsapp
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="pb-12 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
              <div className="space-y-4">
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-start gap-3">
                    <Fingerprint className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Lösenordsfri inloggning</p>
                      <p className="text-xs text-muted-foreground">
                        Använd Face ID, Touch ID, Windows Hello eller din autentiseringsapp
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
                   viewMode === 'setup-required' ? 'Inställning krävs' :
                   'Logga in'}
                </CardTitle>
                <CardDescription className="text-base">
                  {viewMode === 'totp' ? 'Ange koden från din autentiseringsapp' :
                   viewMode === 'new-user' ? 'Inget konto hittades med denna e-postadress' :
                   viewMode === 'setup-required' ? 'Ditt konto saknar autentiseringsmetod' :
                   'Ange din e-post för att fortsätta'}
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="pb-8">
              {viewMode === 'totp' ? (
            // TOTP code entry view
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

              {!webauthnAvailable && authMethod === 'passkey' && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Passkeys stöds inte i din webbläsare. Använd TOTP istället.
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="totp" className="text-center block">
                  Ange kod från din autentiseringsapp
                </Label>
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={totpCode}
                    onChange={(value) => {
                      setTotpCode(value);
                      // Auto-submit when 6 digits entered
                      if (value.length === 6 && /^\d{6}$/.test(value)) {
                        handleVerifyTotp();
                      }
                    }}
                    disabled={loading}
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
                <p className="text-xs text-muted-foreground text-center">
                  Använd Google Authenticator, Authy eller liknande app
                </p>
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
            // New user view
            <div className="space-y-6">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Inget konto finns med e-postadressen: <strong>{email}</strong>
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground text-center">
                  För att skapa ett konto, kontakta vår support eller be en administratör om en inbjudan.
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
          ) : viewMode === 'setup-required' ? (
            // Setup required view
            <div className="space-y-6">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Ditt konto saknar konfigurerade autentiseringsmetoder.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground text-center">
                  Kontakta support för att konfigurera passkey eller autentiseringsapp för: <strong>{email}</strong>
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
          ) : (
            // Email input view
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCheckAuthMethods();
              }}
              className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500"
            >
              <div className="space-y-2">
                <Label htmlFor="email">E-postadress</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="namn@exempel.se"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                  autoFocus
                  className="h-11"
                />
              </div>

              {!webauthnAvailable && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Passkeys stöds inte i din webbläsare. TOTP kommer användas som autentiseringsmetod.
                  </AlertDescription>
                </Alert>
              )}

              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Säker inloggning</p>
                    <p className="text-xs text-muted-foreground">
                      Vi använder passkeys eller autentiseringsappar för säker, lösenordsfri inloggning
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
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
                  type="submit" 
                  className="flex-1 h-11" 
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Shield className="w-4 h-4 mr-2 animate-spin" />
                      Kontrollerar...
                    </>
                  ) : (
                    <>
                      <Fingerprint className="w-4 h-4 mr-2" />
                      Fortsätt
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
