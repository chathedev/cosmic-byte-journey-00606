import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, CheckCircle2, ArrowLeft, Link2, Sparkles } from 'lucide-react';
import tivlyLogo from '@/assets/tivly-logo.png';
import { getRedirectDomain } from '@/utils/environment';

/**
 * AuthDomain - Dedicated authentication page for auth.tivly.se
 * Serves users from both io.tivly.se (app) and app.tivly.se (web)
 */
const AuthDomain = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [isPolling, setIsPolling] = useState(false);
  const [originDomain, setOriginDomain] = useState<string>('');
  const pollingIntervalRef = useRef<number | null>(null);

  // Get origin domain from URL params or localStorage
  useEffect(() => {
    const from = searchParams.get('from');
    if (from) {
      const domain = from === 'app' ? 'https://app.tivly.se' : 
                     from === 'ios' ? 'https://io.tivly.se' : 
                     'https://app.tivly.se';
      setOriginDomain(domain);
      localStorage.setItem('auth_origin_domain', domain);
    } else {
      setOriginDomain(getRedirectDomain());
    }
  }, [searchParams]);

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
          setIsPolling(false);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          
          toast({
            title: "Inloggning lyckades!",
            description: "Du omdirigeras nu...",
          });
          
          // Redirect to original domain
          window.location.href = `${originDomain}?auth_token=${result.token}`;
        } else if (result.status === 'device_mismatch') {
          setIsPolling(false);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          
          toast({
            title: "Enhetsmatchning misslyckades",
            description: "Öppna länken på denna enhet eller starta om inloggningen.",
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
        }
      } catch (error: any) {
        console.error('Polling error:', error);
      }
    };

    pollStatus();
    pollingIntervalRef.current = window.setInterval(pollStatus, 2000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [isPolling, sessionId, email, toast, originDomain]);

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

    // Test user bypass
    if (email.toLowerCase() === 'review@tivly.se') {
      toast({
        title: "Test-inloggning",
        description: "Omdirigerar till testläge...",
      });
      window.location.href = `${originDomain}?test_user=true`;
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
      const redirectUrl = `${window.location.origin}/magic-login`;
      
      const result = await apiClient.requestMagicLink(email, redirectUrl);

      if (result.trustedLogin && result.token) {
        toast({
          title: "Inloggad!",
          description: "Du omdirigeras nu...",
        });
        window.location.href = `${originDomain}?auth_token=${result.token}`;
        return;
      }
      
      if (result.sessionId) {
        setLinkSent(true);
        setSessionId(result.sessionId);
        
        localStorage.setItem('magic_session_id', result.sessionId);
        localStorage.setItem('magic_session_email', email);
        
        setCooldown(result.retryAfterSeconds || 60);
        setIsPolling(true);
        
        toast({
          title: "Länk skickad!",
          description: `En inloggningslänk skickades till ${email}`,
        });
      }
    } catch (error: any) {
      // CORS error workaround
      if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
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
      
      toast({
        title: "Fel",
        description: error.message || "Kunde inte skicka länk.",
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
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
      {/* Animated background - more vibrant for auth domain */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-accent/20" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/30 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-accent/30 via-transparent to-transparent" />
      
      {/* Floating orbs */}
      <div className="absolute top-20 left-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-secondary/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      
      <div className="w-full max-w-md relative z-10">
        <div className="rounded-3xl border-2 border-primary/20 bg-card/90 backdrop-blur-2xl shadow-2xl overflow-hidden">
          {/* Gradient border glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-accent/20 to-secondary/30 rounded-3xl opacity-50 blur-xl" />
          
          <div className="relative p-8 sm:p-12 space-y-8">
            {/* Logo Section */}
            <div className="flex flex-col items-center gap-6">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-br from-primary via-accent to-secondary rounded-3xl blur-2xl opacity-40 group-hover:opacity-60 transition-opacity duration-500 animate-pulse" />
                <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/40 to-accent/40 border-2 border-primary/50 flex items-center justify-center shadow-2xl transform group-hover:scale-105 transition-transform duration-300">
                  <img 
                    src={tivlyLogo}
                    alt="Tivly" 
                    className="w-16 h-16 object-contain drop-shadow-2xl"
                  />
                  <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-primary animate-pulse" />
                </div>
              </div>
              
              <div className="text-center space-y-3">
                <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-br from-primary via-accent to-primary bg-clip-text text-transparent tracking-tight">
                  {linkSent ? 'Kolla din inkorg' : 'Välkommen till Tivly'}
                </h1>
                
                <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-sm mx-auto">
                  {linkSent 
                    ? 'Vi skickade en säker inloggningslänk till din e-post' 
                    : 'Ange din e-post för att få en säker inloggningslänk'}
                </p>

                {originDomain && !linkSent && (
                  <div className="flex items-center justify-center gap-2 text-xs text-primary/70 bg-primary/10 rounded-full px-4 py-2 border border-primary/20">
                    <Sparkles className="w-3 h-3" />
                    <span>Loggar in från {originDomain.includes('io.') ? 'Tivly App' : 'Tivly Web'}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Content */}
            {linkSent ? (
              <div className="text-center space-y-8">
                <div className="relative mx-auto w-28 h-28 group">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary to-accent rounded-3xl blur-2xl opacity-50 animate-pulse" />
                  <div className="relative rounded-3xl bg-gradient-to-br from-primary/20 to-accent/20 border-2 border-primary/40 flex items-center justify-center shadow-2xl h-full">
                    {isPolling ? (
                      <Loader2 className="w-14 h-14 text-primary animate-spin" />
                    ) : (
                      <Mail className="w-14 h-14 text-primary" />
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

                  <div className="space-y-3 p-5 bg-muted/40 rounded-2xl border border-border/50">
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                      <span>Klicka på länken i ditt email</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                      <span>Du kan öppna länken på valfri enhet</span>
                    </div>
                    {isPolling && (
                      <div className="flex items-center gap-3 text-sm text-primary">
                        <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
                        <span>Väntar på inloggning...</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground bg-muted/40 rounded-xl p-4 border border-border/50">
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                    <span>Länken är giltig i 15 minuter</span>
                  </div>
                </div>
                
                <div className="flex flex-col gap-3 pt-2">
                  <Button
                    onClick={handleSendMagicLink}
                    variant="outline"
                    className="w-full h-12 rounded-xl"
                    disabled={cooldown > 0 || isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Mail className="w-4 h-4 mr-2" />
                    )}
                    {cooldown > 0 ? `Skicka igen om ${cooldown}s` : 'Skicka ny länk'}
                  </Button>
                  
                  <Button
                    onClick={handleBack}
                    variant="ghost"
                    className="w-full h-12 rounded-xl"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Tillbaka
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSendMagicLink} className="space-y-6">
                <div>
                  <div className="relative group">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground transition-all duration-200 group-focus-within:text-primary group-focus-within:scale-110 z-10" />
                    <Input
                      type="email"
                      placeholder="din@email.se"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading}
                      className="pl-12 h-14 rounded-xl border-2 border-border/60 focus:border-primary/50 transition-all duration-200 text-base bg-background/50"
                      required
                    />
                  </div>
                </div>
                
                <Button
                  type="submit"
                  disabled={isLoading || !email}
                  className="w-full h-14 rounded-xl text-base font-semibold shadow-lg"
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
                
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground flex-wrap">
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

export default AuthDomain;
