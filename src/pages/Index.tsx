import { TranscriptionInterface } from "@/components/TranscriptionInterface";
import { SubscribeDialog } from "@/components/SubscribeDialog";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useState } from "react";

const Index = () => {
  const { userPlan, isLoading } = useSubscription();
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);

  // Show loading state while plan data is being fetched
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Laddar...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <TranscriptionInterface 
        isFreeTrialMode={userPlan?.plan === 'free'}
      />
      <SubscribeDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog} />
    </>
  );
};

export default Index;
