import { Capacitor } from '@capacitor/core';

/**
 * Domain-based detection for iOS app vs web browser.
 * iOS app uses io.tivly.se, web browser uses app.tivly.se
 * 
 * This is the single source of truth for environment detection.
 * @returns {boolean} True if running on io.tivly.se domain (iOS app)
 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') {
    console.log('🔍 Environment Detection: Server-side (SSR)');
    return false;
  }

  try {
    const hostname = window.location.hostname;
    const isIosDomain = hostname === 'io.tivly.se';
    
    if (isIosDomain) {
      console.log('✅ Environment Detected: iOS Native App (io.tivly.se) - Apple IAP enabled');
    } else {
      console.log('🌍 Environment Detected: Web Browser (app.tivly.se) - Stripe enabled');
    }
    
    return isIosDomain;
  } catch (error) {
    console.warn('⚠️ Environment Detection failed, assuming web browser', error);
    return false;
  }
}

/**
 * Detects if user is trying to access io.tivly.se from a web browser
 * This should be blocked - only the native app can access io.tivly.se
 * @returns {boolean} True if web browser is trying to access app domain
 */
export function isWebBrowserOnAppDomain(): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const hostname = window.location.hostname;
    const isIosDomain = hostname === 'io.tivly.se';
    
    if (!isIosDomain) return false;
    
    // Multiple checks to ensure it's actually a native app
    const isActuallyNative = Capacitor.isNativePlatform();
    
    // Additional native indicators for iOS
    const hasIosWebkit = !!(window as any).webkit;
    const isStandalone = (window.navigator as any).standalone === true;
    const userAgent = window.navigator.userAgent || '';
    const isIosUserAgent = /iPhone|iPad|iPod/.test(userAgent);
    
    // If any native indicator is present on io.tivly.se, allow access
    if (isActuallyNative || hasIosWebkit || isStandalone || isIosUserAgent) {
      console.log('✅ Native app access confirmed on io.tivly.se');
      return false;
    }
    
    console.warn('🚫 Web browser detected on io.tivly.se - blocking access');
    return true;
  } catch (error) {
    console.warn('⚠️ App domain check failed', error);
    return false;
  }
}

/**
 * Detects if native app is trying to access app.tivly.se (web domain)
 * Native app should use io.tivly.se instead
 * @returns {boolean} True if native app is trying to access web domain
 */
export function isNativeAppOnWebDomain(): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const hostname = window.location.hostname;
    const isWebDomain = hostname === 'app.tivly.se';
    
    if (!isWebDomain) return false;
    
    // Check if it's actually running in Capacitor native app
    const isActuallyNative = Capacitor.isNativePlatform();
    
    if (isActuallyNative) {
      console.warn('🚫 Native app detected on app.tivly.se - should use io.tivly.se');
      return true;
    }
    
    return false;
  } catch (error) {
    console.warn('⚠️ Web domain check failed', error);
    return false;
  }
}

/**
 * Detects if we're on the dedicated auth domain
 * @returns {boolean} True if on auth.tivly.se
 */
export function isAuthDomain(): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const hostname = window.location.hostname;
    return hostname === 'auth.tivly.se';
  } catch (error) {
    return false;
  }
}

/**
 * Detects if we're on the billing domain
 * @returns {boolean} True if on billing.tivly.se
 */
export function isBillingDomain(): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const hostname = window.location.hostname;
    return hostname === 'billing.tivly.se';
  } catch (error) {
    return false;
  }
}

/**
 * Detects if we're on the connect domain
 * @returns {boolean} True if on connect.tivly.se
 */
export function isConnectDomain(): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const hostname = window.location.hostname;
    return hostname === 'connect.tivly.se';
  } catch (error) {
    return false;
  }
}

/**
 * Gets the appropriate redirect domain based on where user came from
 * @returns {string} The domain to redirect to after auth
 */
export function getRedirectDomain(): string {
  if (typeof window === 'undefined') return 'https://app.tivly.se';
  
  try {
    const stored = localStorage.getItem('auth_origin_domain');
    if (stored) return stored;
    
    // Default to app.tivly.se
    return 'https://app.tivly.se';
  } catch {
    return 'https://app.tivly.se';
  }
}

/**
 * Stores the origin domain for post-auth redirect
 * @param {string} domain - The domain to store
 */
export function storeOriginDomain(domain: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.setItem('auth_origin_domain', domain);
  } catch (error) {
    console.warn('Failed to store origin domain:', error);
  }
}

/**
 * Detects if running in a web browser (not native app)
 * @returns {boolean} True if running in a standard web browser
 */
export function isWebBrowser(): boolean {
  return !isNativeApp();
}

/**
 * Gets the current platform (ios, android, web)
 * @returns {string} Platform identifier
 */
export function getPlatform(): string {
  try {
    return Capacitor.getPlatform();
  } catch {
    return 'web';
  }
}

/**
 * Detects if running specifically on iOS native app
 * @returns {boolean} True if running on io.tivly.se
 */
export function isIosApp(): boolean {
  return isNativeApp();
}

/**
 * Detects if running specifically on Android native app
 * @returns {boolean} True if running in Android Capacitor app
 */
export function isAndroidApp(): boolean {
  return isNativeApp() && getPlatform() === 'android';
}
