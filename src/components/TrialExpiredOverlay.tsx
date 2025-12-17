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

  // Only show blocking overlay when expired
  if (!expired) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center" style={{ pointerEvents: 'all' }}>
      <Card className="max-w-md mx-4 p-8 text-center space-y-4 pointer-events-auto">
        <div className="flex justify-center">
          <div className="rounded-full p-4 bg-destructive/10">
            <AlertTriangle className="h-12 w-12 text-destructive" />
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
};
