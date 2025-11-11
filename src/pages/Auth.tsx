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
    <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-600 to-blue-700 flex items-center justify-center p-6 relative overflow-hidden safe-area-inset">
      {/* Animated background blobs */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-10 w-80 h-80 bg-white/10 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-white/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }} />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Glass Card */}
        <div className="bg-white/15 backdrop-blur-2xl border border-white/25 rounded-3xl shadow-2xl overflow-hidden">
          <div className="p-8 space-y-8">
            {/* Logo Section */}
            <div className="text-center space-y-6">
              <div className="mx-auto relative inline-block">
                <div className="absolute inset-0 bg-white/30 rounded-3xl blur-xl" />
                <div className="relative w-20 h-20 bg-white/20 backdrop-blur-xl border border-white/30 rounded-3xl flex items-center justify-center shadow-xl">
                  <img 
                    src={tivlyLogo}
                    alt="Tivly Logo" 
                    className="w-12 h-12 object-contain"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <h1 className="text-3xl font-bold text-white">
                  Välkommen
                </h1>
                <p className="text-base text-white/80">
                  {linkSent ? 'Kontrollera din e-post' : 'Logga in för att fortsätta'}
                </p>
              </div>
            </div>

            {/* Content */}
            <div className="space-y-6">
              {linkSent ? (
                <div className="text-center space-y-6 py-2">
                  <div className="mx-auto w-20 h-20 rounded-full bg-green-500/20 backdrop-blur-sm border border-green-400/30 flex items-center justify-center">
                    <CheckCircle2 className="w-10 h-10 text-green-400 animate-in zoom-in duration-500" />
                  </div>
                  <div className="space-y-3">
                    <p className="font-semibold text-xl text-white">E-post skickad!</p>
                    <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-4">
                      <p className="text-sm text-white/90">
                        Vi har skickat en inloggningslänk till<br/>
                        <strong className="font-semibold">{email}</strong>
                      </p>
                    </div>
                    <p className="text-xs text-white/70">
                      Länken är giltig i 15 minuter
                    </p>
                    {isPolling && (
                      <div className="flex items-center justify-center gap-2 text-xs text-white/90 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full py-2 px-4">
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                        <span>Väntar på inloggning...</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3 pt-2">
                    <Button
                      onClick={handleSendMagicLink}
                      variant="outline"
                      className="flex-1 h-12 rounded-2xl bg-white/10 backdrop-blur-sm border-2 border-white/30 text-white font-semibold hover:bg-white/20 touch-manipulation"
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
                      className="flex-1 h-12 rounded-2xl font-semibold text-white hover:bg-white/10 touch-manipulation"
                    >
                      Annan e-post
                    </Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSendMagicLink} className="space-y-6">
                  <div className="space-y-3">
                    <div className="relative group">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/70 transition-colors group-focus-within:text-white z-10" />
                      <Input
                        type="email"
                        placeholder="din@email.se"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={isLoading}
                        className="pl-12 h-14 text-base rounded-2xl bg-white/10 backdrop-blur-sm border-2 border-white/30 text-white placeholder:text-white/60 focus:border-white/50 transition-all touch-manipulation"
                        required
                      />
                    </div>
                  </div>
                  
                  <Button
                    type="submit"
                    disabled={isLoading || !email}
                    className="w-full h-14 text-base font-semibold rounded-2xl bg-white text-blue-600 hover:bg-white/95 shadow-2xl touch-manipulation transition-all"
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
              
              <div className="pt-2">
                <p className="text-xs text-center text-white/70 leading-relaxed px-2">
                  {linkSent 
                    ? 'Klicka på länken i e-posten för att logga in säkert.'
                    : 'Vi skickar en säker inloggningslänk till din e-post. Inget lösenord krävs.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
