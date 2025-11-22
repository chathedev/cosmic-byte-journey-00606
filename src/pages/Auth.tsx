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
import { apiClient } from '@/lib/api';

/**
 * Auth - WebAuthn (Passkey) + TOTP login page
 * Implements the Tivly authentication playbook
 */

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

// Email sanitization
function sanitizeEmail(email: string | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return trimmed && emailRegex.test(trimmed) ? trimmed : null;
}

// Base64URL to ArrayBuffer (Playbook spec)
function base64ToArrayBuffer(value: string | null | undefined): ArrayBuffer | null {
  if (!value) return null;
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(normalized), (c) => c.charCodeAt(0));
    return bytes.buffer;
  } catch (error) {
    console.error('Failed to decode base64url:', error);
    return null;
  }
}

// Buffer JSON to ArrayBuffer (Playbook spec)
function bufferJsonToArrayBuffer(bufferJson: any): ArrayBuffer | null {
  if (!bufferJson?.data) return null;
  if (!Array.isArray(bufferJson.data)) return null;
  return new Uint8Array(bufferJson.data).buffer;
}

// Decode WebAuthn options - handles all formats (Playbook spec)
function decodeWebAuthnOptions({ publicKey, publicKeyLegacy, options, optionsEncoded }: {
  publicKey?: any;
  publicKeyLegacy?: any;
  options?: any;
  optionsEncoded?: any;
}): any {
  const source = optionsEncoded || publicKey || options;
  
  if (source) {
    // Base64-encoded format
    const decodeDescriptor = (descriptor: any) => ({
      ...descriptor,
      id: base64ToArrayBuffer(descriptor.id),
    });
    
    return {
      ...source,
      challenge: base64ToArrayBuffer(source.challenge),
      user: source.user ? { ...source.user, id: base64ToArrayBuffer(source.user.id) } : undefined,
      excludeCredentials: (source.excludeCredentials || []).map(decodeDescriptor).filter((d: any) => d.id),
      allowCredentials: (source.allowCredentials || []).map(decodeDescriptor).filter((d: any) => d.id),
    };
  }
  
  // Legacy buffer-json format
  const legacy = publicKeyLegacy || options;
  if (!legacy) return null;
  
  const decodeLegacy = (descriptor: any) => ({
    ...descriptor,
    id: bufferJsonToArrayBuffer(descriptor.id),
  });
  
  return {
    ...legacy,
    challenge: bufferJsonToArrayBuffer(legacy.challenge),
    user: legacy.user ? { ...legacy.user, id: bufferJsonToArrayBuffer(legacy.user.id) } : undefined,
    excludeCredentials: (legacy.excludeCredentials || []).map(decodeLegacy).filter((d: any) => d.id),
    allowCredentials: (legacy.allowCredentials || []).map(decodeLegacy).filter((d: any) => d.id),
  };
}

