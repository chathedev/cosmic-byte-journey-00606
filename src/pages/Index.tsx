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
  const [readyToShow, setReadyToShow] = useState(false);

  // Wait until auth + subscription are fully resolved before showing anything
  const fullyLoaded = !isAuthLoading && !isLoading;

  useEffect(() => {
    if (!fullyLoaded || !user) return;

    const hasName = !!(user.preferredName || user.displayName);
    if (!hasName) {
      if (enterpriseMembership?.isMember) {
        setShowEnterpriseWizard(true);
      } else {
        setShowNameDialog(true);
      }
    }
    // Mark ready — dashboard can render now
    setReadyToShow(true);
  }, [fullyLoaded, user, enterpriseMembership]);

  // Show org chooser on startup if multiple memberships and no prior choice
  useEffect(() => {
    if (!fullyLoaded || !user || !enterpriseMembership) return;
    const memberships = enterpriseMembership.memberships;
    if (memberships && memberships.length > 1) {
      const previousChoice = localStorage.getItem('tivly_org_chosen');
      if (!previousChoice) {
        setShowOrgChooser(true);
      }
    }
  }, [fullyLoaded, user, enterpriseMembership]);

  const handleNameComplete = () => {
    setShowNameDialog(false);
    setShowEnterpriseWizard(false);
  };

  const handleOrgSelect = async (companyId: string) => {
    await switchCompany(companyId);
  };

  // Show a clean loading state until we know whether to show onboarding
  if (!readyToShow) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Enterprise onboarding wizard — renders OVER everything */}
      {showEnterpriseWizard && (
        <EnterpriseWelcomeWizard
          open={showEnterpriseWizard}
          companyName={enterpriseMembership?.company?.name || 'Enterprise'}
          onComplete={handleNameComplete}
        />
      )}

      {/* Non-enterprise name prompt */}
      <WelcomeNameDialog
        open={showNameDialog}
        onComplete={handleNameComplete}
      />

      <TranscriptionInterface
        isFreeTrialMode={userPlan?.plan === 'free'}
      />
      <SubscribeDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog} />

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
