import { TranscriptionInterface } from "@/components/TranscriptionInterface";
import { SubscribeDialog } from "@/components/SubscribeDialog";
import { EnhancedRecordingDialog } from "@/components/EnhancedRecordingDialog";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useState } from "react";

const Index = () => {
  const { userPlan, isLoading } = useSubscription();
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [showRecordingDialog, setShowRecordingDialog] = useState(false);

  const handleOpenRecordingDialog = () => {
    setShowRecordingDialog(true);
  };

  return (
    <>
      <TranscriptionInterface 
        isFreeTrialMode={userPlan?.plan === 'free'}
        onOpenRecordingDialog={handleOpenRecordingDialog}
      />
      <SubscribeDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog} />
      <EnhancedRecordingDialog 
        isOpen={showRecordingDialog}
        onClose={() => setShowRecordingDialog(false)}
      />
    </>
  );
};

export default Index;
