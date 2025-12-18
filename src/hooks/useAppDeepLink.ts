import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isWebBrowser, isNativeApp } from '@/utils/environment';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';

const IOS_APP_UNIVERSAL_LINK = 'https://io.tivly.se';
const APP_OPENED_KEY = 'tivly_app_opened';

/**
 * Hook to handle deep linking from emails and detect if user has the app
 * Automatically redirects enterprise users and admins to the iOS app when coming from email links
 */
export const useAppDeepLink = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { enterpriseMembership, isLoading } = useSubscription();
  const { user, isLoading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

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

  const shouldProcessForUser = enterpriseMembership?.isMember || isAdmin;

  useEffect(() => {
    // Only process on web browser
    if (!isWebBrowser() || isNativeApp()) return;
    if (isLoading || authLoading) return;
    
    // Only for enterprise users OR admins
    if (!shouldProcessForUser) return;

    const params = new URLSearchParams(location.search);
    const fromEmail = params.get('from') === 'email' || params.get('utm_source') === 'email';
    const openInApp = params.get('open_in_app') === 'true';

    // If explicitly requested to open in app, or coming from email
    if (openInApp || fromEmail) {
      // Check if user has previously successfully opened the app
      const hasOpenedApp = localStorage.getItem(APP_OPENED_KEY) === 'true';
      
      if (hasOpenedApp || openInApp) {
        // Attempt to open in app
        const deepLink = `${IOS_APP_UNIVERSAL_LINK}${location.pathname}${location.search ? '&' + location.search.slice(1) : ''}`;
        
        // Store that we attempted redirect
        sessionStorage.setItem('attempted_app_redirect', 'true');
        
        // Try universal link
        window.location.href = deepLink;
      }
    }
  }, [location, enterpriseMembership, isLoading, authLoading, shouldProcessForUser]);

  /**
   * Mark that the app was successfully opened
   * Call this from native app detection to remember user has the app
   */
  const markAppOpened = () => {
    localStorage.setItem(APP_OPENED_KEY, 'true');
  };

  /**
   * Get the deep link URL for current page
   */
  const getDeepLink = (path?: string) => {
    const targetPath = path || location.pathname;
    return `${IOS_APP_UNIVERSAL_LINK}${targetPath}${location.search}`;
  };

  /**
   * Attempt to open current page in the app
   */
  const openInApp = () => {
    const deepLink = getDeepLink();
    window.location.href = deepLink;
  };

  return {
    markAppOpened,
    getDeepLink,
    openInApp,
    isEnterpriseUser: enterpriseMembership?.isMember || false,
    isAdmin,
    shouldShowAppBanner: shouldProcessForUser,
  };
};

export default useAppDeepLink;
