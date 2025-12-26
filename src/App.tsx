import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Suspense, useEffect, useRef, useState, useContext } from "react";
import { isNativeApp } from "@/utils/capacitorDetection";
import { isWebBrowserOnAppDomain, isNativeAppOnWebDomain, isAuthDomain, storeOriginDomain, isIosApp } from "@/utils/environment";
import { toast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";

import ErrorBoundary from "@/components/ErrorBoundary";
import { PlanBadge } from "@/components/PlanBadge";
import { AuthProvider, useAuth, AuthContext } from "@/contexts/AuthContext";
import { SubscriptionProvider, useSubscription, SubscriptionContext } from "@/contexts/SubscriptionContext";
import { SupportProvider } from "@/contexts/SupportContext";
import { AdminRoute } from "@/components/AdminRoute";
import { IOSWelcomeScreen } from "@/components/IOSWelcomeScreen";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EnterpriseAccessOverlay } from "@/components/EnterpriseAccessOverlay";
import { MaintenanceOverlay } from "@/components/MaintenanceOverlay";
import { SupportBanner } from "@/components/SupportBanner";
import { IOSAppPromoDialog } from "@/components/IOSAppPromoDialog";
import { OpenInAppBanner } from "@/components/OpenInAppBanner";

import Index from "./pages/Index";
import Auth from "./pages/Auth";
import MagicLogin from "./pages/MagicLogin";
import EmailVerification from "./pages/EmailVerification";
import AppOnlyAccess from "./pages/AppOnlyAccess";
import WebOnlyAccess from "./pages/WebOnlyAccess";
import Library from "./pages/Library";
import MeetingDetail from "./pages/MeetingDetail";
import Agendas from "./pages/Agendas";
import { Chat } from "./pages/Chat";
import Feedback from "./pages/Feedback";
import SubscribeSuccess from "./pages/SubscribeSuccess";
import FreeTrial from "./pages/FreeTrial";
import GenerateProtocol from "./pages/GenerateProtocol";
import Recording from "./pages/Recording";
import Protocol from "./pages/Protocol";
import AdminUsers from "./pages/AdminUsers";
import AdminAdmins from "./pages/AdminAdmins";
import AdminBackend from "./pages/AdminBackend";
import AdminEmailCampaigns from "./pages/AdminEmailCampaigns";
import AdminEnterprise from "./pages/AdminEnterprise";
import AdminEnterpriseBilling from "./pages/AdminEnterpriseBilling";
import AdminEnterpriseCompanyDetail from "./pages/AdminEnterpriseCompanyDetail";
import SISRequired from "./pages/SISRequired";
import AdminAICosts from "./pages/AdminAICosts";
import AdminSpeakerProfiles from "./pages/AdminSpeakerProfiles";
import EnterpriseStats from "./pages/EnterpriseStats";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      retry: 1,
    },
  },
});

// Handle auth redirects from auth.tivly.se
const AuthRedirectHandler = () => {
  const location = useLocation();
  const navigate = useNavigate();
  // Use context directly to avoid throwing when outside provider
  const authContext = useContext(AuthContext);
  const refreshUser = authContext?.refreshUser;

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const authToken = params.get('auth_token');
    const testUser = params.get('test_user');
    
    if (authToken) {
      apiClient.applyAuthToken(authToken);
      // Clean URL
      window.history.replaceState({}, document.title, location.pathname);
      // Refresh user and stay on current page
      refreshUser?.().then(() => {
        // Already on the right page
      });
    } else if (testUser === 'true') {
      // Handle test user
      const testToken = 'test_unlimited_user_' + Date.now();
      apiClient.applyAuthToken(testToken);
      try { sessionStorage.setItem('pendingTestLogin', '1'); } catch {}
      localStorage.setItem('userEmail', 'review@tivly.se');
      window.history.replaceState({}, document.title, '/');
      refreshUser?.().then(() => navigate('/'));
    }
  }, [location, navigate, refreshUser]);

  return null;
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();

  const spinner = (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // Allow a brief grace period when test mode is initiating
  const pendingTest = (typeof window !== 'undefined') && sessionStorage.getItem('pendingTestLogin') === '1';
  if (isLoading || (pendingTest && !user)) {
    return spinner;
  }

  if (!user) {
    // Store current domain before redirecting to auth
    storeOriginDomain(window.location.origin);
    return <Navigate to="/auth" replace />;
  }

  // Clear pending flag once user is available
  if (pendingTest && user) {
    try { sessionStorage.removeItem('pendingTestLogin'); } catch {}
  }

  return <>{children}</>;
};

// Redirect authenticated users away from /auth (handles test mode too)
const PublicOnlyRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

// Non-blocking gate - app loads immediately, subscription loads in background
const PlanGate = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};

// Scroll to top on route change
const ScrollToTop = () => {
  const location = useLocation();
  
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [location.pathname]);
  
  return null;
};

// App param handling no longer needed; native detection handled internally
const PreserveAppParam = () => {
  return null;
};

