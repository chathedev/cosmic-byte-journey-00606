import { useEffect, useState, useRef, useCallback, useContext } from 'react';
import { Construction } from 'lucide-react';
import { apiClient, MaintenanceStatus } from '@/lib/api';
import { SubscriptionContext } from '@/contexts/SubscriptionContext';

export const MaintenanceOverlay = () => {
  // Use context directly to avoid throwing when outside provider
  const subscriptionContext = useContext(SubscriptionContext);
  const isAdmin = subscriptionContext?.isAdmin ?? false;
  
  const [maintenance, setMaintenance] = useState<MaintenanceStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const initialLoadDone = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const checkMaintenance = useCallback(async (skipIfLoaded = false) => {
    // Don't update state if we already have data and this is a background refresh
    if (skipIfLoaded && initialLoadDone.current) {
      try {
        // Cancel any pending request
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();
        
        // Add timeout for background requests (3 seconds)
        const timeoutId = setTimeout(() => abortControllerRef.current?.abort(), 3000);
        
        const result = await apiClient.getMaintenanceStatus();
        clearTimeout(timeoutId);
        
        if (result.success) {
          setMaintenance(result.maintenance);
        }
      } catch (error) {
        // Silently ignore background refresh errors
      }
      return;
    }

    try {
      // Cancel any pending request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();
      
      // Add timeout for initial request (5 seconds)
      const timeoutId = setTimeout(() => {
        abortControllerRef.current?.abort();
        // Don't block the app - just show it without maintenance
        setIsLoading(false);
        initialLoadDone.current = true;
      }, 5000);
      
      const result = await apiClient.getMaintenanceStatus();
      clearTimeout(timeoutId);
      
      if (result.success) {
        setMaintenance(result.maintenance);
        initialLoadDone.current = true;
      }
    } catch (error) {
      // Don't log errors for aborted requests
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Failed to check maintenance status:', error);
      }
      // Don't reset maintenance state on error - keep last known state
      if (!initialLoadDone.current) {
        setMaintenance(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Non-blocking initial check - app loads immediately
    setIsLoading(false);
    checkMaintenance(false);
    
    // Background refresh - won't cause UI flicker (every 60 seconds instead of 30)
    const interval = setInterval(() => checkMaintenance(true), 60000);
    
    return () => {
      clearInterval(interval);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [checkMaintenance]);

  // Never block initial render - show content immediately
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
