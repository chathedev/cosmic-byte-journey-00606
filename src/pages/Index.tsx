import { TranscriptionInterface } from "@/components/TranscriptionInterface";
import { SubscribeDialog } from "@/components/SubscribeDialog";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Bug } from "lucide-react";
import { toast } from "sonner";
import { isIosApp } from "@/utils/environment";

const Index = () => {
  const { userPlan, isLoading } = useSubscription();
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);

  const handleDevClick = () => {
    const isIos = isIosApp();
    const info = {
      platform: isIos ? 'iOS App (io.tivly.se)' : 'Web (app.tivly.se)',
      hostname: window.location.hostname,
      userPlan: userPlan?.plan || 'unknown',
      meetingsUsed: userPlan?.meetingsUsed || 0,
      meetingsLimit: userPlan?.meetingsLimit || 0,
      capacitor: typeof (window as any).Capacitor !== 'undefined',
    };
    
    console.log('🔧 DEV INFO:', info);
    toast.info(`Platform: ${info.platform} | Plan: ${info.userPlan} | Meetings: ${info.meetingsUsed}/${info.meetingsLimit}`);
  };

  return (
    <>
      <TranscriptionInterface 
        isFreeTrialMode={userPlan?.plan === 'free'}
      />
      <SubscribeDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog} />
      
      {/* Dev Button */}
      <Button
        onClick={handleDevClick}
        size="icon"
        variant="outline"
        className="fixed bottom-4 left-4 z-50 h-12 w-12 rounded-full shadow-lg bg-background/80 backdrop-blur-sm border-2 hover:scale-110 transition-transform"
      >
        <Bug className="h-5 w-5" />
      </Button>
    </>
  );
};

export default Index;
