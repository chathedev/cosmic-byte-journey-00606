import { Capacitor } from '@capacitor/core';

/**
 * Detects if the code is running inside the native Capacitor wrapper (iOS/Android)
 * or in a standard web browser.
 * 
 * This is the single source of truth for environment detection.
 * @returns {boolean} True if running inside the Capacitor native wrapper
 */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') {
    console.log('🔍 Environment Detection: Server-side (SSR)');
    return false;
  }

  try {
    // Primary check: Use Capacitor's official isNativePlatform() method
    // This is the most reliable way to detect if we're in a native context
    const isNative = Capacitor.isNativePlatform();
    
    // Also check for the isNative property for backward compatibility
    const hasNativeProperty = (window as any).Capacitor?.isNative === true;
    
    // Use the official method, fall back to property check
    const result = isNative || hasNativeProperty;
    
    if (result) {
      const platform = Capacitor.getPlatform();
      console.log(`✅ Environment Detected: Native Capacitor App (${platform})`);
    } else {
      console.log('🌍 Environment Detected: Standard Web Browser (app.tivly.se)');
    }
    
    return result;
  } catch (error) {
    console.warn('⚠️ Environment Detection: Capacitor check failed, assuming web browser', error);
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
 * @returns {boolean} True if running in iOS Capacitor app
 */
export function isIosApp(): boolean {
  return isNativeApp() && getPlatform() === 'ios';
}

/**
 * Detects if running specifically on Android native app
 * @returns {boolean} True if running in Android Capacitor app
 */
export function isAndroidApp(): boolean {
  return isNativeApp() && getPlatform() === 'android';
}
