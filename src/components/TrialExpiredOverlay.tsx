import { AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface TrialExpiredOverlayProps {
  companyName: string;
  daysRemaining?: number | null;
  expired: boolean;
  manuallyDisabled?: boolean;
}

export const TrialExpiredOverlay = ({ companyName, daysRemaining, expired, manuallyDisabled }: TrialExpiredOverlayProps) => {
  // If manually disabled, full access is granted - no overlay
  if (manuallyDisabled) {
    return null;
  }

  // Show banner for all active trial days, blocking overlay only when expired
  if (!expired && (daysRemaining === null || daysRemaining === undefined)) {
    return null;
  }

  const showBanner = !expired && daysRemaining !== null && daysRemaining > 0;

  // Blocking overlay when expired
  if (expired) {
    return (
      <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center" style={{ pointerEvents: 'all' }}>
        <Card className="max-w-md mx-4 p-8 text-center space-y-4 pointer-events-auto">
        <div className="flex justify-center">
          <div className={`rounded-full p-4 ${expired ? 'bg-destructive/10' : 'bg-yellow-500/10'}`}>
            <AlertTriangle className={`h-12 w-12 ${expired ? 'text-destructive' : 'text-yellow-500'}`} />
          </div>
        </div>
        
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-foreground">Testperioden har löpt ut</h2>
            <p className="text-muted-foreground">
              Testperioden för {companyName} har löpt ut. Kontakta din företagsadministratör för att förnya tillgången.
            </p>
          </div>

          <div className="pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Alla möten och data är säkrade och kommer att vara tillgängliga igen när tillgången förnyas.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // Non-blocking banner for active trial countdown
  if (showBanner) {
    const getBannerColor = () => {
      if (daysRemaining! <= 3) return 'bg-destructive/90 border-destructive';
      if (daysRemaining! <= 7) return 'bg-yellow-600/90 border-yellow-600';
      return 'bg-primary/90 border-primary';
    };

    return (
      <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none">
        <div className={`${getBannerColor()} border-b-2 px-6 py-3 shadow-lg pointer-events-auto`}>
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-3">
            <AlertTriangle className="h-5 w-5 text-white flex-shrink-0" />
            <p className="text-white font-semibold text-center">
              {daysRemaining === 1 
                ? `Sista dagen av testperioden för ${companyName}` 
                : `${daysRemaining} dagar kvar av testperioden för ${companyName}`}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
