import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { TranscriptionInterface } from "@/components/TranscriptionInterface";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useNavigate } from "react-router-dom";

const FreeTrial = () => {
  const { user } = useAuth();
  const { userPlan, isLoading } = useSubscription();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && userPlan && userPlan.plan !== 'free') {
      navigate('/', { replace: true });
    }
  }, [isLoading, userPlan, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Laddar...</div>
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <TranscriptionInterface isFreeTrialMode={true} />
        </main>
      </div>
    </SidebarProvider>
  );
};

export default FreeTrial;
