import { Capacitor } from "@capacitor/core";

/**
 * Detects if the app is running inside the iOS Capacitor wrapper
 * Logs detection result to console for debugging
 */
export const isIosApp = (): boolean => {
  if (typeof window === 'undefined') {
    console.log('🍎 iOS Detection: Not in browser (SSR)');
    return false;
  }

  try {
    // Primary detection: Capacitor native platform
    const isNative = Capacitor.isNativePlatform();
    const platform = Capacitor.getPlatform();
    const isIos = isNative && platform === "ios";
    
    console.log('🍎 iOS Detection:', {
      isNative,
      platform,
      isIosApp: isIos,
      userAgent: navigator.userAgent.substring(0, 100)
    });
    
    return isIos;
  } catch (error) {
    console.warn('🍎 iOS Detection: Capacitor check failed, assuming web browser', error);
    return false;
  }
};

/**
 * Detects if the app is running in a web browser (not iOS app)
 */
export const isWebBrowser = (): boolean => {
  const result = !isIosApp();
  console.log('🌐 Web Browser Detection:', result);
  return result;
};
