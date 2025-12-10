import { TranscriptionInterface } from "@/components/TranscriptionInterface";
import { SubscribeDialog } from "@/components/SubscribeDialog";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { isTestAccount } from "@/utils/demoData";
import { Badge } from "@/components/ui/badge";

const Index = () => {
  const { userPlan, isLoading } = useSubscription();
  const { user } = useAuth();
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  
  const isDemoAccount = isTestAccount(user?.email);

  return (
    <>
      {/* Loading bar */}
      {isLoading && (
        <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-gradient-to-r from-primary via-primary/60 to-primary animate-pulse">
          <div className="h-full w-full bg-gradient-to-r from-transparent via-background/20 to-transparent animate-[slide-in-right_1s_ease-in-out_infinite]" />
        </div>
      )}

      {/* Demo Banner */}
      {isDemoAccount && (
        <div className="fixed top-0 left-0 right-0 z-40 bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-amber-500/20 border-b border-amber-500/30 px-4 py-2">
          <div className="flex items-center justify-center gap-2">
            <Badge variant="secondary" className="bg-amber-500/20 text-amber-600 border-amber-500/30">
              Demo-läge
            </Badge>
            <span className="text-xs text-amber-600 dark:text-amber-400">
              Testkonto med exempeldata
            </span>
          </div>
        </div>
      )}

      <div className={isDemoAccount ? "pt-10" : ""}>
        <TranscriptionInterface 
          isFreeTrialMode={userPlan?.plan === 'free'}
        />
      </div>
      <SubscribeDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog} />
    </>
  );
};

export default Index;
