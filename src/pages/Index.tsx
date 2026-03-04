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
  const [showOrgChooser, setShowOrgChooser] = useState(false);

  const fullyLoaded = !isAuthLoading && !isLoading;
  const hasName = !!(user?.preferredName || user?.displayName);
  const needsName = !!user && !hasName;
  const isEnterpriseUser = !!(enterpriseMembership?.isMember || userPlan?.plan === "enterprise");

  const showEnterpriseWizard = fullyLoaded && needsName && isEnterpriseUser;
  const showNameDialog = fullyLoaded && needsName && !isEnterpriseUser;

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

  const handleEnterpriseNameComplete = () => {
    // No local toggle needed; wizard closes automatically once user name exists in auth state.
  };

  const handleRegularNameComplete = () => {
    // No local toggle needed; dialog closes automatically once user name exists in auth state.
  };

  const handleOrgSelect = async (companyId: string) => {
    await switchCompany(companyId);
  };

  // Block dashboard until auth/subscription are fully resolved
  if (!fullyLoaded) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // For enterprise users without name: show only the enterprise wizard (no dashboard flash behind)
  if (showEnterpriseWizard) {
    return (
      <EnterpriseWelcomeWizard
        open={showEnterpriseWizard}
        companyName={enterpriseMembership?.company?.name || "Enterprise"}
        onComplete={handleEnterpriseNameComplete}
      />
    );
  }

  return (
    <>
      <TranscriptionInterface isFreeTrialMode={userPlan?.plan === "free"} />
      <SubscribeDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog} />

      {/* Name prompt for non-enterprise users only */}
      <WelcomeNameDialog open={showNameDialog} onComplete={handleRegularNameComplete} />

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
