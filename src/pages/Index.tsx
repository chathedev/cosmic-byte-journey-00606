import { TranscriptionInterface } from "@/components/TranscriptionInterface";
import { SubscribeDialog } from "@/components/SubscribeDialog";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useState } from "react";

const Index = () => {
  const { userPlan, isLoading } = useSubscription();
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);

  return (
    <>
      {/* Loading bar */}
      {isLoading && (
        <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-gradient-to-r from-primary via-primary/60 to-primary animate-pulse">
          <div className="h-full w-full bg-gradient-to-r from-transparent via-background/20 to-transparent animate-[slide-in-right_1s_ease-in-out_infinite]" />
        </div>
      )}

      <TranscriptionInterface 
        isFreeTrialMode={userPlan?.plan === 'free'}
      />
      <SubscribeDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog} />
    </>
  );
};

export default Index;
