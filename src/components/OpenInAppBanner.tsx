import { useState, useEffect } from 'react';
import { Smartphone, X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import { isWebBrowser, isNativeApp } from '@/utils/environment';
import { useLocation } from 'react-router-dom';

const IOS_APP_SCHEME = 'tivly://';
const IOS_APP_UNIVERSAL_LINK = 'https://io.tivly.se';
const BANNER_DISMISSED_KEY = 'open_in_app_dismissed';
const BANNER_DISMISS_DURATION = 24 * 60 * 60 * 1000; // 24 hours

interface OpenInAppBannerProps {
  className?: string;
}

export const OpenInAppBanner = ({ className }: OpenInAppBannerProps) => {
  const [showBanner, setShowBanner] = useState(false);
  const [isAttemptingOpen, setIsAttemptingOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const { enterpriseMembership, isLoading } = useSubscription();
  const { user, isLoading: authLoading } = useAuth();
  const location = useLocation();

  // Check if user is admin
  useEffect(() => {
    const checkAdmin = async () => {
      if (!user?.email) {
        setIsAdmin(false);
        return;
      }
      try {
        const roleData = await apiClient.getUserRole(user.email.toLowerCase());
        setIsAdmin(roleData?.role === 'admin' || roleData?.role === 'owner');
      } catch {
        setIsAdmin(false);
      }
    };
    if (!authLoading) {
      checkAdmin();
    }
  }, [user, authLoading]);

  const shouldShowForUser = enterpriseMembership?.isMember || isAdmin;

  useEffect(() => {
    // Only show for enterprise users OR admins on web browser
    if (isLoading || authLoading) return;
    if (!shouldShowForUser) return;
    if (!isWebBrowser()) return;
    if (isNativeApp()) return;

    // Check if dismissed recently
    const dismissedAt = localStorage.getItem(BANNER_DISMISSED_KEY);
    if (dismissedAt) {
      const dismissedTime = parseInt(dismissedAt, 10);
      if (Date.now() - dismissedTime < BANNER_DISMISS_DURATION) {
        return;
      }
    }

    // Check for email redirect indicators
    const params = new URLSearchParams(window.location.search);
    const fromEmail = params.get('from') === 'email' || params.get('utm_source') === 'email';
    
    // Show banner with slight delay
    const timer = setTimeout(() => setShowBanner(true), fromEmail ? 500 : 2000);
    return () => clearTimeout(timer);
  }, [enterpriseMembership, isLoading, authLoading, shouldShowForUser, location.pathname]);

  const handleDismiss = () => {
    localStorage.setItem(BANNER_DISMISSED_KEY, Date.now().toString());
    setShowBanner(false);
  };

  const getDeepLink = () => {
    const path = location.pathname;
    const searchParams = new URLSearchParams(location.search);
    
    // Build deep link path
    let deepLinkPath = path;
    if (searchParams.toString()) {
      deepLinkPath += '?' + searchParams.toString();
    }
    
    return `${IOS_APP_UNIVERSAL_LINK}${deepLinkPath}`;
  };

  const handleOpenInApp = async () => {
    setIsAttemptingOpen(true);
    
    const deepLink = getDeepLink();
    
    // Try to open via universal link first (iOS Universal Links)
    // This will open the app if installed, or fallback to web
    const startTime = Date.now();
    
    // Create a hidden link and click it
    const link = document.createElement('a');
    link.href = deepLink;
    link.style.display = 'none';
    document.body.appendChild(link);
    
    // Try custom URL scheme as fallback
    const schemeLink = `${IOS_APP_SCHEME}${location.pathname}`;
    
    // First try universal link
    window.location.href = deepLink;
    
    // If still on page after 1.5s, app might not be installed
    setTimeout(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed < 2000) {
        // App probably opened, dismiss banner
        handleDismiss();
      }
      setIsAttemptingOpen(false);
      document.body.removeChild(link);
    }, 1500);
  };

  if (!showBanner || !shouldShowForUser) return null;

  const companyName = enterpriseMembership?.company?.name || (isAdmin ? 'Tivly' : 'ditt företag');

  return (
    <div className={`fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg ${className}`}>
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">
                Öppna i Tivly-appen
              </p>
              <p className="text-xs opacity-90 truncate">
                Få en bättre upplevelse med {companyName}s app
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleOpenInApp}
              disabled={isAttemptingOpen}
              className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 font-medium"
            >
              {isAttemptingOpen ? (
                <span className="flex items-center gap-1">
                  <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Öppnar...
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <ExternalLink className="w-4 h-4" />
                  Öppna
                </span>
              )}
            </Button>
            
            <button
              onClick={handleDismiss}
              className="p-1.5 rounded-full hover:bg-primary-foreground/20 transition-colors"
              aria-label="Stäng"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OpenInAppBanner;
