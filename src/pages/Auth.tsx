import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Smartphone, ArrowLeft, Clock, AlertCircle } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import tivlyLogo from '@/assets/tivly-logo.png';

/**
 * Auth - SMS verification login page
 * 
 * Implements the Tivly SMS verification playbook:
 * - Collects email + phone number (E.164 format)
 * - Initiates SMS verification via Sinch
 * - Collects and verifies PIN code
 * - No resend functionality - user must wait for expiry
 */
export default function Auth() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isLoading, refreshUser } = useAuth();

  // State management
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [maskedPhone, setMaskedPhone] = useState('');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  // Redirect if logged in
  useEffect(() => {
    if (!isLoading && user) {
      navigate('/');
    }
  }, [user, isLoading, navigate]);

  // Load cooldown from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('tivly_sms_cooldown');
    if (stored) {
      const cooldownTime = parseInt(stored, 10);
      if (cooldownTime > Date.now()) {
        setCooldownUntil(cooldownTime);
      } else {
        localStorage.removeItem('tivly_sms_cooldown');
      }
    }
  }, []);

  // Cooldown countdown timer
  useEffect(() => {
    if (!cooldownUntil) {
      setCooldownSeconds(0);
      return;
    }

    const updateCooldown = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
      setCooldownSeconds(remaining);

      if (remaining === 0) {
        setCooldownUntil(null);
        localStorage.removeItem('tivly_sms_cooldown');
      }
    };

    updateCooldown();
    const timer = setInterval(updateCooldown, 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  // Countdown timer (Playbook Step 3)
  useEffect(() => {
    if (!expiresAt) return;

    const updateCountdown = () => {
      const now = new Date().getTime();
      const expires = new Date(expiresAt).getTime();
      const remaining = Math.max(0, Math.floor((expires - now) / 1000));
      setCountdown(remaining);

      if (remaining === 0) {
        toast({
          variant: 'destructive',
          title: 'Koden har gått ut',
          description: 'Vänligen begär en ny kod.',
        });
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, toast]);

  const handleStartSmsVerification = async () => {
    // Check cooldown first
    if (cooldownUntil && Date.now() < cooldownUntil) {
      toast({
        variant: 'destructive',
        title: 'Vänta lite',
        description: `Du kan begära en ny kod om ${cooldownSeconds} sekunder.`,
      });
      return;
    }

    // Playbook Step 1: Validate input locally
    if (!email.trim()) {
      toast({
        variant: 'destructive',
        title: 'E-post krävs',
        description: 'Vänligen ange din e-postadress.',
      });
      return;
    }

    if (!phone.trim()) {
      toast({
        variant: 'destructive',
        title: 'Telefonnummer krävs',
        description: 'Vänligen ange ditt telefonnummer.',
      });
      return;
    }

    // Basic E.164 validation
    if (!phone.startsWith('+') || phone.replace(/\D/g, '').length < 8) {
      toast({
        variant: 'destructive',
        title: 'Ogiltigt telefonnummer',
        description: 'Ange nummer i internationellt format (t.ex. +46701234567)',
      });
      return;
    }

    console.log('🚀 [Playbook Step 2] Starting SMS verification');
    console.log('📧 Email:', email);
    console.log('📱 Phone:', phone);

    setLoading(true);
    try {
      // Playbook Step 2: Call POST /auth/sms/start
      const result = await apiClient.startSmsVerification(email, phone);

      console.log('✅ SMS verification started');
      console.log('📱 Masked phone:', result.phone);
      console.log('⏰ Expires at:', result.expiresAt);

      setMaskedPhone(result.phone);
      setExpiresAt(result.expiresAt);
      setCodeSent(true);

      // Set 60-second cooldown
      const cooldownTime = Date.now() + 60000;
      setCooldownUntil(cooldownTime);
      localStorage.setItem('tivly_sms_cooldown', cooldownTime.toString());

      toast({
        title: 'SMS skickad!',
        description: `Din kod skickas till ${result.phone}`,
      });
    } catch (error: any) {
      console.error('❌ Failed to start SMS verification:', error);
      
      // Handle 429 verification_pending
      if (error.message === 'verification_pending') {
        toast({
          variant: 'destructive',
          title: 'Vänta på befintlig kod',
          description: 'En kod har redan skickats. Vänta tills den går ut.',
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Misslyckades att skicka SMS',
          description: error.message || 'Försök igen senare.',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (code.length < 4) {
      toast({
        variant: 'destructive',
        title: 'Ogiltig kod',
        description: 'Ange en giltig verifieringskod.',
      });
      return;
    }

    console.log('🚀 [Playbook Step 4] Verifying SMS code');
    console.log('📧 Email:', email);
    console.log('🔢 Code length:', code.length);

    setLoading(true);
    try {
      // Playbook Step 4: Call POST /auth/sms/verify
      const result = await apiClient.verifySmsCode(email, code);

      console.log('✅ SMS code verified successfully');
      console.log('🔑 JWT received');

      // Playbook Step 5: Token is already stored by API client
      await refreshUser();
      navigate('/');
    } catch (error: any) {
      console.error('❌ SMS verification failed:', error);

      // Playbook Step 4: Handle error cases
      if (error.message === 'invalid_code') {
        toast({
          variant: 'destructive',
          title: 'Fel kod',
          description: 'Fel kod – försök igen.',
        });
        setCode('');
      } else if (error.message === 'verification_expired') {
        toast({
          variant: 'destructive',
          title: 'Koden har gått ut',
          description: 'Begär en ny kod.',
        });
        handleStartOver();
      } else if (error.message === 'verification_not_found') {
        toast({
          variant: 'destructive',
          title: 'Session förlorad',
          description: 'Vänligen starta om verifieringsprocessen.',
        });
        handleStartOver();
      } else {
        toast({
          variant: 'destructive',
          title: 'Verifiering misslyckades',
          description: error.message || 'Försök igen.',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStartOver = () => {
    setCodeSent(false);
    setCode('');
    setMaskedPhone('');
    setExpiresAt(null);
    setCountdown(0);
    // Don't clear cooldown - it persists across "start over"
  };

  const formatCountdown = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-secondary/10" />
      
      <Card className="w-full max-w-md relative z-10 shadow-2xl border-2 backdrop-blur-sm bg-card/95">
        <CardHeader className="space-y-4 text-center pb-8">
          <div className="mx-auto w-24 h-24">
            <img src={tivlyLogo} alt="Tivly Logo" className="w-full h-full object-contain" />
          </div>
          
          <div className="space-y-2">
            <CardTitle className="text-3xl font-bold">
              {codeSent ? 'Ange verifieringskod' : 'Välkommen till Tivly'}
            </CardTitle>
            <CardDescription className="text-base">
              {codeSent
                ? `Din SMS-kod skickas till ${maskedPhone}`
                : 'Ange din e-post och telefonnummer för att få en verifieringskod'}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="pb-8">
          {codeSent ? (
            // Code entry view (Playbook Step 3)
            <div className="space-y-6">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex items-start gap-3">
                  <Smartphone className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium">Telefonnummer:</p>
                    <p className="text-sm text-muted-foreground">{maskedPhone}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <p className="text-muted-foreground">
                    Koden gäller i <strong>{formatCountdown(countdown)}</strong>
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="code" className="text-center block">Verifieringskod</Label>
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={4}
                    value={code}
                    onChange={setCode}
                    disabled={loading || countdown === 0}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
              </div>

              {countdown === 0 && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-destructive">
                      Koden har gått ut. Begär en ny kod.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={handleStartOver}
                  disabled={loading}
                  className="flex-1"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Börja om
                </Button>
                <Button
                  onClick={handleVerifyCode}
                  disabled={loading || code.length < 4 || countdown === 0}
                  className="flex-1"
                >
                  {loading ? 'Verifierar...' : 'Verifiera'}
                </Button>
              </div>
            </div>
          ) : (
            // Login form view (Playbook Step 1-2)
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleStartSmsVerification();
              }}
              className="space-y-4"
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

              <div className="space-y-2">
                <Label htmlFor="phone">Telefonnummer</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+46701234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={loading}
                  required
                  className="h-11"
                />
                <p className="text-xs text-muted-foreground">
                  Ange i internationellt format (t.ex. +46701234567)
                </p>
              </div>

              {cooldownSeconds > 0 && (
                <div className="rounded-lg border border-muted bg-muted/30 p-3 mb-4">
                  <p className="text-sm text-center text-muted-foreground">
                    Vänta {cooldownSeconds} sekunder innan du begär en ny kod
                  </p>
                </div>
              )}

              <Button 
                type="submit" 
                className="w-full h-11" 
                disabled={loading || cooldownSeconds > 0}
              >
                {loading ? (
                  <>
                    <Clock className="w-4 h-4 mr-2 animate-spin" />
                    Skickar kod...
                  </>
                ) : cooldownSeconds > 0 ? (
                  <>
                    <Clock className="w-4 h-4 mr-2" />
                    Vänta {cooldownSeconds}s
                  </>
                ) : (
                  <>
                    <Smartphone className="w-4 h-4 mr-2" />
                    Skicka SMS-kod
                  </>
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
