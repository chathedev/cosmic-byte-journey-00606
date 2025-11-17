import { Mic, Library, LogOut, Settings, User, Lock } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { SettingsDialog } from "@/components/SettingsDialog";
import { useState, useEffect } from "react";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { isLibraryLocked as checkLibraryLocked } from "@/lib/accessCheck";

export const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const { userPlan, isLoading: planLoading, refreshPlan } = useSubscription();
  const [showSettings, setShowSettings] = useState(false);
  
  const isLibraryLocked = planLoading ? false : checkLibraryLocked(user, userPlan);
 
  useEffect(() => {
    // Ensure plan is fresh on nav mount (helps unlock library after upgrade)
    refreshPlan();
  }, [refreshPlan]);

  const handleLogout = async () => {
    try {
      await logout();
      toast({
        title: "Utloggad",
        description: "Du har loggats ut framgångsrikt",
      });
      navigate("/auth");
    } catch (error: any) {
      toast({
        title: "Fel",
        description: "Kunde inte logga ut",
        variant: "destructive",
      });
    }
  };
  
  const isActive = (path: string) => location.pathname === path;
  
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 safe-area-pb">
      <div className="max-w-4xl mx-auto px-4 py-3 flex justify-around items-center">
        <Link
          to="/"
          className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-colors ${
            isActive("/")
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-primary/10"
          }`}
        >
          <Mic className="w-5 h-5" />
          <span className="text-xs font-medium">Hem</span>
        </Link>
        
        {isLibraryLocked ? (
          <button
            onClick={() => {
              toast({
                title: "Uppgradera för att se biblioteket",
                description: "Uppgradera till Standard eller Plus för att få tillgång till biblioteket och alla dess funktioner!",
                variant: "destructive",
              });
            }}
            className="flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-colors text-muted-foreground hover:text-foreground hover:bg-primary/10 opacity-50"
          >
            <div className="relative">
              <Library className="w-5 h-5" />
              <Lock className="w-3 h-3 absolute -top-1 -right-1" />
            </div>
            <span className="text-xs font-medium">Bibliotek</span>
          </button>
        ) : (
          <Link
            to="/library"
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-colors ${
              isActive("/library")
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-primary/10"
            }`}
          >
            <Library className="w-5 h-5" />
            <span className="text-xs font-medium">Bibliotek</span>
          </Link>
        )}

        {user && (
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-colors text-muted-foreground hover:text-foreground hover:bg-primary/10">
                <Avatar className="w-6 h-6">
                  <AvatarImage src={user.photoURL || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {user.email?.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs font-medium">Profil</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="end" side="top">
              <div className="flex flex-col gap-1">
                <div className="px-3 py-2 border-b border-border mb-1">
                  <p className="text-sm font-medium">{user.email}</p>
                  <p className="text-xs text-muted-foreground">Inloggad</p>
                </div>
                
                <Button
                  variant="ghost"
                  className="justify-start gap-2 w-full"
                  onClick={() => setShowSettings(true)}
                >
                  <Settings className="w-4 h-4" />
                  Inställningar
                </Button>
                
                <Button
                  variant="ghost"
                  className="justify-start gap-2 w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={handleLogout}
                >
                  <LogOut className="w-4 h-4" />
                  Logga ut
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
    </nav>
  );
};
