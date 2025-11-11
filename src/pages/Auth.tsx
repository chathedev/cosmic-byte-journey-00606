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
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-purple-900 safe-area-inset">
      <Card className="w-full max-w-md shadow-2xl border border-border/50 relative z-10 backdrop-blur-xl bg-card/90 rounded-3xl">
        <CardHeader className="space-y-6 text-center pb-8 pt-10">
          <div className="mx-auto relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-3xl blur-2xl opacity-30 animate-pulse-glow" />
            <div className="relative w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-3xl flex items-center justify-center shadow-xl">
              <img 
                src={tivlyLogo}
                alt="Tivly Logo" 
                className="w-12 h-12 object-contain"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
              Välkommen
            </CardTitle>
            <CardDescription className="text-base text-muted-foreground">
              {linkSent ? 'Kontrollera din e-post' : 'Logga in för att fortsätta'}
            </CardDescription>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6 px-8 pb-10">
          {linkSent ? (
            <div className="text-center space-y-6 py-4 animate-in fade-in zoom-in duration-300">
              <div className="mx-auto w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-500 animate-in zoom-in duration-500" />
              </div>
              <div className="space-y-3">
                <p className="font-semibold text-xl">E-post skickad!</p>
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    Vi har skickat en inloggningslänk till<br/>
                    <strong className="font-semibold">{email}</strong>
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Länken är giltig i 15 minuter
                </p>
                {isPolling && (
                  <div className="flex items-center justify-center gap-2 text-xs text-blue-600 dark:text-blue-400 mt-3 bg-blue-50 dark:bg-blue-900/20 rounded-full py-2 px-4">
                    <div className="w-2 h-2 bg-blue-600 dark:bg-blue-400 rounded-full animate-pulse" />
                    <span>Väntar på inloggning...</span>
                  </div>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleSendMagicLink}
                  variant="outline"
                  className="flex-1 h-12 rounded-2xl border-2 font-semibold touch-manipulation"
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
                  className="flex-1 h-12 rounded-2xl font-semibold touch-manipulation"
                >
                  Annan e-post
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSendMagicLink} className="space-y-6">
              <div className="space-y-3">
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground transition-colors group-focus-within:text-primary z-10" />
                  <Input
                    type="email"
                    placeholder="din@email.se"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    className="pl-12 h-14 text-base rounded-2xl border-2 focus:border-primary transition-all touch-manipulation"
                    required
                  />
                </div>
              </div>
              
              <Button
                type="submit"
                disabled={isLoading || !email}
                className="w-full h-14 text-base font-semibold rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-xl shadow-blue-500/30 touch-manipulation"
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
          
          <div className="space-y-3 pt-2">
            <p className="text-xs text-center text-muted-foreground leading-relaxed px-2">
              {linkSent 
                ? 'Klicka på länken i e-posten för att logga in säkert.'
                : 'Vi skickar en säker inloggningslänk till din e-post. Inget lösenord krävs.'}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
