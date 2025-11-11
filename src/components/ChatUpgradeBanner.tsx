import { MessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

interface ChatUpgradeBannerProps {
  onUpgrade?: () => void;
}

export const ChatUpgradeBanner = ({ onUpgrade }: ChatUpgradeBannerProps) => {
  const navigate = useNavigate();

  const handleUpgrade = () => {
    if (onUpgrade) {
      onUpgrade();
    } else {
      navigate('/subscribe');
    }
  };

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
