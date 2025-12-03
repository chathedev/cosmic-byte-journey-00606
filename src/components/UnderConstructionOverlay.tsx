import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/lib/api";
import { Construction } from "lucide-react";

export const UnderConstructionOverlay = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading: authLoading } = useAuth();
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  // Routes that should NOT show the overlay
  const excludedRoutes = ['/auth', '/magic-login', '/free-trial', '/generate-protocol'];
  const isExcludedRoute = excludedRoutes.some(route => location.pathname.startsWith(route));

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!user?.email) {
        setIsAdmin(false);
        setIsChecking(false);
        return;
      }

      try {
        const roleData = await apiClient.getUserRole(user.email.toLowerCase());
        const hasAdminRole = roleData && (roleData.role === 'admin' || roleData.role === 'owner');
        setIsAdmin(hasAdminRole);
      } catch {
        setIsAdmin(false);
      } finally {
        setIsChecking(false);
      }
    };

    if (!authLoading) {
      checkAdminStatus();
    }
  }, [user, authLoading]);

  // Don't block excluded routes (auth, login, etc.)
  if (isExcludedRoute) {
    return <>{children}</>;
  }

  // Still loading - show spinner
  if (authLoading || isChecking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Admin - show app normally
  if (isAdmin) {
    return <>{children}</>;
  }

  // Non-admin on dashboard - show minimal overlay
  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-background">
      <div className="text-center px-6 max-w-sm">
        <div className="mx-auto mb-6 w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <Construction className="w-8 h-8 text-muted-foreground" />
        </div>
        
        <h1 className="text-xl font-semibold text-foreground mb-2">
          Under underhåll
        </h1>
        
        <p className="text-sm text-muted-foreground mb-6">
          Vi är snart tillbaka.
        </p>

        <a 
          href="mailto:support@tivly.se" 
          className="text-xs text-muted-foreground/60 hover:text-primary transition-colors"
        >
          support@tivly.se
        </a>
      </div>
    </div>
  );
};
