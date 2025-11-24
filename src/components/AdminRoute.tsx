import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";

interface AdminRouteProps {
  children: React.ReactNode;
}

export const AdminRoute = ({ children }: AdminRouteProps) => {
  const { user, isLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAdmin = async () => {
      if (!user?.email) {
        console.log('❌ AdminRoute: No user email, denying admin access');
        setIsAdmin(false);
        return;
      }

      const platform = window.location.hostname.includes('io.tivly.se') ? 'IOS' : 'WEB';
      console.log(`🔐 AdminRoute [${platform}]: Checking admin access for:`, user.email);
      console.log('🔑 AdminRoute: Auth token present:', !!localStorage.getItem('authToken'));

      try {
        const roleData = await apiClient.getUserRole(user.email.toLowerCase());
        console.log(`📊 AdminRoute [${platform}]: Role check result:`, roleData);

        const hasRole = roleData && (roleData.role === 'admin' || roleData.role === 'owner');
        console.log(hasRole ? `✅ AdminRoute [${platform}]: Admin access granted` : `❌ AdminRoute [${platform}]: Not an admin`);
        setIsAdmin(hasRole);
      } catch (err) {
        console.error(`❌ AdminRoute [${platform}]: Role check failed:`, err);
        // On error (403, network, etc.), deny access
        setIsAdmin(false);
      }
    };

    if (!isLoading) {
      checkAdmin();
    }
  }, [user, isLoading]);

  if (isLoading || isAdmin === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
