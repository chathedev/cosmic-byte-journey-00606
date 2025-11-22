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
import QRCode from 'qrcode';

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
type ViewMode = 'welcome' | 'email' | 'totp' | 'new-user' | 'setup-required' | 'setup-totp' | 'passkey-setup';

interface AuthCheckResponse {
  authMethods: {
    passkey: boolean;
    totp: boolean;
  };
  preferredMethod?: 'passkey' | 'totp';
}

// Email sanitization as per playbook
function sanitizeEmail(email: string | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return trimmed && emailRegex.test(trimmed) ? trimmed : null;
}

// Base64URL to ArrayBuffer conversion (Playbook requirement)
function base64UrlToArrayBuffer(input: string): ArrayBuffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Buffer JSON to ArrayBuffer (for legacy format)
function bufferJSONToArrayBuffer(bufferJson: any): ArrayBuffer | null {
  if (!bufferJson) return null;
  const { data } = bufferJson;
  if (!Array.isArray(data)) return null;
  return new Uint8Array(data).buffer;
}

// Decode encoded WebAuthn options (base64url format)
function decodeEncodedWebAuthnOptions(options: any): any {
  if (!options) return null;
  
  const decodeDescriptor = (descriptor: any) => ({
    ...descriptor,
    id: base64UrlToArrayBuffer(descriptor.id),
  });
  
  const decoded: any = {
    ...options,
    challenge: base64UrlToArrayBuffer(options.challenge),
    user: options.user
      ? {
          ...options.user,
          id: base64UrlToArrayBuffer(options.user.id),
        }
      : undefined,
  };
  
  if (Array.isArray(options.excludeCredentials)) {
    decoded.excludeCredentials = options.excludeCredentials.map(decodeDescriptor);
  }
  if (Array.isArray(options.allowCredentials)) {
    decoded.allowCredentials = options.allowCredentials.map(decodeDescriptor);
  }
  
  return decoded;
}

// Decode legacy WebAuthn options (buffer JSON format)
function decodeLegacyWebAuthnOptions(options: any): any {
  if (!options) return null;
  
  const decodeDescriptor = (descriptor: any) => ({
    ...descriptor,
    id: bufferJSONToArrayBuffer(descriptor.id),
  });
  
  const decoded: any = {
    ...options,
    challenge: bufferJSONToArrayBuffer(options.challenge),
    user: options.user
      ? {
          ...options.user,
          id: bufferJSONToArrayBuffer(options.user.id),
        }
      : undefined,
  };
  
  if (Array.isArray(options.excludeCredentials)) {
    decoded.excludeCredentials = options.excludeCredentials.map(decodeDescriptor);
  }
  if (Array.isArray(options.allowCredentials)) {
    decoded.allowCredentials = options.allowCredentials.map(decodeDescriptor);
  }
  
  return decoded;
}

// Resolve public key options - handles both encoded and legacy formats (Playbook)
function resolvePublicKeyOptions({ options, optionsEncoded }: { options?: any; optionsEncoded?: any }): any {
  if (optionsEncoded) return decodeEncodedWebAuthnOptions(optionsEncoded);
  return decodeLegacyWebAuthnOptions(options);
}

// Check WebAuthn support
function isWebAuthnSupported(): boolean {
  return typeof window !== 'undefined' && 
         typeof window.PublicKeyCredential !== 'undefined';
}

