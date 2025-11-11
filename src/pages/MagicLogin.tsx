import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import { Loader2, CheckCircle2, XCircle, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import tivlyLogo from '@/assets/tivly-logo.png';

type VerificationState = 'verifying' | 'success' | 'error' | 'invalid';

const MagicLogin = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshUser } = useAuth();
  const [state, setState] = useState<VerificationState>('verifying');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    
    if (!token) {
      setState('invalid');
      return;
    }

    verifyToken(token);
  }, [searchParams]);

  const verifyToken = async (token: string) => {
    try {
      setState('verifying');
      
      // Verify the magic link token - this marks it as verified in backend
      // The requesting device (polling) will detect this and log in
      await apiClient.verifyMagicLink(token, { storeToken: false });
      
      // DO NOT log in this device - just show success
      setState('success');
      
    } catch (error: any) {
      setState('error');
      
      if (error.message.includes('token_expired') || error.message.includes('expired')) {
        setErrorMessage('Länken har gått ut. Begär en ny inloggningslänk.');
      } else if (error.message.includes('token_not_found') || error.message.includes('invalid')) {
        setErrorMessage('Ogiltig inloggningslänk. Kontrollera att du använder rätt länk från e-posten.');
      } else if (error.message.includes('browser_blocked')) {
        setErrorMessage('Denna enhet kan inte användas för att skapa ett nytt konto. Om du har ett Enterprise-konto, kontakta din administratör.');
      } else {
        setErrorMessage('Ett fel uppstod vid inloggning. Försök igen.');
      }
    }
  };

  const getStatusIcon = () => {
    switch (state) {
      case 'verifying':
        return <Loader2 className="w-10 h-10 text-primary animate-spin" />;
      case 'success':
        return <CheckCircle2 className="w-10 h-10 text-primary animate-in zoom-in duration-300" />;
      case 'error':
      case 'invalid':
        return <XCircle className="w-10 h-10 text-destructive" />;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-gradient-to-br from-background via-background to-primary/5">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-12 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-1/4 -right-12 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }} />
      </div>

      <Card className="w-full max-w-md shadow-2xl border-2 relative z-10 backdrop-blur-sm bg-card/95 animate-in fade-in zoom-in duration-500">
        <CardHeader className="space-y-4 text-center pb-8">
          <div className="mx-auto w-24 h-24 relative">
            <img 
              src={tivlyLogo}
              alt="Tivly Logo" 
              className="w-full h-full object-contain drop-shadow-2xl"
            />
          </div>
          
          <div className="space-y-2">
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              {state === 'verifying' && 'Verifierar...'}
              {state === 'success' && 'Klart!'}
              {state === 'error' && 'Något gick fel'}
              {state === 'invalid' && 'Ogiltig länk'}
            </CardTitle>
            <CardDescription className="text-base">
              {state === 'verifying' && 'Verifierar din inloggningslänk'}
              {state === 'success' && 'Inloggningen är godkänd'}
              {state === 'error' && 'Något gick fel'}
              {state === 'invalid' && 'Ingen inloggningslänk hittades'}
            </CardDescription>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6 pb-8">
          <div className="flex flex-col items-center justify-center space-y-6">
            {state === 'verifying' && (
              <div className="space-y-4 text-center animate-in fade-in duration-300">
                <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                  {getStatusIcon()}
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Verifierar din identitet...
                  </p>
                  <div className="flex items-center justify-center gap-1">
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            {state === 'success' && (
              <div className="space-y-5 text-center animate-in fade-in zoom-in duration-500">
                <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                  {getStatusIcon()}
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-lg font-semibold">Inloggning godkänd!</p>
                    <p className="text-sm text-muted-foreground">
                      Den enhet som begärde inloggningen är nu inloggad.
                    </p>
                  </div>
                  <div className="pt-2 pb-1">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
                      <CheckCircle2 className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium text-primary">Du kan stänga denna flik</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {state === 'error' && (
              <div className="space-y-4 text-center animate-in fade-in duration-300">
                <div className="mx-auto w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
                  {getStatusIcon()}
                </div>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {errorMessage}
                  </p>
                  <Button
                    onClick={() => navigate('/auth')}
                    className="w-full"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Begär ny inloggningslänk
                  </Button>
                </div>
              </div>
            )}

            {state === 'invalid' && (
              <div className="space-y-4 text-center animate-in fade-in duration-300">
                <div className="mx-auto w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
                  {getStatusIcon()}
                </div>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Ingen inloggningslänk hittades i URL:en. Kontrollera att du använder rätt länk från e-posten.
                  </p>
                  <Button
                    onClick={() => navigate('/auth')}
                    className="w-full"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Gå till inloggning
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MagicLogin;
