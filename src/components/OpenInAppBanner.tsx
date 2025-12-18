import { useState, useEffect } from 'react';
import { Smartphone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import { isWebBrowser, isNativeApp } from '@/utils/environment';
import { useLocation } from 'react-router-dom';

const IOS_APP_UNIVERSAL_LINK = 'https://io.tivly.se';
const BANNER_DISMISSED_KEY = 'open_in_app_dismissed';
const BANNER_DISMISS_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const APP_OPENED_KEY = 'tivly_app_opened';

interface OpenInAppBannerProps {
  className?: string;
}

// Check if device is iOS
const isIOS = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera || '';
  return /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;
};

// Check if user has previously opened the app
const hasOpenedAppBefore = (): boolean => {
  return localStorage.getItem(APP_OPENED_KEY) === 'true';
};

export const OpenInAppBanner = ({ className }: OpenInAppBannerProps) => {
  const [showPopup, setShowPopup] = useState(false);
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
    
    // ONLY show on iOS devices
    if (!isIOS()) return;
    
    // ONLY show if user has previously opened the app
    if (!hasOpenedAppBefore()) return;

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
    
    // Show popup with slight delay
    const timer = setTimeout(() => setShowPopup(true), fromEmail ? 500 : 1500);
    return () => clearTimeout(timer);
  }, [enterpriseMembership, isLoading, authLoading, shouldShowForUser, location.pathname]);

  const handleDismiss = () => {
    localStorage.setItem(BANNER_DISMISSED_KEY, Date.now().toString());
    setShowPopup(false);
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
    
    // Open via universal link
    window.location.href = deepLink;
    
    // Mark as opened and dismiss after short delay
    setTimeout(() => {
      handleDismiss();
      setIsAttemptingOpen(false);
    }, 1000);
  };

  if (!showPopup || !shouldShowForUser) return null;

  return (
    <div className={`fixed bottom-20 left-4 right-4 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300 ${className}`}>
      <div className="bg-card border border-border rounded-2xl shadow-xl p-4 max-w-sm mx-auto">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-5 h-5 text-primary" />
          </div>
          
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-foreground">
              Öppna i appen?
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Fortsätt i Tivly-appen för bästa upplevelsen
            </p>
            
            <div className="flex items-center gap-2 mt-3">
              <Button
                size="sm"
                onClick={handleOpenInApp}
                disabled={isAttemptingOpen}
                className="flex-1 h-8 text-xs"
              >
                {isAttemptingOpen ? 'Öppnar...' : 'Öppna appen'}
              </Button>
              
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDismiss}
                className="h-8 text-xs text-muted-foreground"
              >
                Stanna här
              </Button>
            </div>
          </div>
          
          <button
            onClick={handleDismiss}
            className="p-1 rounded-full hover:bg-muted transition-colors -mt-1 -mr-1"
            aria-label="Stäng"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default OpenInAppBanner;