// Generate QR code from otpauth:// URL
async function generateQRCodeFromUrl(otpauthUrl: string): Promise<string> {
  try {
    const dataUrl = await QRCode.toDataURL(otpauthUrl, {
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
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

  // State management
  const [email, setEmail] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [authMethod, setAuthMethod] = useState<AuthMethod>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('welcome');
  const [webauthnAvailable, setWebauthnAvailable] = useState(false);
  const [totpQrCode, setTotpQrCode] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [preferredMethod, setPreferredMethod] = useState<'passkey' | 'totp'>('passkey');

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
        const { authMethods, preferredMethod: preferred } = data;

        // Store preferred method for setup flow
        if (preferred) {
          setPreferredMethod(preferred);
        }

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

      const data = await startResponse.json();
      const { options, optionsEncoded, challengeKey, error } = data;

      if ((!options && !optionsEncoded) || (!options?.challenge && !optionsEncoded?.challenge)) {
        console.error('❌ Ogiltiga WebAuthn-inloggningsdata från servern:', data);
        throw new Error(error || 'Kunde inte starta passkey-autentisering. Försök igen senare.');
      }

      toast({
        title: 'Använd din passkey',
        description: 'Följ anvisningarna på din enhet...',
      });

      // Decode WebAuthn options and start ceremony (supports both formats)
      const publicKey = resolvePublicKeyOptions({ options, optionsEncoded });
      const credential = await navigator.credentials.get({
        publicKey,
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
    
    // Show verifying feedback
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
        const { token, user: userData } = await response.json();
        
        // Store token in multiple places for reliability
        window.authToken = token;
        localStorage.setItem('tivly_auth_token', token);
        sessionStorage.setItem('tivly_user', JSON.stringify(userData));

        // Success feedback
        toast({
          title: '✓ Inloggad!',
          description: 'Omdirigerar...',
        });

        // Refresh user context
        await refreshUser();
        
        // Navigate to home with a small delay for smooth transition
        setTimeout(() => {
          navigate('/', { replace: true });
        }, 300);
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
      console.error('❌ TOTP verification failed:', error);
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
    setAuthMethod(null);
  };

  const handleGetStarted = () => {
    setViewMode('email');
  };

  const handleStartPasskeySetup = async () => {
    const sanitized = sanitizeEmail(email);
    if (!sanitized) return;

    setLoading(true);
    setViewMode('passkey-setup');
    
    try {
      // Start passkey registration
      const startResponse = await fetch('https://api.tivly.se/auth/passkey/register/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: sanitized }),
      });

      if (!startResponse.ok) {
        throw new Error('Failed to start passkey registration');
      }

      const data = await startResponse.json();
      const { options, optionsEncoded, challengeKey, error } = data;

      if ((!options && !optionsEncoded) || (!options?.challenge && !optionsEncoded?.challenge)) {
        console.error('❌ Ogiltiga WebAuthn-registreringsdata från servern:', data);
        throw new Error(error || 'Servern kunde inte skapa passkey-inställningar. Försök igen senare.');
      }

      toast({
        title: 'Skapa din passkey',
        description: 'Följ anvisningarna på din enhet...',
      });

      // Decode WebAuthn options and start registration (supports both formats)
      const publicKey = resolvePublicKeyOptions({ options, optionsEncoded });
      const credential = await navigator.credentials.create({
        publicKey,
      });

      if (!credential) {
        throw new Error('No credential created');
      }

      // Finish registration
      const finishResponse = await fetch('https://api.tivly.se/auth/passkey/register/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: sanitized,
          credential,
          challengeKey,
        }),
      });

      if (finishResponse.ok) {
        toast({
          title: 'Passkey skapad!',
          description: 'Loggar in...',
        });
        
        // Auto-login after successful registration
        await handlePasskeyLogin(sanitized);
      } else {
        throw new Error('Passkey registration failed');
      }
    } catch (error: any) {
      console.error('❌ Passkey registration failed:', error);
      
      if (error.name === 'NotAllowedError') {
        toast({
          variant: 'destructive',
          title: 'Registrering avbruten',
          description: 'Passkey-skapandet avbröts.',
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Kunde inte skapa passkey',
          description: 'Försök igen eller välj autentiseringsapp istället.',
        });
      }
      setViewMode('setup-required');
    } finally {
      setLoading(false);
    }
  };

  const handleStartTotpSetup = async () => {
    const sanitized = sanitizeEmail(email);
    if (!sanitized) return;

    setLoading(true);
    try {
      // Get TOTP setup QR code
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
      
      // Handle both QR code formats: base64 image or otpauth:// URL
      if (qrCode) {
        // If it's a data URL or direct base64, use as-is
        setTotpQrCode(qrCode);
      } else if (otpauthUrl) {
        // Convert otpauth URL to QR code using a QR code generator
        // For now, we'll generate a simple QR code data URL
        const qrCodeDataUrl = await generateQRCodeFromUrl(otpauthUrl);
        setTotpQrCode(qrCodeDataUrl);
      }
      
      setTotpSecret(manualEntryKey);
      setViewMode('setup-totp');
    } catch (error: any) {
      console.error('❌ TOTP setup failed:', error);
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
    
    // Show enabling feedback
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
        // Success feedback
        toast({
          title: '✓ Autentiseringsapp aktiverad!',
          description: 'Loggar in...',
        });
        
        // Small delay before auto-login for better UX
        setTimeout(async () => {
          // Re-check auth methods to confirm TOTP is now enabled
          const checkResponse = await fetch('https://api.tivly.se/auth/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email: sanitized }),
          });

          if (checkResponse.ok) {
            // Now perform TOTP login
            await handleVerifyTotp();
          } else {
            // Fallback: switch to TOTP view for manual login
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
      console.error('❌ TOTP enable failed:', error);
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
                   viewMode === 'setup-required' ? 'Välj autentiseringsmetod' :
                   viewMode === 'setup-totp' ? 'Konfigurera autentiseringsapp' :
                   viewMode === 'passkey-setup' ? 'Skapar passkey...' :
                   'Logga in'}
                 </CardTitle>
                 <CardDescription className="text-base">
                   {viewMode === 'totp' ? 'Ange koden från din autentiseringsapp' :
                   viewMode === 'new-user' ? 'Inget konto hittades med denna e-postadress' :
                   viewMode === 'setup-required' ? 'Välj hur du vill logga in' :
                   viewMode === 'setup-totp' ? 'Skanna QR-koden med din autentiseringsapp' :
                   viewMode === 'passkey-setup' ? 'Följ anvisningarna på din enhet' :
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
                      // Auto-submit when 6 digits entered
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
            // Setup required view - Let user configure auth method
            <div className="space-y-6">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Ditt konto saknar autentiseringsmetod för <strong>{email}</strong>
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                {webauthnAvailable ? (
                  <>
                    {/* Show passkey as primary if preferred or available */}
                    <button
                      onClick={handleStartPasskeySetup}
                      disabled={loading}
                      className={`w-full p-4 rounded-lg border-2 transition-all text-left group ${
                        preferredMethod === 'passkey' 
                          ? 'border-primary/20 hover:border-primary/40 bg-primary/5 hover:bg-primary/10' 
                          : 'border-border hover:border-primary/40 bg-muted/30 hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Fingerprint className="h-6 w-6 text-primary flex-shrink-0 mt-1 group-hover:scale-110 transition-transform" />
                        <div className="flex-1 space-y-1">
                          <p className="font-medium">
                            Skapa Passkey {preferredMethod === 'passkey' && '(Rekommenderat)'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Använd Face ID, Touch ID eller Windows Hello för snabb och säker inloggning
                          </p>
                        </div>
                      </div>
                    </button>

                    {/* TOTP option */}
                    <button
                      onClick={handleStartTotpSetup}
                      disabled={loading}
                      className={`w-full p-4 rounded-lg border-2 transition-all text-left group ${
                        preferredMethod === 'totp' 
                          ? 'border-primary/20 hover:border-primary/40 bg-primary/5 hover:bg-primary/10' 
                          : 'border-border hover:border-primary/40 bg-muted/30 hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <KeyRound className="h-6 w-6 text-primary flex-shrink-0 mt-1 group-hover:scale-110 transition-transform" />
                        <div className="flex-1 space-y-1">
                          <p className="font-medium">
                            Använd Autentiseringsapp {preferredMethod === 'totp' && '(Rekommenderat)'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Koppla Google Authenticator, Authy eller annan TOTP-app
                          </p>
                        </div>
                      </div>
                    </button>
                  </>
                ) : (
                  // Only TOTP available when WebAuthn not supported
                  <button
                    onClick={handleStartTotpSetup}
                    disabled={loading}
                    className="w-full p-4 rounded-lg border-2 border-primary/20 hover:border-primary/40 bg-primary/5 hover:bg-primary/10 transition-all text-left group"
                  >
                    <div className="flex items-start gap-3">
                      <KeyRound className="h-6 w-6 text-primary flex-shrink-0 mt-1 group-hover:scale-110 transition-transform" />
                      <div className="flex-1 space-y-1">
                        <p className="font-medium">Använd Autentiseringsapp</p>
                        <p className="text-sm text-muted-foreground">
                          Koppla Google Authenticator, Authy eller annan TOTP-app
                        </p>
                      </div>
                    </div>
                  </button>
                )}
              </div>

              <div className="pt-2 text-center">
                <a 
                  href="https://docs.tivly.se/support/authentication" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  Behöver du hjälp?
                </a>
              </div>

              <Button
                variant="outline"
                onClick={handleStartOver}
                disabled={loading}
                className="w-full"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Tillbaka
              </Button>
            </div>
          ) : viewMode === 'setup-totp' ? (
            // TOTP Setup view
            <div className="space-y-6">
              <div className="space-y-4">
                {(totpQrCode || totpSecret) ? (
                  <div className="flex flex-col items-center space-y-4">
                    {totpQrCode && (
                      <div className="bg-white p-6 rounded-xl shadow-lg border-2 border-primary/10">
                        <img 
                          src={totpQrCode} 
                          alt="TOTP QR Code" 
                          className="w-56 h-56 rounded-lg"
                          onError={(e) => {
                            console.error('QR code failed to load');
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                    
                    {totpSecret && (
                      <div className="w-full text-center space-y-2 bg-muted/50 p-4 rounded-lg border border-border">
                        <p className="text-sm font-medium text-foreground">Eller ange koden manuellt:</p>
                        <code className="text-xs bg-background px-4 py-2 rounded block font-mono break-all text-primary">
                          {totpSecret}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(totpSecret);
                            toast({
                              title: 'Kopierad!',
                              description: 'Hemlig nyckel kopierad till urklipp',
                            });
                          }}
                          className="text-xs text-primary hover:underline"
                        >
                          Kopiera nyckel
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                  </div>
                )}

                <Alert className="bg-primary/5 border-primary/20">
                  <AlertCircle className="h-4 w-4 text-primary" />
                  <AlertDescription className="text-xs space-y-2">
                    <div className="font-medium text-foreground">Så här gör du:</div>
                    <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                      <li>Öppna Google Authenticator, Authy eller liknande app</li>
                      <li>Skanna QR-koden ovan eller ange den manuella nyckeln</li>
                      <li>Ange den 6-siffriga koden nedan för att verifiera</li>
                    </ol>
                  </AlertDescription>
                </Alert>
              </div>

              <div className="space-y-3">
                <Label htmlFor="totp-verify" className="text-center block font-medium">
                  Ange verifieringskod från din app
                </Label>
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={totpCode}
                    onChange={(value) => {
                      setTotpCode(value);
                      // Auto-submit when 6 digits entered
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
                <div className="text-center space-y-1">
                  <p className="text-xs text-muted-foreground">
                    Koden uppdateras var 30:e sekund
                  </p>
                  {loading && (
                    <p className="text-xs text-primary font-medium animate-pulse">
                      Aktiverar och loggar in...
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setViewMode('setup-required');
                    setTotpCode('');
                    setTotpQrCode(null);
                    setTotpSecret(null);
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
                  {loading ? 'Verifierar...' : 'Aktivera'}
                </Button>
              </div>
            </div>
          ) : viewMode === 'passkey-setup' ? (
            // Passkey setup in progress view
            <div className="space-y-6">
              <div className="flex flex-col items-center space-y-4 py-8">
                <Fingerprint className="h-16 w-16 text-primary animate-pulse" />
                <p className="text-center text-muted-foreground">
                  Följ anvisningarna på din enhet för att skapa din passkey...
                </p>
              </div>

              <Button
                variant="outline"
                onClick={() => setViewMode('setup-required')}
                disabled={loading}
                className="w-full"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Avbryt
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
