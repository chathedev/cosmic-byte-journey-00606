import { AlertTriangle, Smartphone, Globe } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DomainGuardProps {
  type: 'ios-required' | 'web-only';
}

export const DomainGuard = ({ type }: DomainGuardProps) => {
  if (type === 'ios-required') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm p-4">
        <Card className="max-w-md w-full shadow-lg border-destructive/20">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <Smartphone className="w-8 h-8 text-destructive" />
            </div>
            <CardTitle className="text-xl">iOS-appen krävs</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              Den här sidan är endast tillgänglig i Tivly iOS-appen för Apple-betalningar.
            </p>
            <p className="text-sm text-muted-foreground">
              Ladda ner appen från App Store eller använd{' '}
              <a 
                href="https://app.tivly.se" 
                className="text-primary underline hover:no-underline"
              >
                app.tivly.se
              </a>{' '}
              för webbversionen.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (type === 'web-only') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm p-4">
        <Card className="max-w-md w-full shadow-lg border-warning/20">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center">
              <Globe className="w-8 h-8 text-warning" />
            </div>
            <CardTitle className="text-xl">Endast webbversion</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              Den här sidan är endast tillgänglig i webbversionen av Tivly.
            </p>
            <p className="text-sm text-muted-foreground">
              Använd iOS-appen för Apple-betalningar eller gå tillbaka till startsidan.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
};
