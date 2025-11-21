import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import { Loader2, CheckCircle2, XCircle, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import tivlyLogo from '@/assets/tivly-logo.png';
import { getRedirectDomain, isAuthDomain } from '@/utils/environment';

type VerificationState = 'verifying' | 'success' | 'error' | 'invalid';

/**
 * MagicLogin - Handles cross-domain magic link verification
 * 
 * Users can request a magic link from either app.tivly.se or io.tivly.se,
 * and click the link from any device/domain. The verification will work
 * seamlessly across both domains, allowing flexible authentication flows.
 */
const MagicLogin = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshUser } = useAuth();
  const [state, setState] = useState<VerificationState>('verifying');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const verifyToken = async () => {
      const token = searchParams.get('token');
      const returnUrl = searchParams.get('return');
      
      if (!token) {
        setState('invalid');
        setErrorMessage('Ingen verifieringstoken hittades.');
        return;
      }

      setState('verifying');
      
      // Retry logic with exponential backoff
      const maxRetries = 3;
      let attempt = 0;
      
      while (attempt < maxRetries) {
        try {
          // Verify the magic link token with the API
          const response = await apiClient.verifyMagicLink(token);
          
          setState('success');
          
          // Redirect back to origin domain with token
          const redirectDomain = returnUrl || window.location.origin;
          const separator = redirectDomain.includes('?') ? '&' : '?';
          
          // Immediate redirect - no delay needed
          window.location.href = `${redirectDomain}${separator}token=${response.token}`;
          return;
        } catch (error: any) {
          attempt++;
          console.error(`Magic link verification attempt ${attempt} failed:`, error);
          
          // If this was the last attempt, show error
          if (attempt >= maxRetries) {
            const message = error.message || 'Verifiering misslyckades';
            
            // For generic network errors, just redirect anyway with the token
            if (message.includes('Failed to fetch') || message.includes('network')) {
              console.log('Network error, redirecting with token anyway');
              const redirectDomain = returnUrl || window.location.origin;
              const separator = redirectDomain.includes('?') ? '&' : '?';
              window.location.href = `${redirectDomain}${separator}token=${token}`;
              return;
            }
            
            setState('error');
            
            if (message.includes('invalid_token') || message.includes('token_not_found')) {
              setErrorMessage('Länken är ogiltig eller har redan använts.');
            } else if (message.includes('token_expired')) {
              setErrorMessage('Länken har gått ut. Begär en ny länk.');
            } else {
              setErrorMessage(message);
            }
            
            // Auto-redirect to auth page after error
            setTimeout(() => {
              window.location.href = `${window.location.origin}/auth`;
            }, 3000);
          } else {
            // Wait before retrying (exponential backoff: 1s, 2s, 4s)
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
          }
        }
      }
    };

    verifyToken();
  }, [searchParams]);


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
              {state === 'success' ? 'Inloggning lyckades!' : state === 'verifying' ? 'Verifierar...' : 'Något gick fel'}
            </CardTitle>
            <CardDescription className="text-base">
              {state === 'success' ? 'Du omdirigeras till startsidan...' : errorMessage}
            </CardDescription>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6 pb-8">
          <div className="flex flex-col items-center justify-center space-y-6">
            <div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center ${
              state === 'success' ? 'bg-primary/10' : state === 'verifying' ? 'bg-primary/10' : 'bg-destructive/10'
            }`}>
              {getStatusIcon()}
            </div>
            
            {(state === 'error' || state === 'invalid') && (
              <div className="space-y-4 w-full">
                <p className="text-sm text-muted-foreground text-center">
                  Du omdirigeras till inloggningssidan om några sekunder...
                </p>
                <Button 
                  onClick={() => window.location.href = 'https://app.tivly.se/auth'}
                  className="w-full"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Gå till inloggning nu
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MagicLogin;
