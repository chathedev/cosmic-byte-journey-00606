import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import { Loader2, CheckCircle2, XCircle, Mail, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import tivlyLogo from '@/assets/tivly-logo.png';
import { getRedirectDomain, isAuthDomain } from '@/utils/environment';

type VerificationState = 'verifying' | 'success' | 'error' | 'invalid';

/**
 * MagicLogin - Handles cross-domain magic link verification
 * 
 * Per playbook:
 * - Email links point to https://auth.tivly.se/magic-login
 * - This page verifies the token and redirects back to originating domain
 * - Redirect includes ?token=... so the app can complete login
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
      
      console.log('🔐 [Playbook Step 6] MagicLogin page loaded');
      console.log('📋 Token present:', !!token);
      console.log('📋 Return URL:', returnUrl || 'none (will default to app.tivly.se)');
      
      if (!token) {
        console.error('❌ No token parameter found in URL');
        setState('invalid');
        setErrorMessage('Ingen verifieringstoken hittades.');
        return;
      }

      setState('verifying');
      
      try {
        // Playbook Step 6: Funnel through /auth/magic-link/verify
        console.log('🔐 [Playbook Step 6] Calling /auth/magic-link/verify...');
        const response = await apiClient.verifyMagicLink(token);
        
        setState('success');
        console.log('✅ [Playbook Step 6] Token verified successfully');
        console.log('📝 Received JWT from backend:', response.token ? 'present' : 'missing');
        
        // Playbook Step 6: Redirect back to originating domain with JWT attached as ?token=
        const redirectDomain = returnUrl || window.location.origin.replace('auth.', 'app.');
        const separator = redirectDomain.includes('?') ? '&' : '?';
        const finalUrl = `${redirectDomain}${separator}token=${response.token}`;
        
        console.log('🔄 [Playbook Step 6] Redirecting to originating domain with JWT');
        console.log('🎯 Final redirect URL:', finalUrl);
        
        // Show success briefly before redirect (1.5s for user feedback)
        setTimeout(() => {
          window.location.href = finalUrl;
        }, 1500);
        
      } catch (error: any) {
        console.error('❌ [Playbook Step 6] Magic link verification failed:', error);
        setState('error');
        
        const message = error.message || 'Verifiering misslyckades';
        
        // Handle specific error cases
        if (message.includes('invalid_token') || message.includes('token_not_found')) {
          setErrorMessage('Länken är ogiltig eller har redan använts.');
        } else if (message.includes('token_expired') || message.includes('expired')) {
          setErrorMessage('Länken har gått ut. Begär en ny länk.');
        } else if (message.includes('CORS') || message.includes('Failed to fetch')) {
          setErrorMessage('Nätverksfel. Kontrollera din internetanslutning.');
        } else {
          setErrorMessage(message);
        }
        
        // Auto-redirect to login after 5 seconds on error
        setTimeout(() => {
          const loginUrl = returnUrl || window.location.origin.replace('auth.', 'app.') + '/auth';
          window.location.href = loginUrl;
        }, 5000);
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
              {state === 'success' 
                ? 'Verifierad! Omdirigerar till appen...' 
                : state === 'verifying' 
                ? 'Verifierar din magiska länk...' 
                : errorMessage}
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
            
            {state === 'success' && (
              <div className="space-y-4 w-full animate-in fade-in duration-500">
                <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                  <div className="flex items-center gap-3 justify-center">
                    <Sparkles className="w-5 h-5 text-primary animate-pulse" />
                    <p className="text-sm font-medium">Länken verifierad!</p>
                  </div>
                </div>
              </div>
            )}

            {(state === 'error' || state === 'invalid') && (
              <div className="space-y-4 w-full animate-in fade-in duration-500">
                <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                  <p className="text-sm text-destructive text-center font-medium">
                    {errorMessage}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Omdirigeras automatiskt om 5 sekunder...
                </p>
                <Button 
                  onClick={() => {
                    const returnUrl = searchParams.get('return');
                    const loginUrl = returnUrl || window.location.origin.replace('auth.', 'app.') + '/auth';
                    window.location.href = loginUrl;
                  }}
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
