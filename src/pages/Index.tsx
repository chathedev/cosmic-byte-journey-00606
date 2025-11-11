import { TranscriptionInterface } from "@/components/TranscriptionInterface";
import { SubscribeDialog } from "@/components/SubscribeDialog";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useState } from "react";

const Index = () => {
  const { userPlan, isLoading } = useSubscription();
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);


  return (
    <>
      <TranscriptionInterface isFreeTrialMode={userPlan?.plan === 'free'} />
      <SubscribeDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog} />
    </>
  );
};

export default Index;
