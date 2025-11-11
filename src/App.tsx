import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Suspense, useEffect, useRef, useState } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import { PlanBadge } from "@/components/PlanBadge";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SubscriptionProvider, useSubscription } from "@/contexts/SubscriptionContext";
import { AdminRoute } from "@/components/AdminRoute";
import { IOSWelcomeScreen } from "@/components/IOSWelcomeScreen";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import MagicLogin from "./pages/MagicLogin";
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

// Global gate to wait for subscription plan to load before rendering the app
const PlanGate = ({ children }: { children: React.ReactNode }) => {
  const { isLoading } = useSubscription();
  const [showOverlay, setShowOverlay] = useState(false);
  const loadingTimer = useRef<number | null>(null);

  // Only show overlay if loading takes longer than 200ms to avoid flicker
  useEffect(() => {
    if (isLoading) {
      if (loadingTimer.current) window.clearTimeout(loadingTimer.current);
      loadingTimer.current = window.setTimeout(() => setShowOverlay(true), 200);
    } else {
      if (loadingTimer.current) window.clearTimeout(loadingTimer.current);
      setShowOverlay(false);
    }
    return () => {
      if (loadingTimer.current) window.clearTimeout(loadingTimer.current);
    };
  }, [isLoading]);

  if (showOverlay) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background/80 backdrop-blur-sm flex items-center justify-center transition-opacity">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
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

// Layout wrapper for pages with sidebar
const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const isAuthPage = location.pathname === '/auth';
  const isMagicLoginPage = location.pathname === '/magic-login';
  const isPublicPage = location.pathname === '/free-trial' || location.pathname === '/generate-protocol';
  const isRecordingPage = location.pathname === '/recording';
  const isProtocolPage = location.pathname === '/protocol';

  if (isAuthPage || isMagicLoginPage || isPublicPage || isRecordingPage || isProtocolPage) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto pt-6 md:pt-8 lg:pt-10">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
};

const App = () => {
  const [hasSeenWelcome, setHasSeenWelcome] = useState(() => {
    return localStorage.getItem('tivly_welcome_completed') === 'true';
  });

  const handleWelcomeComplete = () => {
    localStorage.setItem('tivly_welcome_completed', 'true');
    setHasSeenWelcome(true);
  };

  if (!hasSeenWelcome) {
    return (
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <IOSWelcomeScreen onComplete={handleWelcomeComplete} />
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
          <AuthProvider>
            <SubscriptionProvider>
              <PlanGate>
                <BrowserRouter>
                  <ScrollToTop />
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
                        <Route path="/subscribe/success" element={<ProtectedRoute><SubscribeSuccess /></ProtectedRoute>} />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </Suspense>
                  </AppLayout>
                </BrowserRouter>
              </PlanGate>
            </SubscriptionProvider>
          </AuthProvider>
        </TooltipProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
};

export default App;
