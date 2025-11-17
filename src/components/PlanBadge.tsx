import { useState, useEffect } from 'react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Sparkles, TrendingUp, Shield } from 'lucide-react';
import { SubscribeDialog } from './SubscribeDialog';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';


interface PlanBadgeProps {
  className?: string;
}

export const PlanBadge = ({ className }: PlanBadgeProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { userPlan, isLoading: planLoading, refreshPlan } = useSubscription();
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  // Check admin status and refresh plan on mount
  useEffect(() => {
    refreshPlan();
    
    const checkAdmin = async () => {
      if (!user?.email) {
        setIsAdmin(false);
        return;
      }
      
      try {
        const roleData = await apiClient.getUserRole(user.email.toLowerCase());
        setIsAdmin(roleData && (roleData.role === 'admin' || roleData.role === 'owner'));
      } catch {
        setIsAdmin(false);
      }
    };
    
    checkAdmin();
  }, [user?.email]);

  // Show skeleton while loading
  if (planLoading || !userPlan) {
    return (
      <div className={cn('inline-flex items-center gap-2 rounded-md border border-border bg-card/80 px-3 py-1', className)}>
        <Skeleton className="h-3.5 w-3.5 rounded-full" />
        <Skeleton className="h-3 w-16" />
      </div>
    );
  }

  const used = userPlan.meetingsUsed;
  const limit = userPlan.meetingsLimit;
  // Enterprise and Unlimited plans have unlimited access, but Pro (standard) has 10 meetings limit
  const isUnlimited = isAdmin || 
    limit === null || 
    userPlan.plan === 'unlimited' || 
    userPlan.plan === 'enterprise';
  const progress = isUnlimited ? 0 : Math.min((used / limit) * 100, 100);

  const getPlanTitle = () => {
    if (isAdmin) return 'Admin';
    
    switch (userPlan.plan) {
      case 'free':
        return 'Gratis';
      case 'pro':
        return 'Pro';
      case 'plus':
        return 'Plus';
      case 'unlimited':
        return 'Unlimited';
      case 'enterprise':
        return 'Enterprise';
      default:
        return 'Plan';
    }
  };

  return (
    <div className={cn('inline-flex items-center gap-2 rounded-md border border-border bg-card/80 text-card-foreground px-3 py-1 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/70', className)}>
      {isAdmin ? (
        <Shield className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
      ) : (
        <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
      )}
      <span className="text-xs font-medium whitespace-nowrap">{getPlanTitle()}</span>
      {!isUnlimited && (
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
            {limit - used} kvar
          </span>
          <div className="w-16 h-1.5 bg-secondary/30 rounded-sm overflow-hidden">
            <div
              className="h-full bg-primary rounded-sm transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
      {isUnlimited && (
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
          {used} / obegränsat
        </span>
      )}
      {!isUnlimited && !userPlan.planCancelledAt && userPlan.plan === 'free' && used >= limit && (
        <Button size="sm" className="h-6 px-2 text-[11px]" onClick={() => setDialogOpen(true)} variant="default">
          <TrendingUp className="mr-1 h-3 w-3" /> Uppgradera
        </Button>
      )}
      <SubscribeDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
};
