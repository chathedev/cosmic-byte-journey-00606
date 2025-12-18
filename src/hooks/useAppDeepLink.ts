import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isWebBrowser, isNativeApp } from '@/utils/environment';
import { useSubscription } from '@/contexts/SubscriptionContext';

const IOS_APP_UNIVERSAL_LINK = 'https://io.tivly.se';
const APP_OPENED_KEY = 'tivly_app_opened';

/**
 * Hook to handle deep linking from emails and detect if user has the app
 * Automatically redirects enterprise users to the iOS app when coming from email links
 */
export const useAppDeepLink = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { enterpriseMembership, isLoading } = useSubscription();

  useEffect(() => {
    // Only process on web browser
    if (!isWebBrowser() || isNativeApp()) return;
    if (isLoading) return;
    
    // Only for enterprise users
    if (!enterpriseMembership?.isMember) return;

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
  }, [location, enterpriseMembership, isLoading]);

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
  };
};

export default useAppDeepLink;
