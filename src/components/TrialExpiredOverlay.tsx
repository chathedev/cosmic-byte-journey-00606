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

  // Only show warnings/locks for natural expiration or approaching deadline
  if (!expired && (daysRemaining === null || daysRemaining === undefined || daysRemaining > 3)) {
    return null;
  }

  const showWarning = !expired && daysRemaining !== null && daysRemaining <= 3;

  return (
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center ${expired ? 'bg-black/80' : 'pointer-events-none'}`}
      style={expired ? { pointerEvents: 'all' } : {}}
    >
      <Card className={`max-w-md mx-4 p-8 text-center space-y-4 ${showWarning ? 'pointer-events-auto' : ''}`}>
        <div className="flex justify-center">
          <div className={`rounded-full p-4 ${expired ? 'bg-destructive/10' : 'bg-yellow-500/10'}`}>
            <AlertTriangle className={`h-12 w-12 ${expired ? 'text-destructive' : 'text-yellow-500'}`} />
          </div>
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">
            {expired ? 'Testperioden har löpt ut' : `${daysRemaining} dagar kvar av testperioden`}
          </h2>
          <p className="text-muted-foreground">
            {expired
              ? `Testperioden för ${companyName} har löpt ut. Kontakta din företagsadministratör för att förnya tillgången.`
              : `Din testperiod för ${companyName} löper snart ut. Kontakta din företagsadministratör för att förnya tillgången.`
            }
          </p>
        </div>

        {expired && (
          <div className="pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Alla möten och data är säkrade och kommer att vara tillgängliga igen när tillgången förnyas.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
};
