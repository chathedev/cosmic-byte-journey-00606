import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Suspense, useEffect, useRef, useState } from "react";
import { isNativeApp } from "@/utils/capacitorDetection";
import { isWebBrowserOnAppDomain, isNativeAppOnWebDomain, isAuthDomain, storeOriginDomain, isIosApp } from "@/utils/environment";
import { toast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Bug } from "lucide-react";

import ErrorBoundary from "@/components/ErrorBoundary";
import { PlanBadge } from "@/components/PlanBadge";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SubscriptionProvider, useSubscription } from "@/contexts/SubscriptionContext";
import { AdminRoute } from "@/components/AdminRoute";
import { IOSWelcomeScreen } from "@/components/IOSWelcomeScreen";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TrialExpiredOverlay } from "@/components/TrialExpiredOverlay";
import { UnderConstructionOverlay } from "@/components/UnderConstructionOverlay";
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
import AdminEmailCampaigns from "./pages/AdminEmailCampaigns";
import AdminEnterprise from "./pages/AdminEnterprise";
import AdminEnterpriseBilling from "./pages/AdminEnterpriseBilling";
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

// Global Dev Button Component - only for charlie.wretling@icloud.com
const GlobalDevButton = () => {
  const { user } = useAuth();
  const { userPlan } = useSubscription();
  const [logs, setLogs] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  // Only show for specific email
  const allowedEmail = 'charlie.wretling@icloud.com';
  const isAllowed = user?.email?.toLowerCase() === allowedEmail.toLowerCase();

  // Capture console logs and errors
  useEffect(() => {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    const logBuffer: string[] = [];
    const errorBuffer: string[] = [];

    console.log = (...args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      logBuffer.push(`[LOG] ${new Date().toISOString()} - ${message}`);
      if (logBuffer.length > 100) logBuffer.shift();
      setLogs([...logBuffer]);
      originalLog.apply(console, args);
    };

    console.error = (...args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      errorBuffer.push(`[ERROR] ${new Date().toISOString()} - ${message}`);
      if (errorBuffer.length > 50) errorBuffer.shift();
      setErrors([...errorBuffer]);
      originalError.apply(console, args);
    };

    console.warn = (...args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      errorBuffer.push(`[WARN] ${new Date().toISOString()} - ${message}`);
      if (errorBuffer.length > 50) errorBuffer.shift();
      setErrors([...errorBuffer]);
      originalWarn.apply(console, args);
    };

    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);
  
  const handleDevClick = async () => {
    const isIos = isIosApp();
    
    // Gather comprehensive debug info
    const debugInfo = {
      timestamp: new Date().toISOString(),
      session: {
        platform: isIos ? 'iOS App (io.tivly.se)' : 'Web (app.tivly.se)',
        hostname: window.location.hostname,
        pathname: window.location.pathname,
        userAgent: navigator.userAgent,
        capacitor: typeof (window as any).Capacitor !== 'undefined',
      },
      user: {
        plan: userPlan?.plan || 'unknown',
        meetingsUsed: userPlan?.meetingsUsed || 0,
        meetingsLimit: userPlan?.meetingsLimit || 0,
      },
      errors: errors.slice(-20), // Last 20 errors
      logs: logs.slice(-50), // Last 50 logs
    };
    
    const formattedOutput = `
=== TIVLY DEBUG INFO ===
Timestamp: ${debugInfo.timestamp}

--- SESSION INFO ---
Platform: ${debugInfo.session.platform}
Hostname: ${debugInfo.session.hostname}
Path: ${debugInfo.session.pathname}
Capacitor: ${debugInfo.session.capacitor}

--- USER INFO ---
Plan: ${debugInfo.user.plan}
Meetings: ${debugInfo.user.meetingsUsed}/${debugInfo.user.meetingsLimit}

--- ERRORS (Last 20) ---
${debugInfo.errors.length > 0 ? debugInfo.errors.join('\n') : 'No errors recorded'}

--- LOGS (Last 50) ---
${debugInfo.logs.length > 0 ? debugInfo.logs.join('\n') : 'No logs recorded'}

--- RAW DATA ---
${JSON.stringify(debugInfo, null, 2)}
`.trim();
    
    // Copy to clipboard
    try {
      await navigator.clipboard.writeText(formattedOutput);
      sonnerToast.success('Debug info copied to clipboard! 📋', {
        duration: 3000,
        description: `${errors.length} errors, ${logs.length} logs captured`,
      });
      console.log('🔧 DEBUG INFO COPIED:', debugInfo);
    } catch (err) {
      sonnerToast.error('Failed to copy to clipboard', {
        description: 'Check console for debug info',
      });
      console.log('🔧 DEBUG INFO:', debugInfo);
      console.log('📋 FORMATTED OUTPUT:', formattedOutput);
    }
  };

  // Don't render if not allowed user
  if (!isAllowed) {
    return null;
  }

  return (
    <Button
      onClick={handleDevClick}
      size="icon"
      variant="outline"
      className="fixed bottom-4 right-4 z-[9999] h-12 w-12 rounded-full shadow-lg bg-background/80 backdrop-blur-sm border-2 hover:scale-110 transition-transform"
      title="Copy debug info"
    >
      <Bug className="h-5 w-5" />
    </Button>
  );
};


// Trial Overlay Component - checks enterprise trial status
const EnterpriseTrialCheck = () => {
  const { enterpriseMembership } = useSubscription();
  
  if (!enterpriseMembership?.isMember || !enterpriseMembership.company) {
    return null;
  }

  const trial = enterpriseMembership.company.trial;
  if (!trial?.enabled) {
    return null;
  }

  const showBanner = !trial.expired && trial.daysRemaining !== null && trial.daysRemaining > 0;

  return (
    <>
      <TrialExpiredOverlay
        companyName={enterpriseMembership.company.name}
        daysRemaining={trial.daysRemaining}
        expired={trial.expired}
        manuallyDisabled={trial.manuallyDisabled}
      />
      {showBanner && <div className="h-[52px]" />}
    </>
  );
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
                  <UnderConstructionOverlay>
                    <PlanGate>
                      <ScrollToTop />
                      <PreserveAppParam />
                      <AuthRedirectHandler />
                      <GlobalDevButton />
                      <EnterpriseTrialCheck />
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
                          <Route path="/admin/email-campaigns" element={<AdminRoute><AdminEmailCampaigns /></AdminRoute>} />
                          <Route path="/admin/enterprise" element={<AdminRoute><AdminEnterprise /></AdminRoute>} />
                          <Route path="/admin/enterprise/billing" element={<AdminRoute><AdminEnterpriseBilling /></AdminRoute>} />
                          <Route path="/admin/marketing" element={<Navigate to="/" replace />} />
                          <Route path="/subscribe/success" element={<ProtectedRoute><SubscribeSuccess /></ProtectedRoute>} />
                          <Route path="*" element={<NotFound />} />
                          </Routes>
                        </Suspense>
                        </AppLayout>
                      </WelcomeGate>
                    </PlanGate>
                  </UnderConstructionOverlay>
                </SubscriptionProvider>
              </AuthProvider>
            </BrowserRouter>
        </TooltipProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
};

export default App;
