import { useState } from 'react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { Button } from '@/components/ui/button';
import { Sparkles, TrendingUp } from 'lucide-react';
import { SubscribeDialog } from './SubscribeDialog';

export const UpgradeBanner = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { userPlan } = useSubscription();

  if (!userPlan) return null;

  // Enterprise and Unlimited plans have unlimited access, but Pro (standard) has 10 meetings limit
  const isUnlimited = userPlan.meetingsLimit === null || 
    userPlan.plan === 'unlimited' || 
    userPlan.plan === 'enterprise';
  const displayLimit = userPlan.meetingsLimit ?? 0;
  
  const progress = isUnlimited ? 0 : Math.min((userPlan.meetingsUsed / displayLimit) * 100, 100);
  
  const getPlanTitle = () => {
    switch (userPlan.plan) {
      case 'free':
        return 'Free';
      case 'pro':
        return 'Pro';
      case 'plus':
        return 'Plus';
      case 'unlimited':
        return 'Unlimited';
      default:
        return 'Din Plan';
    }
  };

  const getPlanMessage = () => {
    if (userPlan.plan === 'free') {
      return `Du har använt ${userPlan.meetingsUsed} av ${displayLimit} gratis möte. Uppgradera till Pro för fler möten och AI-protokoll!`;
    }
    if (userPlan.plan === 'pro') {
      const remaining = displayLimit - userPlan.meetingsUsed;
      return `Du har ${remaining} möten kvar av ${displayLimit} möten denna månad.`;
    }
    // For unlimited plans: show unlimited access
    return `Du har obegränsad tillgång till möten och funktioner.`;
  };

  return (
    <>
      <div className="bg-gradient-to-r from-primary/10 to-secondary/10 border border-primary/20 rounded-lg p-3 mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm text-foreground truncate">{getPlanTitle()}</h3>
              {!isUnlimited && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {displayLimit - userPlan.meetingsUsed} kvar
                  </span>
                  <div className="flex-1 bg-secondary/20 rounded-full h-1.5 min-w-[60px] max-w-[120px]">
                    <div 
                      className="bg-primary h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
              {isUnlimited && (
                <span className="text-xs text-primary font-semibold">∞ Obegränsade möten</span>
              )}
            </div>
          </div>
          {(userPlan.plan === 'free') && (
            <Button 
              onClick={() => setDialogOpen(true)}
              size="sm"
              className="shrink-0 h-8 text-xs"
              variant="default"
            >
              <TrendingUp className="mr-1.5 h-3.5 w-3.5" />
              Uppgradera till Pro
            </Button>
          )}
        </div>
      </div>
      <SubscribeDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
};