import { AlertTriangle, Ban } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface TrialExpiredOverlayProps {
  companyName: string;
  daysRemaining?: number;
  expired: boolean;
  manuallyDisabled?: boolean;
}

export const TrialExpiredOverlay = ({ companyName, daysRemaining, expired, manuallyDisabled }: TrialExpiredOverlayProps) => {
  if (!expired && (daysRemaining === undefined || daysRemaining > 3)) {
    return null;
  }

  const isManuallyDisabled = manuallyDisabled && expired;
  const isNaturallyExpired = expired && !manuallyDisabled;
  const showWarning = !expired && daysRemaining && daysRemaining <= 3;
  const isAnyExpired = isNaturallyExpired || isManuallyDisabled;

  return (
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center ${isAnyExpired ? 'bg-black/80' : 'pointer-events-none'}`}
      style={isAnyExpired ? { pointerEvents: 'all' } : {}}
    >
      <Card className={`max-w-md mx-4 p-8 text-center space-y-4 ${showWarning ? 'pointer-events-auto' : ''}`}>
        <div className="flex justify-center">
          <div className={`rounded-full p-4 ${
            isManuallyDisabled ? 'bg-orange-500/10' :
            isNaturallyExpired ? 'bg-destructive/10' : 
            'bg-yellow-500/10'
          }`}>
            {isManuallyDisabled ? (
              <Ban className="h-12 w-12 text-orange-500" />
            ) : (
              <AlertTriangle className={`h-12 w-12 ${isNaturallyExpired ? 'text-destructive' : 'text-yellow-500'}`} />
            )}
          </div>
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">
            {isManuallyDisabled ? 'Testperioden har pausats' :
             isNaturallyExpired ? 'Testperioden har löpt ut' : 
             `${daysRemaining} dagar kvar av testperioden`}
          </h2>
          <p className="text-muted-foreground">
            {isManuallyDisabled 
              ? `Testperioden för ${companyName} har pausats av administratören. Kontakta din företagsadministratör för att återaktivera tillgången.`
              : isNaturallyExpired
              ? `Testperioden för ${companyName} har löpt ut. Kontakta din företagsadministratör för att förnya tillgången.`
              : `Din testperiod för ${companyName} löper snart ut. Kontakta din företagsadministratör för att förnya tillgången.`
            }
          </p>
        </div>

        {isAnyExpired && (
          <div className="pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Alla möten och data är säkrade och kommer att vara tillgängliga igen när tillgången {isManuallyDisabled ? 'återaktiveras' : 'förnyas'}.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
};
