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
 * EmailVerification - Handles email verification on auth.tivly.se
 * 
 * Users receive verification emails with links to auth.tivly.se/verify-email
 * After verification, they're redirected back to their original domain
 */
const EmailVerification = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshUser } = useAuth();
  const [state, setState] = useState<VerificationState>('verifying');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const verifyEmail = async () => {
      const code = searchParams.get('code');
      
      if (!code) {
        setState('invalid');
        setErrorMessage('Ingen verifieringskod hittades.');
        setTimeout(() => {
          const redirectDomain = getRedirectDomain();
          window.location.href = redirectDomain;
        }, 3000);
        return;
      }

      setState('verifying');
      
      try {
        await apiClient.verifyEmail(code);
        
        setState('success');
        
        // If we're on auth domain, redirect to origin domain
        if (isAuthDomain()) {
          const redirectDomain = getRedirectDomain();
          localStorage.removeItem('auth_origin_domain');
          setTimeout(() => {
            window.location.href = `${redirectDomain}?email_verified=true`;
          }, 1500);
        } else {
          // If we're on app/io domain, refresh and redirect
          await refreshUser();
          setTimeout(() => navigate('/'), 1500);
        }
      } catch (error: any) {
        console.error('Email verification error:', error);
        setState('error');
        
        const message = error.message || 'Verifiering misslyckades';
        
        if (message.includes('invalid_code') || message.includes('code_not_found')) {
          setErrorMessage('Verifieringskoden är ogiltig eller har redan använts.');
        } else if (message.includes('code_expired')) {
          setErrorMessage('Verifieringskoden har gått ut. Begär en ny kod.');
        } else {
          setErrorMessage(message);
        }
        
        setTimeout(() => {
          const redirectDomain = getRedirectDomain();
          window.location.href = redirectDomain;
        }, 4000);
      }
    };

    verifyEmail();
  }, [searchParams, navigate, refreshUser]);

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

  const handleReturnToDomain = () => {
    const redirectDomain = getRedirectDomain();
    window.location.href = redirectDomain;
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
              {state === 'success' ? 'E-post verifierad!' : state === 'verifying' ? 'Verifierar...' : 'Något gick fel'}
            </CardTitle>
            <CardDescription className="text-base">
              {state === 'success' 
                ? 'Din e-post har verifierats. Du omdirigeras tillbaka...' 
                : state === 'verifying'
                ? 'Verifierar din e-postadress...'
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
            
            {(state === 'error' || state === 'invalid') && (
              <div className="space-y-4 w-full">
                <p className="text-sm text-muted-foreground text-center">
                  Du omdirigeras tillbaka om några sekunder...
                </p>
                <Button 
                  onClick={handleReturnToDomain}
                  className="w-full"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Gå tillbaka nu
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmailVerification;
