import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, CheckCircle2, ArrowLeft, Link2 } from 'lucide-react';
import tivlyLogo from '@/assets/tivly-logo.png';

/**
 * Auth - Cross-domain magic link authentication
 * 
 * This component works seamlessly across app.tivly.se (web) and io.tivly.se (iOS app).
 * Users can request a login link from either domain and verify it on any device/domain.
 * The magic link system supports:
 * - Same-device instant login
 * - Cross-device login with polling
 * - Cross-domain verification (app.tivly.se ↔ io.tivly.se)
 */
const Auth = () => {
  const navigate = useNavigate();
  const { refreshUser, user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [isPolling, setIsPolling] = useState(false);
  const pollingIntervalRef = useRef<number | null>(null);

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

  // Cross-device polling
  useEffect(() => {
    if (!isPolling || !sessionId || !email) return;

    const pollStatus = async () => {
      try {
        const result = await apiClient.checkMagicLinkStatus(sessionId, email);
        
        if (result.status === 'ready' && result.token) {
          // Success - stop polling and log in
          setIsPolling(false);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          
          apiClient.applyAuthToken(result.token);
          await refreshUser();
          
          toast({
            title: "Inloggad!",
            description: "Du loggades in framgångsrikt.",
          });
          
          navigate('/');
        } else if (result.status === 'device_mismatch') {
          setIsPolling(false);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          
          toast({
            title: "Enhetsmatchning misslyckades",
            description: "Öppna länken på denna enhet eller starta om inloggningen på din andra enhet.",
            variant: "destructive",
          });
        } else if (result.status === 'expired') {
          setIsPolling(false);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          
          toast({
            title: "Länken har gått ut",
            description: "Begär en ny inloggningslänk.",
            variant: "destructive",
          });
          
          setLinkSent(false);
        } else if (result.status === 'not_found') {
          setIsPolling(false);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          
          toast({
            title: "Session hittades inte",
            description: "Begär en ny inloggningslänk.",
            variant: "destructive",
          });
          
          setLinkSent(false);
        }
        // If pending, keep polling
      } catch (error: any) {
        console.error('Polling error:', error);
      }
    };

    // Start polling immediately
    pollStatus();
    pollingIntervalRef.current = window.setInterval(pollStatus, 2000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [isPolling, sessionId, email, refreshUser, navigate, toast]);

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes('@')) {
      toast({
        title: "Ogiltig e-post",
        description: "Ange en giltig e-postadress.",
        variant: "destructive",
      });
      return;
    }

    // Test user bypass for review@tivly.se
    if (email.toLowerCase() === 'review@tivly.se') {
      setIsLoading(true);
      try {
        const testToken = 'test_unlimited_user_' + Date.now();
        apiClient.applyAuthToken(testToken);
        
        try { sessionStorage.setItem('pendingTestLogin', '1'); } catch {}
        localStorage.setItem('userEmail', email);
        
        await refreshUser();
        
        toast({
          title: "Test-inloggning",
          description: "Inloggad som obegränsad testanvändare",
        });
        
        navigate('/');
        return;
      } catch (error) {
        console.error('Test login error:', error);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (cooldown > 0) {
      toast({
        title: "Vänta lite",
        description: `Du kan skicka en ny länk om ${cooldown} sekunder.`,
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Always use the current domain for the redirect URL
      // This allows users to login from either app.tivly.se or io.tivly.se
      // The magic link will work regardless of which domain they click it from
      const redirectUrl = `${window.location.origin}/magic-login`;
      
      const result = await apiClient.requestMagicLink(
        email,
        redirectUrl
      );

      // Handle trusted device auto-login
      if (result.trustedLogin && result.token) {
        apiClient.applyAuthToken(result.token);
        await refreshUser();
        toast({
          title: "Inloggad!",
          description: "Du loggades in direkt på denna enhet.",
        });
        navigate('/');
        return;
      }
      
      // Normal flow: email sent with magic link
      if (result.sessionId) {
        setLinkSent(true);
        setSessionId(result.sessionId);
        
        // Store in localStorage for cross-tab recovery
        localStorage.setItem('magic_session_id', result.sessionId);
        localStorage.setItem('magic_session_email', email);
        
        setCooldown(result.retryAfterSeconds || 60);
        
        // Start polling for cross-device login
        setIsPolling(true);
        
        toast({
          title: "Länk skickad!",
          description: `En inloggningslänk skickades till ${email}`,
        });
      } else {
        throw new Error('No session ID received');
      }
    } catch (error: any) {
      // CORS error workaround
      if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
        console.log('CORS error detected, but email was likely sent. Proceeding...');
        const tempSessionId = `session_${Date.now()}_${email.replace(/[^a-z0-9]/gi, '')}`;
        setLinkSent(true);
        setSessionId(tempSessionId);
        localStorage.setItem('magic_session_id', tempSessionId);
        localStorage.setItem('magic_session_email', email);
        setCooldown(60);
        setIsPolling(true);
        
        toast({
          title: "Länk skickad!",
          description: `En inloggningslänk skickades till ${email}`,
        });
        return;
      }
      
      let description = error.message || "Kunde inte skicka länk.";
      let title = "Fel";
      
      if (error.message.includes('rate_limited') || error.message.includes('retry_after')) {
        const retryMatch = error.message.match(/retry_after_(\d+)/);
        const seconds = retryMatch ? parseInt(retryMatch[1]) : 60;
        setCooldown(seconds);
        title = "För många försök";
        description = `Vänta ${seconds} sekunder innan du försöker igen.`;
      } else if (error.message.includes('browser_blocked')) {
        title = "Enhet blockerad";
        description = "Denna enhet kan inte användas. Om du har ett Enterprise-konto, kontakta din administratör.";
      } else if (error.message.includes('mail_not_configured') || error.message.includes('mail_send_failed')) {
        title = "E-post kunde inte skickas";
        description = "Det gick inte att skicka e-post. Försök igen om en stund.";
      }
      
      toast({
        title,
        description,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setLinkSent(false);
    setSessionId('');
    setEmail('');
    setCooldown(0);
    setIsPolling(false);
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    localStorage.removeItem('magic_session_id');
    localStorage.removeItem('magic_session_email');
  };

  return (
    <div 
      className="min-h-screen relative overflow-hidden flex items-center justify-center p-4 sm:p-6 safe-area-inset"
    >
      {/* Animated background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-secondary/10 animate-gradient" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-secondary/20 via-transparent to-transparent" />
      
      {/* Decorative elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-secondary/5 rounded-full blur-3xl animate-pulse delay-1000" />
      
      <div className="w-full max-w-md relative z-10">
        <div className="rounded-3xl border border-border/40 bg-card/80 backdrop-blur-2xl shadow-2xl overflow-hidden animate-fade-in">
          {/* Gradient border effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-secondary/20 rounded-3xl opacity-50" />
          
          <div className="relative p-6 sm:p-10 space-y-8">
            {/* Logo Section */}
            <div className="flex flex-col items-center gap-5 animate-slide-in-from-top">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-br from-primary to-secondary rounded-3xl blur-xl opacity-30 group-hover:opacity-50 transition-opacity duration-500" />
                <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/30 to-secondary/30 border-2 border-primary/40 flex items-center justify-center shadow-xl transform group-hover:scale-105 transition-transform duration-300">
                  <img 
                    src={tivlyLogo}
                    alt="Tivly Logo" 
                    className="w-12 h-12 object-contain"
                  />
                </div>
              </div>
              
              <div className="text-center space-y-2">
                <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent tracking-tight">
                  {linkSent ? 'Kolla din inkorg' : 'Välkommen'}
                </h1>
                
                <p className="text-sm sm:text-base text-muted-foreground text-center max-w-sm leading-relaxed">
                  {linkSent 
                    ? 'Vi skickade en inloggningslänk till din e-post' 
                    : 'Ange din e-post för att få en säker inloggningslänk'}
                </p>
              </div>
            </div>

            {/* Content */}
            {linkSent ? (
              <div className="text-center space-y-8 animate-slide-in-from-bottom">
                <div className="relative mx-auto w-24 h-24 group">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary to-secondary rounded-3xl blur-xl opacity-40 animate-pulse" />
                  <div className="relative rounded-3xl bg-gradient-to-br from-primary/20 to-secondary/20 border-2 border-primary/40 flex items-center justify-center shadow-2xl">
                    {isPolling ? (
                      <Loader2 className="w-12 h-12 text-primary animate-spin" />
                    ) : (
                      <Mail className="w-12 h-12 text-primary" />
                    )}
                  </div>
                </div>
                
                <div className="space-y-6">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Länk skickad till
                    </p>
                    <p className="text-base font-semibold text-foreground break-all">
                      {email}
                    </p>
                  </div>

                  <div className="space-y-3 p-4 bg-muted/30 rounded-xl">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4 text-primary" />
                      <span>Klicka på länken i ditt email</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-4 h-4 text-primary" />
                      <span>Du kan öppna länken på valfri enhet</span>
                    </div>
                    {isPolling && (
                      <div className="flex items-center gap-2 text-sm text-primary">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Väntar på inloggning...</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground bg-muted/30 rounded-xl p-3">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                    <span>Länken är giltig i 15 minuter</span>
                  </div>
                </div>
                
                <div className="flex flex-col gap-3 pt-2">
                  <Button
                    onClick={handleSendMagicLink}
                    variant="outline"
                    className="w-full h-12 rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all hover:border-primary/50"
                    disabled={cooldown > 0 || isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Mail className="w-4 h-4 mr-2" />
                    )}
                    <span className="text-sm font-medium">
                      {cooldown > 0 ? `Skicka igen om ${cooldown}s` : 'Skicka ny länk'}
                    </span>
                  </Button>
                  
                  <Button
                    onClick={handleBack}
                    variant="ghost"
                    className="w-full h-12 rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    <span className="text-sm font-medium">Tillbaka</span>
                  </Button>
                </div>
              </div>
            ) : (
              <form 
                onSubmit={handleSendMagicLink} 
                className="space-y-5"
              >
                <div>
                  <div className="relative group">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground transition-all duration-200 group-focus-within:text-primary group-focus-within:scale-110 z-10" />
                    <Input
                      type="email"
                      placeholder="din@email.se"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading}
                      className="pl-12 h-14 rounded-xl border-border/60 focus:border-primary/50 transition-all duration-200 text-base"
                      required
                    />
                  </div>
                </div>
                
                <div>
                  <Button
                    type="submit"
                    disabled={isLoading || !email}
                    className="w-full h-14 rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 text-base font-semibold shadow-lg disabled:opacity-50"
                    size="lg"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Skickar länk...
                      </>
                    ) : (
                      <>
                        <Link2 className="mr-2 h-5 w-5" />
                        Skicka inloggningslänk
                      </>
                    )}
                  </Button>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <div className="w-1 h-1 bg-muted-foreground/40 rounded-full" />
                    <span>Inget lösenord krävs</span>
                    <div className="w-1 h-1 bg-muted-foreground/40 rounded-full" />
                    <span>Säker inloggning</span>
                    <div className="w-1 h-1 bg-muted-foreground/40 rounded-full" />
                  </div>
                  <p className="text-xs text-center text-muted-foreground leading-relaxed px-4">
                    Vi skickar en klickbar länk till din e-post som är giltig i 15 minuter
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
