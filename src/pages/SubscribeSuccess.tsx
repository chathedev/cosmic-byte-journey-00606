import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSubscription } from '@/contexts/SubscriptionContext';

export default function SubscribeSuccess() {
  const navigate = useNavigate();
  const { refreshPlan } = useSubscription();

  useEffect(() => {
    // Refresh the plan after successful subscription
    const refresh = async () => {
      await refreshPlan();
      // Reload page to update all counters
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    };
    refresh();
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <CheckCircle className="h-20 w-20 text-green-500 mx-auto" />
        <h1 className="text-3xl font-bold text-foreground">
          Välkommen till Tivly!
        </h1>
        <p className="text-lg text-muted-foreground">
          Din prenumeration är nu aktiv. Du kan börja spela in och transkribera dina möten direkt.
        </p>
        <div className="space-y-3 pt-4">
          <Button
            onClick={() => navigate('/')}
            className="w-full"
            size="lg"
          >
            Börja spela in möte
          </Button>
          <Button
            onClick={() => navigate('/library')}
            variant="outline"
            className="w-full"
            size="lg"
          >
            Gå till bibliotek
          </Button>
        </div>
      </div>
    </div>
  );
}