import { AlertCircle, Globe } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import tivlyLogo from '@/assets/tivly-logo.png';
import { apiClient } from '@/lib/api';
import { useNavigate } from 'react-router-dom';

interface NoAppAccessScreenProps {
  onLogout?: () => void;
}

const NoAppAccessScreen = ({ onLogout }: NoAppAccessScreenProps) => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await apiClient.logout();
      if (onLogout) {
        onLogout();
      }
      navigate('/auth', { replace: true });
    } catch (error) {
      console.error('Logout failed:', error);
      navigate('/auth', { replace: true });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-gradient-to-br from-background via-background to-muted/30 safe-area-inset">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-12 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 -right-12 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <Card className="w-full max-w-md shadow-2xl border-2 relative z-10 backdrop-blur-sm bg-card/95 animate-in fade-in zoom-in duration-500">
        <CardHeader className="space-y-4 text-center pb-6">
          <div className="mx-auto w-24 h-24 relative">
            <img 
              src={tivlyLogo}
              alt="Tivly Logo" 
              className="w-full h-full object-contain drop-shadow-2xl"
            />
          </div>
          
          <div className="space-y-2">
            <CardTitle className="text-2xl font-bold">
              Åtkomst saknas
            </CardTitle>
            <CardDescription className="text-base">
              Ditt konto saknar åtkomst till mobilappen
            </CardDescription>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6 pb-8">
          <div className="flex flex-col items-center justify-center space-y-6">
            <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center bg-muted">
              <AlertCircle className="w-8 h-8 text-muted-foreground" />
            </div>
            
            <div className="space-y-4 w-full text-center">
              <p className="text-sm text-muted-foreground px-4">
                För att använda Tivly-appen behöver du ett Pro- eller Enterprise-konto.
              </p>

              <div className="p-4 bg-muted/30 rounded-xl space-y-3">
                <div className="flex items-start gap-3 text-sm text-muted-foreground">
                  <Globe className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-left">
                    Ändringar av din plan görs på din kontosida på webben.
                  </span>
                </div>
              </div>
              
              <div className="flex flex-col gap-3 pt-2">
                <Button 
                  onClick={handleLogout}
                  variant="outline"
                  className="w-full"
                  size="lg"
                >
                  Logga ut
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default NoAppAccessScreen;
