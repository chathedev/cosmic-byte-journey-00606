import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Suspense, useEffect, useRef, useState } from "react";
import { isNativeApp } from "@/utils/capacitorDetection";
import { isWebBrowserOnAppDomain, isNativeAppOnWebDomain, isAuthDomain, storeOriginDomain, isIosApp } from "@/utils/environment";
import { toast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";

import ErrorBoundary from "@/components/ErrorBoundary";
import { PlanBadge } from "@/components/PlanBadge";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SubscriptionProvider, useSubscription } from "@/contexts/SubscriptionContext";
import { AdminRoute } from "@/components/AdminRoute";
import { IOSWelcomeScreen } from "@/components/IOSWelcomeScreen";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import MagicLogin from "./pages/MagicLogin";
import EmailVerification from "./pages/EmailVerification";
import AppOnlyAccess from "./pages/AppOnlyAccess";
import WebOnlyAccess from "./pages/WebOnlyAccess";
import Library from "./pages/Library";
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
import AdminAnalytics from "./pages/AdminAnalytics";
import AdminEmailCampaigns from "./pages/AdminEmailCampaigns";
import AdminEnterprise from "./pages/AdminEnterprise";
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
  const { refreshUser } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const authToken = params.get('auth_token');
    const testUser = params.get('test_user');
    
    if (authToken) {
      apiClient.applyAuthToken(authToken);
      // Clean URL
      window.history.replaceState({}, document.title, location.pathname);
      // Refresh user and stay on current page
      refreshUser().then(() => {
        // Already on the right page
      });
    } else if (testUser === 'true') {
      // Handle test user
      const testToken = 'test_unlimited_user_' + Date.now();
      apiClient.applyAuthToken(testToken);
      try { sessionStorage.setItem('pendingTestLogin', '1'); } catch {}
      localStorage.setItem('userEmail', 'review@tivly.se');
      window.history.replaceState({}, document.title, '/');
      refreshUser().then(() => navigate('/'));
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
  const isPublicPage = location.pathname === '/free-trial' || location.pathname === '/generate-protocol';
  const isRecordingPage = location.pathname === '/recording';
  const isProtocolPage = location.pathname === '/protocol';
  const isNative = isNativeApp();

  if (isAuthPage || isMagicLoginPage || isPublicPage || isRecordingPage || isProtocolPage) {
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


const App = () => {
  // Block web browser access to io.tivly.se domain
  if (isWebBrowserOnAppDomain()) {
    return <AppOnlyAccess />;
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
                  <PlanGate>
                    <ScrollToTop />
                    <PreserveAppParam />
                    <AuthRedirectHandler />
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
                            <Route path="/magic-login" element={<MagicLogin />} />
                            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
                            <Route path="/free-trial" element={<FreeTrial />} />
                            <Route path="/generate-protocol" element={<GenerateProtocol />} />
                            <Route path="/recording" element={<ProtectedRoute><Recording /></ProtectedRoute>} />
                            <Route path="/protocol" element={<ProtectedRoute><Protocol /></ProtectedRoute>} />
                            <Route path="/library" element={<ProtectedRoute><Library /></ProtectedRoute>} />
                            <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
                            <Route path="/agendas" element={<ProtectedRoute><Agendas /></ProtectedRoute>} />
                            <Route path="/feedback" element={<ProtectedRoute><Feedback /></ProtectedRoute>} />
                            <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
                            <Route path="/admin/admins" element={<AdminRoute><AdminAdmins /></AdminRoute>} />
                            <Route path="/admin/backend" element={<AdminRoute><AdminBackend /></AdminRoute>} />
                            <Route path="/admin/analytics" element={<AdminRoute><AdminAnalytics /></AdminRoute>} />
                          <Route path="/admin/email-campaigns" element={<AdminRoute><AdminEmailCampaigns /></AdminRoute>} />
                          <Route path="/admin/enterprise" element={<AdminRoute><AdminEnterprise /></AdminRoute>} />
                          <Route path="/admin/marketing" element={<Navigate to="/" replace />} />
                          <Route path="/subscribe/success" element={<ProtectedRoute><SubscribeSuccess /></ProtectedRoute>} />
                          <Route path="*" element={<NotFound />} />
                          </Routes>
                        </Suspense>
                      </AppLayout>
                    </WelcomeGate>
                  </PlanGate>
                </SubscriptionProvider>
              </AuthProvider>
            </BrowserRouter>
        </TooltipProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
};

export default App;
