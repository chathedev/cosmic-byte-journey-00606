import { useEffect } from 'react';
import { AlertCircle, Smartphone, Download } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import tivlyLogo from '@/assets/tivly-logo.png';

const AppOnlyAccess = () => {
  useEffect(() => {
    // Redirect to web version after a delay if user doesn't take action
    const timer = setTimeout(() => {
      window.location.href = 'https://app.tivly.se';
    }, 10000);
    
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-gradient-to-br from-background via-background to-destructive/5 safe-area-inset">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-12 w-72 h-72 bg-destructive/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 -right-12 w-96 h-96 bg-destructive/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <Card className="w-full max-w-md shadow-2xl border-2 border-destructive/20 relative z-10 backdrop-blur-sm bg-card/95 animate-in fade-in zoom-in duration-500">
        <CardHeader className="space-y-4 text-center pb-6">
          <div className="mx-auto w-24 h-24 relative">
            <img 
              src={tivlyLogo}
              alt="Tivly Logo" 
              className="w-full h-full object-contain drop-shadow-2xl"
            />
          </div>
          
          <div className="space-y-2">
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-destructive to-destructive/70 bg-clip-text text-transparent">
              App Required
            </CardTitle>
            <CardDescription className="text-base">
              This domain is only accessible through the Tivly mobile app
            </CardDescription>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6 pb-8">
          <div className="flex flex-col items-center justify-center space-y-6">
            <div className="mx-auto w-20 h-20 rounded-full flex items-center justify-center bg-destructive/10">
              <AlertCircle className="w-10 h-10 text-destructive animate-pulse" />
            </div>
            
            <div className="space-y-4 w-full text-center">
              <div className="space-y-2 p-4 bg-muted/30 rounded-xl">
                <div className="flex items-start gap-3 text-sm text-muted-foreground">
                  <Smartphone className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-left">
                    The <strong>io.tivly.se</strong> domain is reserved exclusively for our native iOS app
                  </span>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                To access Tivly from your web browser, please use:
              </p>

              <div className="p-4 bg-primary/5 rounded-xl border border-primary/20">
                <a 
                  href="https://app.tivly.se" 
                  className="text-lg font-semibold text-primary hover:underline"
                >
                  app.tivly.se
                </a>
              </div>
              
              <div className="flex flex-col gap-3 pt-2">
                <Button 
                  onClick={() => window.location.href = 'https://app.tivly.se'}
                  className="w-full"
                  size="lg"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Go to Web Version
                </Button>

                <p className="text-xs text-muted-foreground">
                  You'll be redirected automatically in 10 seconds...
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AppOnlyAccess;
