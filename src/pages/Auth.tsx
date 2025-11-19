import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, CheckCircle2 } from 'lucide-react';
import tivlyLogo from '@/assets/tivly-logo.png';

const Auth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshUser, user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [isPolling, setIsPolling] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (user && !searchParams.get('token')) {
      navigate('/');
    }
  }, [user, navigate, searchParams]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  // Poll for login status when link is sent
  useEffect(() => {
    if (!linkSent || !sessionId || !email) return;

    let pollInterval: NodeJS.Timeout;
    let timeoutTimer: NodeJS.Timeout;

    const pollStatus = async () => {
      try {
        const status = await apiClient.checkMagicLinkStatus(sessionId, email);
        
        if (status.status === 'ready' && status.token) {
          setIsPolling(false);
          await refreshUser();
          
          toast({
            title: "Inloggad!",
            description: "Du loggades in från en annan enhet.",
          });
          
          navigate('/');
          clearInterval(pollInterval);
          clearTimeout(timeoutTimer);
        }
      } catch (error) {
        // Silently fail, keep polling
        console.error('Polling error:', error);
      }
    };

    // Start polling every 2 seconds
    setIsPolling(true);
    pollInterval = setInterval(pollStatus, 2000);
    
    // Stop polling after 15 minutes (link expiry)
    timeoutTimer = setTimeout(() => {
      clearInterval(pollInterval);
      setIsPolling(false);
    }, 15 * 60 * 1000);

    return () => {
      clearInterval(pollInterval);
      clearTimeout(timeoutTimer);
      setIsPolling(false);
    };
  }, [linkSent, sessionId, email, refreshUser, navigate, toast]);

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
    console.log('🔐 Sending magic link to:', email);
    
    try {
      const result = await apiClient.requestMagicLink(
        email,
        `${window.location.origin}/magic-login`
      );
      
      console.log('✅ Magic link response:', result);

      // Handle trusted device auto-login (no email sent by backend)
      if ((result as any).trustedLogin && (result as any).token) {
        console.log('🔓 Trusted device login');
        apiClient.applyAuthToken((result as any).token);
        await refreshUser();
        toast({
          title: "Inloggad!",
          description: "Du loggades in direkt på denna enhet.",
        });
        navigate('/');
        return;
      }
      
      // Email sent successfully
      console.log('📧 Setting link sent state with sessionId:', result.sessionId);
      setLinkSent(true);
      setSessionId(result.sessionId);
      setCooldown(result.retryAfterSeconds || 60);
      
      toast({
        title: "E-post skickad!",
        description: `Kontrollera din inkorg på ${email}`,
      });
    } catch (error: any) {
      console.error('❌ Magic link error:', error);
      let description = "Kunde inte skicka länk. Försök igen.";
      let title = "Fel";
      
      if (error.message.includes('rate_limited') || error.message.includes('retry_after')) {
        const retryMatch = error.message.match(/retry_after_(\d+)/);
        const seconds = retryMatch ? parseInt(retryMatch[1]) : 60;
        setCooldown(seconds);
        title = "För många försök";
        description = `Vänta ${seconds} sekunder innan du försöker igen.`;
      } else if (error.message.includes('browser_blocked')) {
        description = "Denna enhet kan inte användas för att skapa ett nytt konto. Om du har ett Enterprise-konto, kontakta din administratör.";
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
            {/* Logo Section with animation */}
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
                  {linkSent ? 'Länk skickad!' : 'Välkommen'}
                </h1>
                
                <p className="text-sm sm:text-base text-muted-foreground text-center max-w-sm leading-relaxed">
                  {linkSent 
                    ? 'Kolla din inkorg för att logga in säkert' 
                    : 'Ange din e-post för en säker inloggningslänk – ingen lösenord behövs'}
                </p>
              </div>
            </div>

            {/* Content */}
            {linkSent ? (
              <div className="text-center space-y-8 animate-slide-in-from-bottom">
                <div className="relative mx-auto w-24 h-24 group">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary to-secondary rounded-3xl blur-xl opacity-40 animate-pulse" />
                  <div className="relative rounded-3xl bg-gradient-to-br from-primary/20 to-secondary/20 border-2 border-primary/40 flex items-center justify-center shadow-2xl">
                    <CheckCircle2 className="w-12 h-12 text-primary animate-scale-in" />
                  </div>
                </div>
                
                <div className="space-y-5">
                  <div className="p-6 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 to-transparent backdrop-blur-sm shadow-lg">
                    <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                      En säker inloggningslänk skickades till
                    </p>
                    <p className="text-lg font-semibold text-foreground break-all bg-gradient-to-br from-primary/10 to-transparent px-4 py-2 rounded-lg">
                      {email}
                    </p>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground bg-muted/30 rounded-xl p-3">
                      <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                      <span>Länken är giltig i 15 minuter</span>
                    </div>
                    
                    {isPolling && (
                      <div className="flex items-center justify-center gap-2.5 py-2 px-4 rounded-xl bg-primary/5 border border-primary/20">
                        <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                        <span className="text-xs font-medium text-primary">Väntar på inloggning...</span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex gap-3 pt-2">
                    <Button
                      onClick={handleSendMagicLink}
                      variant="outline"
                      className="flex-1 h-12 rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all hover:border-primary/50"
                      disabled={cooldown > 0 || isLoading}
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Mail className="w-4 h-4 mr-2" />
                      )}
                      <span className="text-sm font-medium">
                        {cooldown > 0 ? `Vänta ${cooldown}s` : 'Skicka igen'}
                      </span>
                    </Button>
                    <Button
                      onClick={() => {
                        setLinkSent(false);
                        setSessionId('');
                        setEmail('');
                        setCooldown(0);
                      }}
                      variant="ghost"
                      className="flex-1 h-12 rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      <span className="text-sm font-medium">Annan e-post</span>
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
                          <Mail className="mr-2 h-5 w-5" />
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
                      Vi skickar en engångslänk till din e-post som är giltig i 15 minuter
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
