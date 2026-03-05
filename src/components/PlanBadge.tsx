import { useState, useEffect } from 'react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Sparkles, TrendingUp, Shield, Users } from 'lucide-react';
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
  
  // Check if running on iOS app domain
  const isIosApp = typeof window !== 'undefined' && window.location.hostname === 'io.tivly.se';

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
        const adminStatus = roleData && (roleData.role === 'admin' || roleData.role === 'owner');
        setIsAdmin(adminStatus);
      } catch (error) {
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
  // Team, Enterprise, unlimited have no limits
  const isUnlimited = isAdmin || 
    limit === null || 
    userPlan.plan === 'team' ||
    userPlan.plan === 'enterprise';
  const progress = isUnlimited ? 0 : Math.min((used / limit) * 100, 100);

  const getPlanTitle = () => {
    if (isAdmin) return 'Admin';
    
    switch (userPlan.plan) {
      case 'free':
        return 'Gratis';
      case 'pro':
        return 'Pro';
      case 'team':
        return 'Team';
      case 'enterprise':
        return 'Enterprise';
      default:
        return 'Plan';
    }
  };

  const getPlanIcon = () => {
    if (isAdmin) return <Shield className="h-3.5 w-3.5 text-primary" aria-hidden="true" />;
    if (userPlan.plan === 'team') return <Users className="h-3.5 w-3.5 text-primary" aria-hidden="true" />;
    return <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />;
  };

  // ASR for live recording: Team and Enterprise (and Admins)
  const hasASR = isAdmin || userPlan.plan === 'team' || userPlan.plan === 'enterprise';

  return (
    <div className={cn('inline-flex flex-col gap-0.5', className)}>
      <div className="inline-flex items-center gap-2 rounded-md border border-border bg-card/80 text-card-foreground px-3 py-1 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/70">
        {getPlanIcon()}
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
            Obegränsat
          </span>
        )}
        {/* On iOS app, never show upgrade button - Apple compliance */}
        {!isIosApp && userPlan.plan === 'free' && !isUnlimited && !userPlan.planCancelledAt && used >= limit && (
          <Button size="sm" className="h-6 px-2 text-[11px]" onClick={() => setDialogOpen(true)} variant="default">
            <TrendingUp className="mr-1 h-3 w-3" /> Uppgradera
          </Button>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground/70 pl-1">
        {hasASR ? 'Server-transkribering' : 'Webbläsar-transkribering'}
      </span>
      <SubscribeDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
};
