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
      <div className="min-h-screen">
        <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-gradient-to-r from-primary via-primary/60 to-primary animate-pulse">
          <div className="h-full w-full bg-gradient-to-r from-transparent via-background/20 to-transparent animate-[slide-in-right_1s_ease-in-out_infinite]" />
        </div>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Laddar...</p>
          </div>
        </div>
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
