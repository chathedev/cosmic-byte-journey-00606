import { TranscriptionInterface } from "@/components/TranscriptionInterface";
import { SubscribeDialog } from "@/components/SubscribeDialog";
import { WelcomeNameDialog } from "@/components/WelcomeNameDialog";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";

const Index = () => {
  const { userPlan, isLoading } = useSubscription();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [showNameDialog, setShowNameDialog] = useState(false);

  // Check if user needs to set their name
  useEffect(() => {
    if (!isAuthLoading && user) {
      const hasName = !!(user.preferredName || user.displayName);
      if (!hasName) {
        setShowNameDialog(true);
      }
    }
  }, [user, isAuthLoading]);

  const handleNameComplete = () => {
    setShowNameDialog(false);
  };

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
      
      {/* Welcome name prompt for users without a name */}
      <WelcomeNameDialog 
        open={showNameDialog} 
        onComplete={handleNameComplete} 
      />
    </>
  );
};

export default Index;