// Layout wrapper for pages with sidebar
const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const isAuthPage = location.pathname === '/auth';
  const isMagicLoginPage = location.pathname === '/magic-login';
  const isPublicPage = location.pathname === '/free-trial';
  const isRecordingPage = location.pathname === '/recording';
  const isSISRequiredPage = location.pathname === '/sis-required';
  const isNative = isNativeApp();

  if (isAuthPage || isMagicLoginPage || isPublicPage || isRecordingPage || isSISRequiredPage) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className={`flex-1 overflow-auto ${isNative ? 'pt-6 md:pt-8 lg:pt-10' : ''}`}>
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
};

const WelcomeGate = ({ children }: { children: React.ReactNode }) => {
  const [hasSeenWelcome, setHasSeenWelcome] = useState(() => {
    return localStorage.getItem('tivly_welcome_completed') === 'true';
  });
  const location = useLocation();

  const handleWelcomeComplete = () => {
    localStorage.setItem('tivly_welcome_completed', 'true');
    setHasSeenWelcome(true);
  };

  // Skip welcome screen for auth-related routes
  const isAuthRoute = location.pathname === '/auth' || location.pathname === '/magic-login';
  
  if (!hasSeenWelcome && !isAuthRoute) {
    return <IOSWelcomeScreen onComplete={handleWelcomeComplete} />;
  }

  return <>{children}</>;
};


// Enterprise Access Check Component - handles trial, billing, and subscription states
const EnterpriseAccessCheck = () => {
  const { enterpriseMembership, isAdmin } = useSubscription();
  
  if (!enterpriseMembership?.isMember || !enterpriseMembership.company) {
    return null;
  }

  return (
    <EnterpriseAccessOverlay
      membership={enterpriseMembership}
      isAdmin={isAdmin}
    />
  );
};

// SIS Required Gate - blocks enterprise users who haven't submitted voice sample when SIS is enabled
const EnterpriseSISGate = ({ children }: { children: React.ReactNode }) => {
  const { enterpriseMembership, isAdmin } = useSubscription();
  const { user } = useAuth();
  const location = useLocation();
  
  // Skip check on auth routes
  if (location.pathname === '/auth' || location.pathname === '/magic-login' || location.pathname === '/sis-required') {
    return <>{children}</>;
  }
  
  // Skip for non-authenticated users
  if (!user) {
    return <>{children}</>;
  }
  
  // Skip for admins
  if (isAdmin) {
    return <>{children}</>;
  }
  
  // Check if user is enterprise member with SIS enabled
  if (!enterpriseMembership?.isMember || !enterpriseMembership.company) {
    return <>{children}</>;
  }
  
  // Check if SIS is enabled for the company
  const sisEnabled = enterpriseMembership.company.speakerIdentificationEnabled;
  if (!sisEnabled) {
    return <>{children}</>;
  }
  
  // Check if user has a valid SIS sample
  const hasSample = enterpriseMembership.sisSample?.status === 'ready';
  if (hasSample) {
    return <>{children}</>;
  }
  
  // User needs to submit SIS sample - redirect to SIS required page
  console.log('[EnterpriseSISGate] 🎤 SIS required but no sample - blocking access');
  return <Navigate to="/sis-required" replace />;
};

// Preferred Name Gate removed - now handled via auto-opening Settings in AppSidebar

