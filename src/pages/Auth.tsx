import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Mail, ArrowLeft, Sparkles } from 'lucide-react';
import tivlyLogo from '@/assets/tivly-logo.png';
import { toast } from 'sonner';
import { isNativeApp } from '@/utils/environment';

/**
 * Auth - Login page for app.tivly.se and io.tivly.se
 * 
 * Implements the Tivly magic link playbook:
 * - Requests magic link with current location as redirect
 * - Polls for cross-device completion
 * - Handles same-device completion via ?token parameter
 */
const Auth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, refreshUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [sessionId, setSessionId] = useState<string>('');
  const [pollingStatus, setPollingStatus] = useState<string>('');

  // Playbook Step 4: Handle same-device completion via ?token=JWT parameter
  // (Token already verified by auth.tivly.se/magic-login, just needs to be stored)
  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      console.log('🔐 [Playbook Step 4] Same-device magic link completion detected');
      console.log('📝 Token already verified by magic-login page, applying JWT...');
      
      // Step 4.2: Store token (JWT already verified by MagicLogin page)
      apiClient.applyAuthToken(token);
      
      // Step 4.3: Replace history to clean URL
      window.history.replaceState({}, document.title, location.pathname);
      
      // Step 4.4: Rehydrate user data via GET /me
      refreshUser().then(() => {
        console.log('✅ User rehydrated, redirecting to app');
        navigate('/', { replace: true });
      }).catch((error) => {
        console.error('❌ Failed to refresh user after magic link:', error);
        toast.error('Inloggning misslyckades. Försök igen.');
      });
    }
  }, [searchParams, navigate, refreshUser]);

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  // Playbook Step 5: Cross-device polling
  useEffect(() => {
    if (!linkSent || !sessionId || !email) return;

    console.log('🔄 [Playbook Step 3] Starting cross-device polling for sessionId:', sessionId);
    
    const pollInterval = setInterval(async () => {
      try {
        // Playbook Step 3: Poll every 2 seconds
        const status = await apiClient.checkMagicLinkStatus(sessionId, email);
        console.log('📊 Poll status:', status.status);
        
        setPollingStatus(status.status);
        
        // Playbook Step 5: Handle 'ready' status with token
        if (status.status === 'ready' && status.token) {
          console.log('✅ [Playbook Step 5] Cross-device completion detected!');
          clearInterval(pollInterval);
          
          // Store JWT and refresh user
          apiClient.applyAuthToken(status.token);
          await refreshUser();
          navigate('/', { replace: true });
        } 
        // Playbook Step 5: Handle expired/not_found - restart from step 1
        else if (status.status === 'expired' || status.status === 'not_found') {
          console.warn('⚠️ Session expired or not found - restarting flow');
          clearInterval(pollInterval);
          setLinkSent(false);
          setSessionId('');
          setPollingStatus('');
          toast.error('Länken har gått ut. Begär en ny länk.');
        }
        // Playbook Step 5: Handle device_mismatch - show message
        // (UI already shows this based on pollingStatus state)
      } catch (error) {
        console.error('❌ Polling error:', error);
      }
    }, 2000); // Playbook: Poll every 2 seconds

    return () => {
      console.log('🛑 Stopping cross-device polling');
      clearInterval(pollInterval);
    };
  }, [linkSent, sessionId, email, refreshUser, navigate]);

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      toast.error('Ange en giltig e-postadress');
      return;
    }

    if (cooldown > 0) {
      toast.error(`Vänta ${cooldown} sekunder innan du skickar igen`);
      return;
    }

    setIsLoading(true);
    
    try {
      // Playbook Step 1: Request with current location as redirect
      // Playbook Step 2: Prefer window.location.href to preserve exact view
      const redirectUrl = window.location.href;
      console.log('🔐 [Playbook Step 1] Requesting magic link with redirect:', { email, redirectUrl });
      
      const response = await apiClient.requestMagicLink(email, redirectUrl);
      
      console.log('✅ Magic link request successful:', response);
      
      // Playbook Step 1: Collect sessionId for polling
      if (response.sessionId) {
        setSessionId(response.sessionId);
        console.log('📋 SessionId stored for cross-device polling:', response.sessionId);
      }
      
      // Handle trusted device instant login (not in playbook, but backend feature)
      if (response.trustedLogin && response.token) {
        console.log('🎯 Trusted device detected - instant login bypass');
        await refreshUser();
        navigate('/', { replace: true });
        return;
      }
      
      // Playbook Step 3: Show waiting screen
      setLinkSent(true);
      setCooldown(60); // Debounce resend for 60 seconds (playbook minimum: 5s)
      toast.success('Magisk länk skickad! Kolla din e-post.');
    } catch (error: any) {
      console.error('❌ Failed to send magic link:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        isNative: isNativeApp()
      });
      
      let errorMessage = 'Kunde inte skicka länk. Försök igen.';
      
      if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
        errorMessage = 'Nätverksfel. Kontrollera din internetanslutning.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setLinkSent(false);
    setEmail('');
    setSessionId('');
    setPollingStatus('');
  };

  if (linkSent) {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-secondary/10" />
        
        <Card className="w-full max-w-md relative z-10 shadow-2xl border-2 backdrop-blur-sm bg-card/95">
          <CardHeader className="space-y-4 text-center pb-8">
            <div className="mx-auto w-24 h-24">
              <img src={tivlyLogo} alt="Tivly Logo" className="w-full h-full object-contain" />
            </div>
            
            <div className="space-y-2">
              <CardTitle className="text-3xl font-bold">Kolla din e-post!</CardTitle>
              <CardDescription className="text-base">
                Vi har skickat en magisk inloggningslänk till <strong>{email}</strong>
              </CardDescription>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-6 pb-8">
            <div className="flex flex-col items-center space-y-4">
              <Mail className="w-16 h-16 text-primary" />
              <p className="text-sm text-muted-foreground text-center">
                Klicka på länken i e-posten för att logga in säkert
              </p>
              {pollingStatus === 'device_mismatch' && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
                    Slutför inloggningen på enheten som begärde länken
                  </p>
                </div>
              )}
              {pollingStatus === 'pending' && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                  <span>Väntar på verifiering...</span>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <Button
                onClick={handleSendMagicLink}
                disabled={isLoading || cooldown > 0}
                variant="outline"
                className="w-full"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4 mr-2" />
                )}
                {cooldown > 0 ? `Skicka igen om ${cooldown}s` : 'Skicka igen'}
              </Button>

              <Button onClick={handleBack} variant="ghost" className="w-full">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Tillbaka
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-secondary/10" />
      
      <Card className="w-full max-w-md relative z-10 shadow-2xl border-2 backdrop-blur-sm bg-card/95">
        <CardHeader className="space-y-4 text-center pb-8">
          <div className="mx-auto w-24 h-24">
            <img src={tivlyLogo} alt="Tivly Logo" className="w-full h-full object-contain" />
          </div>
          
          <div className="space-y-2">
            <CardTitle className="text-3xl font-bold">Välkommen till Tivly</CardTitle>
            <CardDescription className="text-base">
              Ange din e-postadress för att få en magisk inloggningslänk
            </CardDescription>
          </div>
        </CardHeader>
        
        <CardContent className="pb-8">
          <form onSubmit={handleSendMagicLink} className="space-y-6">
            <div className="space-y-2">
              <Input
                type="email"
                placeholder="din@epost.se"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                className="h-12 text-base"
                autoFocus
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading || !email}
              className="w-full h-12 text-base"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-5 h-5 mr-2" />
              )}
              Skicka magisk länk
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
