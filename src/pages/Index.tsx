import { TranscriptionInterface } from "@/components/TranscriptionInterface";
import { SubscribeDialog } from "@/components/SubscribeDialog";
import { WelcomeNameDialog } from "@/components/WelcomeNameDialog";
import { EnterpriseWelcomeWizard } from "@/components/EnterpriseWelcomeWizard";
import { OrgSwitcherDialog } from "@/components/OrgSwitcherDialog";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";

const Index = () => {
  const { userPlan, isLoading, enterpriseMembership, switchCompany } = useSubscription();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [showEnterpriseWizard, setShowEnterpriseWizard] = useState(false);
  const [showOrgChooser, setShowOrgChooser] = useState(false);

  // Check if user needs to set their name
  useEffect(() => {
    if (!isAuthLoading && !isLoading && user) {
      const hasName = !!(user.preferredName || user.displayName);
      if (!hasName) {
        // Enterprise users get the full wizard, others get the simple dialog
        if (enterpriseMembership?.isMember) {
          setShowEnterpriseWizard(true);
        } else {
          setShowNameDialog(true);
        }
      }
    }
  }, [user, isAuthLoading, isLoading, enterpriseMembership]);

  // Show org chooser on startup if multiple memberships and no prior choice
  useEffect(() => {
    if (!isAuthLoading && !isLoading && user && enterpriseMembership) {
      const memberships = enterpriseMembership.memberships;
      if (memberships && memberships.length > 1) {
        const previousChoice = localStorage.getItem('tivly_org_chosen');
        if (!previousChoice) {
          setShowOrgChooser(true);
        }
      }
    }
  }, [isAuthLoading, isLoading, user, enterpriseMembership]);

  const handleNameComplete = () => {
    setShowNameDialog(false);
    setShowEnterpriseWizard(false);
  };

  const handleOrgSelect = async (companyId: string) => {
    await switchCompany(companyId);
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

      {/* Org chooser for multi-company users on first visit */}
      {enterpriseMembership?.memberships && enterpriseMembership.memberships.length > 1 && (
        <OrgSwitcherDialog
          open={showOrgChooser}
          onOpenChange={setShowOrgChooser}
          memberships={enterpriseMembership.memberships}
          activeCompanyId={enterpriseMembership.activeCompanyId}
          onSelect={handleOrgSelect}
        />
      )}
    </>
  );
};

export default Index;
