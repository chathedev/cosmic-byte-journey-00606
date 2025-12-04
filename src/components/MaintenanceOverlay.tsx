import { useEffect, useState } from 'react';
import { Construction, RefreshCw } from 'lucide-react';
import { apiClient, MaintenanceStatus } from '@/lib/api';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { Button } from './ui/button';

export const MaintenanceOverlay = () => {
  const { isAdmin } = useSubscription();
  const [maintenance, setMaintenance] = useState<MaintenanceStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkMaintenance = async () => {
    try {
      const result = await apiClient.getMaintenanceStatus();
      if (result.success) {
        setMaintenance(result.maintenance);
      }
    } catch (error) {
      // If we can't check maintenance, assume it's not enabled
      console.error('Failed to check maintenance status:', error);
      setMaintenance(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkMaintenance();
    
    // Poll every 30 seconds
    const interval = setInterval(checkMaintenance, 30000);
    return () => clearInterval(interval);
  }, []);

  // Don't show anything while loading
  if (isLoading) return null;

  // Don't show if maintenance is not enabled
  if (!maintenance?.enabled) return null;

  // Admins can bypass maintenance mode
  if (isAdmin) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9998] bg-yellow-500/90 text-yellow-950 px-4 py-2 text-center text-sm font-medium backdrop-blur-sm">
        <Construction className="w-4 h-4 inline-block mr-2" />
        Underhållsläge aktivt - endast synligt för dig som admin
      </div>
    );
  }

  // Block non-admin users
  return (
    <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-md flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-card rounded-xl border shadow-2xl p-8 text-center space-y-6 animate-in fade-in zoom-in-95 duration-300">
        <div className="mx-auto w-20 h-20 bg-yellow-500/20 rounded-full flex items-center justify-center">
          <Construction className="w-10 h-10 text-yellow-500" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Underhåll pågår</h1>
          <p className="text-muted-foreground">
            Vi utför för tillfället underhåll på Tivly. Vänligen försök igen om en stund.
          </p>
        </div>

        {maintenance.updatedAt && (
          <p className="text-xs text-muted-foreground">
            Påbörjat: {new Date(maintenance.updatedAt).toLocaleString('sv-SE')}
          </p>
        )}

        <Button 
          onClick={checkMaintenance} 
          variant="outline" 
          className="gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Kontrollera igen
        </Button>
      </div>
    </div>
  );
};
