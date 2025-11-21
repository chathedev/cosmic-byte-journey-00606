import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import tivlyLogo from '@/assets/tivly-logo.png';

/**
 * Auth - Redirect to auth.tivly.se
 * 
 * This component redirects users from app.tivly.se and io.tivly.se to auth.tivly.se
 * where they can authenticate and get redirected back.
 */
const Auth = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate('/');
      return;
    }

    // Redirect to auth.tivly.se for authentication
    const currentDomain = window.location.hostname;
    const domainParam = currentDomain === 'io.tivly.se' ? 'ios' : 'app';
    
    // Store current domain for post-auth redirect
    localStorage.setItem('auth_origin_domain', window.location.origin);
    
    // Redirect to auth domain
    window.location.href = `https://auth.tivly.se/auth?from=${domainParam}`;
  }, [user, navigate]);

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-secondary/10" />
      
      <div className="w-full max-w-md relative z-10 text-center space-y-6">
        <div className="mx-auto w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/30 to-secondary/30 border-2 border-primary/40 flex items-center justify-center shadow-xl">
          <img 
            src={tivlyLogo}
            alt="Tivly" 
            className="w-12 h-12 object-contain"
          />
        </div>
        
        <div className="space-y-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
          <h2 className="text-2xl font-bold text-foreground">
            Omdirigerar till inloggning...
          </h2>
          <p className="text-sm text-muted-foreground">
            Du kommer snart vidare till inloggningssidan
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
