import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { Suspense, useEffect, useRef, useState, useContext } from "react";
import { isNativeApp } from "@/utils/capacitorDetection";
import { isWebBrowserOnAppDomain, isNativeAppOnWebDomain, isAuthDomain, isBillingDomain, storeOriginDomain, isIosApp, isConnectDomain } from "@/utils/environment";
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

import AdminAICosts from "./pages/AdminAICosts";
import AdminSpeakerProfiles from "./pages/AdminSpeakerProfiles";
import EnterpriseStats from "./pages/EnterpriseStats";
import Settings from "./pages/Settings";
import OrgSettings from "./pages/OrgSettings";
import NotFound from "./pages/NotFound";
import BillingInvoices from "./pages/BillingInvoices";
import BillingInvoiceDetail from "./pages/BillingInvoiceDetail";
import EnterpriseBilling from "./pages/EnterpriseBilling";
import AttribrConnect from "./pages/AttribrConnect";
import AuthHandoff from "./pages/AuthHandoff";
import EnterpriseOnboarding from "./pages/EnterpriseOnboarding";
import EnterpriseEmailVerify from "./pages/EnterpriseEmailVerify";
import Integrations from "./pages/Integrations";
import IntegrationTeams from "./pages/IntegrationTeams";
import AdminConsentVerified from "./pages/AdminConsentVerified";

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
  const location = useLocation();

  const spinner = (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // If the user is already logged in and we have a redirect param (e.g. connect.tivly.se handoff),
  // perform the redirect instead of sending them to the dashboard.
  useEffect(() => {
    if (!user) return;

    const params = new URLSearchParams(location.search);
    const redirectUrl = params.get('redirect');
    if (!redirectUrl) return;

    try {
      const url = new URL(redirectUrl);
      const isAllowed = url.hostname.endsWith('tivly.se') || url.hostname.endsWith('.lovableproject.com');
      if (!isAllowed) return;

      const token = apiClient.getAuthToken();
      if (!token) return;

      url.searchParams.set('authToken', token);
      window.location.href = url.toString();
    } catch {
      // Ignore invalid redirect URL and fall back to normal behavior.
    }
  }, [user, location.search]);

  if (isLoading) {
    return spinner;
  }

  if (user) {
    const hasRedirectParam = new URLSearchParams(location.search).has('redirect');
    return hasRedirectParam ? spinner : <Navigate to="/" replace />;
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
  const isPublicPage = location.pathname === '/free-trial' || location.pathname === '/enterprise/onboarding' || location.pathname === '/enterprise/onboarding/verify-email';
  const isRecordingPage = location.pathname === '/recording';
  const isNative = isNativeApp();

  if (isAuthPage || isMagicLoginPage || isPublicPage || isRecordingPage) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className={`flex-1 overflow-auto ${isNative ? 'pt-12 md:pt-8 lg:pt-10' : 'pt-12 md:pt-0'}`}>
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

  // Skip welcome screen for auth-related and public routes
  const isAuthRoute = location.pathname === '/auth' || location.pathname === '/magic-login';
  const isPublicRoute = location.pathname === '/enterprise/onboarding' || location.pathname === '/enterprise/onboarding/verify-email' || location.pathname === '/free-trial';
  
  if (!hasSeenWelcome && !isAuthRoute && !isPublicRoute) {
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


// Preferred Name Gate removed - now handled via auto-opening Settings in AppSidebar

// Legacy route support: some older links still use singular "/meeting/:id"
const MeetingLegacyRedirect = () => {
  const { id } = useParams();
  return <Navigate to={id ? `/meetings/${id}` : "/library"} replace />;
};

// Shared app content for all routes
const AppContent = () => {
  const location = useLocation();

  // Public standalone pages — no sidebar, no auth gates
  if (location.pathname === '/integrations/teams/admin-verified') {
    return <AdminConsentVerified />;
  }

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
                <Route path="/auth/handoff" element={<AuthHandoff />} />
                <Route path="/magic-login" element={<MagicLogin />} />
                
                <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                <Route path="/free-trial" element={<FreeTrial />} />
                <Route path="/enterprise/onboarding" element={<EnterpriseOnboarding />} />
                <Route path="/enterprise/onboarding/verify-email" element={<EnterpriseEmailVerify />} />
                <Route path="/generate-protocol" element={<GenerateProtocol />} />
                <Route path="/recording" element={<ProtectedRoute><Recording /></ProtectedRoute>} />
                <Route path="/protocol" element={<ProtectedRoute><Protocol /></ProtectedRoute>} />
                <Route path="/library" element={<ProtectedRoute><Library /></ProtectedRoute>} />
                <Route path="/meeting/:id" element={<ProtectedRoute><MeetingLegacyRedirect /></ProtectedRoute>} />
                <Route path="/meetings/:id" element={<ProtectedRoute><MeetingDetail /></ProtectedRoute>} />
                
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
                <Route path="/org/billing" element={<ProtectedRoute><EnterpriseBilling /></ProtectedRoute>} />
                <Route path="/billing/invoices" element={<ProtectedRoute><BillingInvoices /></ProtectedRoute>} />
                <Route path="/billing/invoices/:invoiceId" element={<ProtectedRoute><BillingInvoiceDetail /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                <Route path="/integrations" element={<ProtectedRoute><Integrations /></ProtectedRoute>} />
                <Route path="/integrations/teams" element={<ProtectedRoute><IntegrationTeams /></ProtectedRoute>} />
                <Route path="/integrations/teams/admin-verified" element={<AdminConsentVerified />} />
                <Route path="/org/settings" element={<ProtectedRoute><OrgSettings /></ProtectedRoute>} />
                <Route path="/subscribe/success" element={<ProtectedRoute><SubscribeSuccess /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </AppLayout>
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

// Renders fully public pages (no auth required) before any auth providers
const PublicPagesShell = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const publicPaths = ['/enterprise/onboarding', '/enterprise/onboarding/verify-email', '/free-trial'];
  const isPublic = publicPaths.includes(location.pathname);

  if (!isPublic) return <>{children}</>;

  return (
    <AuthProvider>
      <SubscriptionProvider>
        <Suspense
          fallback={
            <div className="min-h-screen bg-background flex items-center justify-center">
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          }
        >
          <Routes>
            <Route path="/enterprise/onboarding" element={<EnterpriseOnboarding />} />
            <Route path="/enterprise/onboarding/verify-email" element={<EnterpriseEmailVerify />} />
            <Route path="/free-trial" element={<FreeTrial />} />
          </Routes>
        </Suspense>
      </SubscriptionProvider>
    </AuthProvider>
  );
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
              <PublicPagesShell>
                <AuthProvider>
                  <SubscriptionProvider>
                    <SupportProvider>
                      <AdminBypassGate>
                        <AppContent />
                      </AdminBypassGate>
                    </SupportProvider>
                  </SubscriptionProvider>
                </AuthProvider>
              </PublicPagesShell>
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

  // Routes for connect.tivly.se - Attribr integration
  if (isConnectDomain()) {
    return (
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Suspense
                fallback={
                  <div className="min-h-screen bg-background flex items-center justify-center">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                }
              >
                <Routes>
                  <Route path="/connect/attribr" element={<AttribrConnect />} />
                  <Route path="/attribr" element={<AttribrConnect />} />
                  <Route path="*" element={<AttribrConnect />} />
                </Routes>
              </Suspense>
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
            <PublicPagesShell>
              <AuthProvider>
                <SubscriptionProvider>
                  <SupportProvider>
                    <AppContent />
                  </SupportProvider>
                </SubscriptionProvider>
              </AuthProvider>
            </PublicPagesShell>
          </BrowserRouter>
        </TooltipProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
};

export default App;
