import { Capacitor } from '@capacitor/core';

/**
 * Detects if running inside the Tivly native app / shell
 * Logs detection result and method to console for debugging
 */
export const isNativeApp = (): boolean => {
  if (typeof window === 'undefined') {
    console.log('📱 Native App Detection: Not in browser (SSR)');
    return false;
  }

  let detectionMethod = '';
  let result = false;

  try {
    // Primary: Capacitor native runtime (covers real device + TestFlight + production)
    if (Capacitor.isNativePlatform()) {
      detectionMethod = 'Capacitor.isNativePlatform()';
      result = true;
      console.log('📱 Native App Detection: TRUE via', detectionMethod, {
        platform: Capacitor.getPlatform(),
      });
      return true;
    }
  } catch (error) {
    console.warn('📱 Native App Detection: Capacitor check failed, using heuristics', error);
  }

  const ua = navigator.userAgent || navigator.vendor || '';

  // iOS standalone/PWA flag (Safari adds this when launched from home screen)
  const isIOSStandalone = (window.navigator as any).standalone === true;

  // Display-mode: standalone is another hint for installed experiences
  const isStandalonePWA = window.matchMedia?.('(display-mode: standalone)').matches;

  // Generic WebView / app-shell hints (Android & iOS)
  const looksLikeWebView = /; wv\)/i.test(ua) || /AppleWebKit\/(?!.*Safari)/i.test(ua);

  // Heuristics for installed app shells / PWAs / webviews
  const matchesAppUA = /Capacitor|TivlyApp/i.test(ua);

  // Last‑resort manual override for debugging (never documented to end users)
  const forced = (() => {
    try {
      const v = localStorage.getItem('tivly_force_native');
      if (v === 'true') return true;
      if (v === 'false') return false;
    } catch {}
    return null;
  })();

  if (forced !== null) {
    detectionMethod = 'localStorage override';
    result = forced;
    console.log('📱 Native App Detection:', result, 'via', detectionMethod);
    return forced;
  }

  // Check heuristics
  if (matchesAppUA) {
    detectionMethod = 'User-Agent (Capacitor/TivlyApp)';
    result = true;
  } else if (isStandalonePWA) {
    detectionMethod = 'display-mode: standalone';
    result = true;
  } else if (isIOSStandalone) {
    detectionMethod = 'iOS standalone mode';
    result = true;
  } else if (looksLikeWebView) {
    detectionMethod = 'WebView indicators';
    result = true;
  } else {
    detectionMethod = 'none (web browser)';
    result = false;
  }

  console.log('📱 Native App Detection:', result, 'via', detectionMethod, {
    userAgent: ua.substring(0, 100),
    isStandalonePWA,
    isIOSStandalone,
    looksLikeWebView,
    matchesAppUA,
  });

  return result;
};

export const isWebApp = (): boolean => {
  return !isNativeApp();
};
