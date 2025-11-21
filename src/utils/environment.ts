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
