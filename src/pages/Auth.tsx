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

/**
 * Auth - Login page for app.tivly.se and io.tivly.se
 * 
 * Users login here and receive magic links via email.
 * Magic links point to auth.tivly.se for verification, then redirect back here.
 */
const Auth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, refreshUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Handle token from magic link redirect
  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      apiClient.applyAuthToken(token);
      refreshUser();
      navigate('/', { replace: true });
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
      const redirectUrl = window.location.origin;
      await apiClient.requestMagicLink(email, redirectUrl);
      
      setLinkSent(true);
      setCooldown(60);
      toast.success('Magisk länk skickad! Kolla din e-post.');
    } catch (error: any) {
      console.error('Failed to send magic link:', error);
      toast.error(error.message || 'Kunde inte skicka länk');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setLinkSent(false);
    setEmail('');
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