// Check WebAuthn support
function isWebAuthnSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined';
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
  const [authMethod, setAuthMethod] = useState<AuthMethod>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('welcome');
  const [webauthnAvailable, setWebauthnAvailable] = useState(false);
  const [totpQrCode, setTotpQrCode] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [preferredMethod, setPreferredMethod] = useState<'passkey' | 'totp'>('passkey');

  useEffect(() => {
    setWebauthnAvailable(isWebAuthnSupported());
  }, []);

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
          setViewMode('setup-required');
        }
      } else if (response.status === 404) {
        setViewMode('new-user');
      } else {
        throw new Error('Failed to check authentication methods');
      }
    } catch (error: any) {
      console.error('Failed to check auth methods:', error);
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

      console.log('🔍 RAW LOGIN DATA:', {
        hasOptions: !!data.options,
        hasOptionsEncoded: !!data.optionsEncoded,
        hasOptionsLegacy: !!data.optionsLegacy,
        hasPublicKey: !!data.publicKey,
        hasPublicKeyLegacy: !!data.publicKeyLegacy,
        optionsChallengeType: data.options?.challenge ? typeof data.options.challenge : 'none',
        publicKeyChallengeType: data.publicKey?.challenge ? typeof data.publicKey.challenge : 'none',
      });

      if (!data.options && !data.optionsEncoded && !data.optionsLegacy && !data.publicKey && !data.publicKeyLegacy) {
        throw new Error(data.error || 'Kunde inte starta passkey-autentisering');
      }

      toast({
        title: 'Använd din passkey',
        description: 'Följ anvisningarna på din enhet...',
      });

      const publicKeyOptions = decodeWebAuthnOptions(data);

      console.log('🔍 LOGIN DECODED OPTIONS:', {
        hasOptions: !!publicKeyOptions,
        hasChallenge: !!publicKeyOptions?.challenge,
        challengeIsArrayBuffer: publicKeyOptions?.challenge instanceof ArrayBuffer,
      });

      if (!publicKeyOptions || !publicKeyOptions.challenge) {
        console.error('❌ LOGIN DECODE FAILED - publicKeyOptions:', publicKeyOptions);
        throw new Error('Kunde inte tolka WebAuthn-inställningar från servern');
      }

      const credential = await navigator.credentials.get({
        publicKey: publicKeyOptions,
      });

      if (!credential) {
        throw new Error('No credential received');
      }

      const finishResponse = await fetch('https://api.tivly.se/auth/passkey/login/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: emailAddress,
          credential,
          challengeKey: data.challengeKey,
        }),
      });

      if (finishResponse.ok) {
        const { token } = await finishResponse.json();
        apiClient.applyAuthToken(token);

        toast({
          title: '✓ Passkey verifierad!',
          description: 'Loggar in...',
        });

        await refreshUser();
        setTimeout(() => navigate('/', { replace: true }), 300);
      } else {
        throw new Error('Passkey verification failed');
      }
    } catch (error: any) {
      console.error('Passkey authentication failed:', error);

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

      console.log('🔍 RAW SERVER DATA:', {
        hasOptions: !!data.options,
        hasOptionsEncoded: !!data.optionsEncoded,
        hasOptionsLegacy: !!data.optionsLegacy,
        hasPublicKey: !!data.publicKey,
        hasPublicKeyLegacy: !!data.publicKeyLegacy,
        optionsType: data.options ? typeof data.options : 'none',
        publicKeyType: data.publicKey ? typeof data.publicKey : 'none',
        optionsChallengeType: data.options?.challenge ? typeof data.options.challenge : 'none',
        publicKeyChallengeType: data.publicKey?.challenge ? typeof data.publicKey.challenge : 'none',
        optionsEncodedChallengeType: data.optionsEncoded?.challenge ? typeof data.optionsEncoded.challenge : 'none',
      });

      if (!data.options && !data.optionsEncoded && !data.optionsLegacy && !data.publicKey && !data.publicKeyLegacy) {
        throw new Error(data.error || 'Servern kunde inte skapa passkey-inställningar');
      }

      toast({
        title: 'Skapa din passkey',
        description: 'Följ anvisningarna på din enhet...',
      });

      const publicKeyOptions = decodeWebAuthnOptions(data);

      console.log('🔍 DECODED OPTIONS:', {
        hasOptions: !!publicKeyOptions,
        hasChallenge: !!publicKeyOptions?.challenge,
        challengeType: publicKeyOptions?.challenge ? typeof publicKeyOptions.challenge : 'none',
        challengeIsArrayBuffer: publicKeyOptions?.challenge instanceof ArrayBuffer,
        challengeByteLength: publicKeyOptions?.challenge instanceof ArrayBuffer ? publicKeyOptions.challenge.byteLength : 0,
      });

      if (!publicKeyOptions || !publicKeyOptions.challenge) {
        console.error('❌ DECODE FAILED - publicKeyOptions:', publicKeyOptions);
        throw new Error('Kunde inte tolka WebAuthn-inställningar från servern');
      }

      const credential = await navigator.credentials.create({
        publicKey: publicKeyOptions,
      });

      if (!credential) {
        throw new Error('No credential created');
      }

      const finishResponse = await fetch('https://api.tivly.se/auth/passkey/register/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: sanitized,
          credential,
          challengeKey: data.challengeKey,
        }),
      });

      if (finishResponse.ok) {
        toast({
          title: 'Passkey skapad!',
          description: 'Loggar in...',
        });
        
        await handlePasskeyLogin(sanitized);
      } else {
        throw new Error('Passkey registration failed');
      }
    } catch (error: any) {
      console.error('Passkey registration failed:', error);
      
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
      
      if (qrCode) {
        setTotpQrCode(qrCode);
      } else if (otpauthUrl) {
        const qrCodeDataUrl = await generateQRCodeFromUrl(otpauthUrl);
        setTotpQrCode(qrCodeDataUrl);
      }
      
      setTotpSecret(manualEntryKey);
      setViewMode('setup-totp');
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
          ) : viewMode === 'setup-required' ? (
            <div className="space-y-6">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Du behöver välja en autentiseringsmetod för att fortsätta.
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                {webauthnAvailable && (
                  <Button
                    onClick={handleStartPasskeySetup}
                    disabled={loading}
                    className="w-full h-14 flex items-center gap-3 justify-start px-6"
                    variant={preferredMethod === 'passkey' ? 'default' : 'outline'}
                  >
                    <Fingerprint className="h-6 w-6 flex-shrink-0" />
                    <div className="flex-1 text-left">
                      <div className="font-medium">Passkey</div>
                      <div className="text-xs opacity-80">Face ID, Touch ID eller Windows Hello</div>
                    </div>
                  </Button>
                )}

                <Button
                  onClick={handleStartTotpSetup}
                  disabled={loading}
                  className="w-full h-14 flex items-center gap-3 justify-start px-6"
                  variant={preferredMethod === 'totp' ? 'default' : 'outline'}
                >
                  <KeyRound className="h-6 w-6 flex-shrink-0" />
                  <div className="flex-1 text-left">
                    <div className="font-medium">Autentiseringsapp</div>
                    <div className="text-xs opacity-80">Google Authenticator, Authy eller liknande</div>
                  </div>
                </Button>
              </div>

              <Button
                variant="ghost"
                onClick={handleStartOver}
                className="w-full"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Tillbaka
              </Button>
            </div>
          ) : viewMode === 'setup-totp' ? (
            <div className="space-y-6">
              {totpQrCode && (
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                  <div className="flex justify-center">
                    <img src={totpQrCode} alt="QR Code" className="w-48 h-48" />
                  </div>
                  
                  {totpSecret && (
                    <div className="space-y-2">
                      <p className="text-xs text-center text-muted-foreground">
                        Eller ange manuellt:
                      </p>
                      <div className="rounded bg-muted p-2 text-center">
                        <code className="text-xs font-mono">{totpSecret}</code>
                      </div>
                    </div>
                  )}
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
                    setViewMode('setup-required');
                    setTotpCode('');
                    setTotpQrCode(null);
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
            </div>
          ) : viewMode === 'passkey-setup' ? (
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
                  <Fingerprint className="w-8 h-8 text-primary" />
                </div>
              </div>
              
              <p className="text-sm text-muted-foreground">
                Följ anvisningarna på din enhet för att skapa en passkey...
              </p>
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
                onClick={handleCheckAuthMethods}
                disabled={loading || !email.trim()}
                className="w-full h-12"
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
