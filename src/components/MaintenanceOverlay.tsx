import { useEffect, useState } from 'react';
import { Construction } from 'lucide-react';
import { apiClient, MaintenanceStatus } from '@/lib/api';
import { useSubscription } from '@/contexts/SubscriptionContext';

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
      console.error('Failed to check maintenance status:', error);
      setMaintenance(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkMaintenance();
    const interval = setInterval(checkMaintenance, 30000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) return null;
  if (!maintenance?.enabled) return null;

  // Admins can bypass maintenance mode
  if (isAdmin) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9998] bg-amber-500/90 text-amber-950 px-4 py-2 text-center text-sm font-medium backdrop-blur-sm">
        <Construction className="w-4 h-4 inline-block mr-2" />
        Underhållsläge aktivt
      </div>
    );
  }

  // Block non-admin users with minimalist design
  return (
    <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center p-6">
      <div className="text-center space-y-6 max-w-sm">
        <div className="w-14 h-14 mx-auto rounded-full bg-muted flex items-center justify-center">
          <Construction className="w-7 h-7 text-muted-foreground" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">Underhåll pågår</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Vi utför underhåll på Tivly just nu. Vänligen försök igen om en stund.
          </p>
        </div>
      </div>
    </div>
  );
};
