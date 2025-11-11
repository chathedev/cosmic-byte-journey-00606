import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
      const result = await apiClient.requestMagicLink(
        email,
        `${window.location.origin}/magic-login`
      );

      // Handle trusted device auto-login (no email sent by backend)
      if ((result as any).trustedLogin && (result as any).token) {
        apiClient.applyAuthToken((result as any).token);
        await refreshUser();
        toast({
          title: "Inloggad!",
          description: "Du loggades in direkt på denna enhet.",
        });
        navigate('/');
        return;
      }
      
      setLinkSent(true);
      setSessionId(result.sessionId);
      setCooldown(result.retryAfterSeconds || 60);
      
      toast({
        title: "E-post skickad!",
        description: `Kontrollera din inkorg på ${email}`,
      });
    } catch (error: any) {
      let description = "Kunde inte skicka länk.";
      let title = "Fel";
      
      if (error.message.includes('rate_limited') || error.message.includes('retry_after')) {
        const retryMatch = error.message.match(/retry_after_(\d+)/);
        const seconds = retryMatch ? parseInt(retryMatch[1]) : 60;
        setCooldown(seconds);
        title = "För många försök";
        description = `Vänta ${seconds} sekunder innan du försöker igen.`;
      } else if (error.message.includes('browser_blocked')) {
        // For enterprise users or any blocked users, show a more helpful message
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
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-gradient-to-br from-background via-background to-primary/5">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-12 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-1/4 -right-12 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }} />
      </div>

      <Card className="w-full max-w-md shadow-2xl border-2 relative z-10 backdrop-blur-sm bg-card/95 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <CardHeader className="space-y-4 text-center pb-8">
          <div className="mx-auto w-24 h-24 relative">
            <img 
              src={tivlyLogo}
              alt="Tivly Logo" 
              className="w-full h-full object-contain drop-shadow-2xl"
            />
          </div>
          
          <div className="space-y-2">
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent animate-gradient">
              Välkommen till Tivly
            </CardTitle>
            <CardDescription className="text-base">
              {linkSent ? 'Kontrollera din e-post' : 'Logga in med e-post'}
            </CardDescription>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {linkSent ? (
            <div className="text-center space-y-4 py-6 animate-in fade-in zoom-in duration-300">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-primary animate-in zoom-in duration-500" />
              </div>
              <div className="space-y-2">
                <p className="font-medium text-lg">E-post skickad!</p>
                <p className="text-sm text-muted-foreground">
                  Vi har skickat en inloggningslänk till <strong className="text-foreground">{email}</strong>
                </p>
                <p className="text-xs text-muted-foreground/80">
                  Länken är giltig i 15 minuter
                </p>
                {isPolling && (
                  <div className="flex items-center justify-center gap-2 text-xs text-primary mt-3">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                    <span>Väntar på inloggning från annan enhet...</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSendMagicLink}
                  variant="outline"
                  className="flex-1 transition-all duration-200"
                  disabled={cooldown > 0 || isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Mail className="w-4 h-4 mr-2" />
                  )}
                  {cooldown > 0 ? `Vänta ${cooldown}s` : 'Skicka igen'}
                </Button>
                <Button
                  onClick={() => {
                    setLinkSent(false);
                    setSessionId('');
                    setEmail('');
                    setCooldown(0);
                  }}
                  variant="ghost"
                  className="flex-1 transition-all duration-200"
                >
                  Använd annan e-post
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSendMagicLink} className="space-y-4">
              <div className="space-y-2">
                <div className="relative group">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground transition-colors group-focus-within:text-primary" />
                  <Input
                    type="email"
                    placeholder="din@email.se"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    className="pl-10 h-12 text-base transition-all duration-200"
                    required
                  />
                </div>
              </div>
              
              <Button
                type="submit"
                disabled={isLoading || !email}
                className="w-full h-12 text-base font-semibold shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Skickar...
                  </>
                ) : (
                  'Skicka inloggningslänk'
                )}
              </Button>
            </form>
          )}
          
          <div className="space-y-3 pt-4 border-t border-border/50">
            <p className="text-xs text-muted-foreground/80 text-center leading-relaxed">
              {linkSent 
                ? 'Klicka på länken i e-posten för att logga in säkert. Du kan också öppna länken på en annan enhet.'
                : 'Vi skickar en säker inloggningslänk till din e-post. Inget lösenord krävs.'}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
