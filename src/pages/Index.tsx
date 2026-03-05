import { TranscriptionInterface } from "@/components/TranscriptionInterface";
import { SubscribeDialog } from "@/components/SubscribeDialog";
import { WelcomeNameDialog } from "@/components/WelcomeNameDialog";
import { EnterpriseWelcomeWizard } from "@/components/EnterpriseWelcomeWizard";
import { OrgSwitcherDialog } from "@/components/OrgSwitcherDialog";
import { ViewerDashboard } from "@/components/ViewerDashboard";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect } from "react";

const Index = () => {
  const { userPlan, isLoading, enterpriseMembership, switchCompany, isViewer } = useSubscription();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [showOrgChooser, setShowOrgChooser] = useState(false);

  const fullyLoaded = !isAuthLoading && !isLoading;
  const hasName = !!(user?.preferredName || user?.displayName);
  const needsName = !!user && !hasName;

  // Prevent wrong onboarding dialog by waiting for enterprise membership resolution.
  // enterpriseMembership starts as null and later becomes {isMember:true|false}.
  const enterpriseDecisionReady = !needsName || !!enterpriseMembership || userPlan?.plan === "enterprise";

  const isEnterpriseUser =
    userPlan?.plan === "enterprise" || enterpriseMembership?.isMember === true;

  const showEnterpriseWizard = fullyLoaded && enterpriseDecisionReady && needsName && isEnterpriseUser;
  const showNameDialog = fullyLoaded && enterpriseDecisionReady && needsName && !isEnterpriseUser;

  // Show org chooser on startup if multiple memberships and no prior choice
  useEffect(() => {
    if (!fullyLoaded || !user || !enterpriseMembership || showEnterpriseWizard) return;

    const memberships = enterpriseMembership.memberships;
    if (memberships && memberships.length > 1) {
      const previousChoice = localStorage.getItem("tivly_org_chosen");
      if (!previousChoice) {
        setShowOrgChooser(true);
      }
    }
  }, [fullyLoaded, user, enterpriseMembership, showEnterpriseWizard]);

  const handleOrgSelect = async (companyId: string) => {
    await switchCompany(companyId);
  };

  // Block dashboard until auth/subscription AND onboarding decision are ready
  if (!fullyLoaded || !enterpriseDecisionReady) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Enterprise users without name: only wizard (prevents background + old popup overlap)
  if (showEnterpriseWizard) {
    return (
      <EnterpriseWelcomeWizard
        open
        companyName={enterpriseMembership?.company?.name || "Enterprise"}
        onComplete={() => {
          // Wizard auto-closes once refreshUser updates name in auth state.
        }}
      />
    );
  }

  return (
    <>
      <TranscriptionInterface isFreeTrialMode={userPlan?.plan === "free"} />
      <SubscribeDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog} />

      {/* Non-enterprise name prompt only */}
      <WelcomeNameDialog
        open={showNameDialog}
        onComplete={() => {
          // Dialog auto-closes once refreshUser updates name in auth state.
        }}
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