// Shared app content for all routes
const AppContent = () => {
  return (
    <PlanGate>
      <ScrollToTop />
      <PreserveAppParam />
      <AuthRedirectHandler />
      <MaintenanceOverlay />
      <SupportBanner />
      <EnterpriseAccessCheck />
      <IOSAppPromoDialog />
      <OpenInAppBanner />
      <WelcomeGate>
        <EnterpriseSISGate>
          <AppLayout>
            <Suspense
              fallback={
                <div className="min-h-screen bg-background flex items-center justify-center">
                  <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" aria-label="Loading" />
                </div>
              }
            >
              <Routes>
                <Route path="/auth" element={<PublicOnlyRoute><Auth /></PublicOnlyRoute>} />
                <Route path="/magic-login" element={<MagicLogin />} />
                <Route path="/sis-required" element={<ProtectedRoute><SISRequired /></ProtectedRoute>} />
                <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                <Route path="/free-trial" element={<FreeTrial />} />
                <Route path="/generate-protocol" element={<GenerateProtocol />} />
                <Route path="/recording" element={<ProtectedRoute><Recording /></ProtectedRoute>} />
                <Route path="/protocol" element={<ProtectedRoute><Protocol /></ProtectedRoute>} />
                <Route path="/library" element={<ProtectedRoute><Library /></ProtectedRoute>} />
                <Route path="/meetings/:id" element={<ProtectedRoute><MeetingDetail /></ProtectedRoute>} />
                <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
                <Route path="/agendas" element={<ProtectedRoute><Agendas /></ProtectedRoute>} />
                <Route path="/feedback" element={<ProtectedRoute><Feedback /></ProtectedRoute>} />
                <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
                <Route path="/admin/admins" element={<AdminRoute><AdminAdmins /></AdminRoute>} />
                <Route path="/admin/backend" element={<AdminRoute><AdminBackend /></AdminRoute>} />
                <Route path="/admin/email-campaigns" element={<AdminRoute><AdminEmailCampaigns /></AdminRoute>} />
                <Route path="/admin/enterprise" element={<AdminRoute><AdminEnterprise /></AdminRoute>} />
                <Route path="/admin/enterprise/:companyId" element={<AdminRoute><AdminEnterpriseCompanyDetail /></AdminRoute>} />
                <Route path="/admin/enterprise/billing" element={<AdminRoute><AdminEnterpriseBilling /></AdminRoute>} />
                <Route path="/admin/ai-costs" element={<AdminRoute><AdminAICosts /></AdminRoute>} />
                <Route path="/admin/speaker-profiles" element={<AdminRoute><AdminSpeakerProfiles /></AdminRoute>} />
                <Route path="/admin/marketing" element={<Navigate to="/" replace />} />
                <Route path="/enterprise/stats" element={<ProtectedRoute><EnterpriseStats /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                <Route path="/subscribe/success" element={<ProtectedRoute><SubscribeSuccess /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AppLayout>
        </EnterpriseSISGate>
      </WelcomeGate>
    </PlanGate>
  );
};

// Gate component that checks admin/enterprise status before blocking web browser on iOS domain
const AdminBypassGate = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading: authLoading } = useAuth();
  const { enterpriseMembership, isAdmin: subscriptionIsAdmin } = useSubscription();
  const [isAdminRole, setIsAdminRole] = useState<boolean | null>(null);
  const [checkComplete, setCheckComplete] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const checkAdminRole = async () => {
      if (!user?.email) {
        setIsAdminRole(false);
        setCheckComplete(true);
        return;
      }

      try {
        const roleData = await apiClient.getUserRole(user.email.toLowerCase());
        const hasRole = roleData && (roleData.role === 'admin' || roleData.role === 'owner');
        console.log(`🔓 AdminBypassGate: Admin role check for ${user.email}: ${hasRole}`);
        setIsAdminRole(hasRole);
      } catch (err) {
        console.log('🔓 AdminBypassGate: Role check failed');
        setIsAdminRole(false);
      }
      setCheckComplete(true);
    };

    if (!authLoading && user) {
      checkAdminRole();
    } else if (!authLoading && !user) {
      setCheckComplete(true);
    }
  }, [user, authLoading]);

  // Show loading while checking
  if (authLoading || (user && !checkComplete)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // If not logged in and on auth page, show auth page
  if (!user && location.pathname === '/auth') {
    return <>{children}</>;
  }

  // If not logged in, redirect to auth (but render children which includes the auth route)
  if (!user) {
    return <>{children}</>;
  }

  // Check if user has admin role OR is an enterprise member
  const hasAdminAccess = isAdminRole || subscriptionIsAdmin;
  const hasEnterpriseAccess = enterpriseMembership?.isMember === true;
  const canBypass = hasAdminAccess || hasEnterpriseAccess;

  if (canBypass) {
    const reason = hasAdminAccess ? 'admin' : 'enterprise';
    console.log(`🔓 AdminBypassGate: Access granted for io.tivly.se (${reason}: ${user.email})`);
    return <>{children}</>;
  }

  // Otherwise show the block screen
  console.log(`🚫 AdminBypassGate: Access denied for ${user.email} - not admin or enterprise`);
  return <AppOnlyAccess />;
};

const App = () => {
  // Block web browser access to io.tivly.se domain (with admin bypass)
  if (isWebBrowserOnAppDomain()) {
    return (
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <AuthProvider>
                <SubscriptionProvider>
                  <SupportProvider>
                    <AdminBypassGate>
                      {/* If admin bypassed, render full app */}
                      <AppContent />
                    </AdminBypassGate>
                  </SupportProvider>
                </SubscriptionProvider>
              </AuthProvider>
            </BrowserRouter>
          </TooltipProvider>
        </ErrorBoundary>
      </QueryClientProvider>
    );
  }

  // Block native app access to app.tivly.se domain
  if (isNativeAppOnWebDomain()) {
    return <WebOnlyAccess />;
  }

  // Routes for auth.tivly.se - only verification endpoints
  if (isAuthDomain()) {
    return (
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <AuthProvider>
                <Suspense
                  fallback={
                    <div className="min-h-screen bg-background flex items-center justify-center">
                      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  }
                >
                  <Routes>
                    <Route path="/magic-login" element={<MagicLogin />} />
                    <Route path="/verify-email" element={<EmailVerification />} />
                    <Route path="*" element={<Navigate to="https://app.tivly.se" replace />} />
                  </Routes>
                </Suspense>
              </AuthProvider>
            </BrowserRouter>
          </TooltipProvider>
        </ErrorBoundary>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthProvider>
              <SubscriptionProvider>
                <SupportProvider>
                  <AppContent />
                </SupportProvider>
              </SubscriptionProvider>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
};

export default App;
