import { MessageSquare, Sparkles, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useAuth } from "@/contexts/AuthContext";
import { hasPlusAccess } from "@/lib/accessCheck";

interface ChatUpgradeBannerProps {
  onUpgrade?: () => void;
}

export const ChatUpgradeBanner = ({ onUpgrade }: ChatUpgradeBannerProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { userPlan } = useSubscription();
  
  // Check if running on iOS app domain
  const isIosApp = typeof window !== 'undefined' && window.location.hostname === 'io.tivly.se';

  // Hide banner for Pro/Unlimited/Enterprise users
  if (hasPlusAccess(user, userPlan)) return null;

  const handleUpgrade = () => {
    if (onUpgrade) {
      onUpgrade();
    } else {
      navigate('/subscribe');
    }
  };

  // iOS version - show neutral message without payment buttons (Apple compliance)
  if (isIosApp) {
    return (
      <Card className="border border-border bg-card/50 p-4 animate-fade-in">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h3 className="font-medium text-sm text-foreground">
              Chatta om dina möten
            </h3>
            <p className="text-xs text-muted-foreground">
              Ändringar av din plan görs på din kontosida på webben.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 p-6 animate-fade-in">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-6 h-6 text-primary" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              Chatta om varje möte med AI
              <Sparkles className="w-4 h-4 text-primary" />
            </h3>
            <p className="text-sm text-muted-foreground">
              Uppgradera till Plus för att kunna ställa frågor och få insikter om dina möten direkt i chatten.
            </p>
          </div>
        </div>
        <Button 
          onClick={handleUpgrade}
          size="lg"
          className="gap-2 flex-shrink-0 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
        >
          <Sparkles className="w-4 h-4" />
          Uppgradera till Plus
        </Button>
      </div>
    </Card>
  );
};
