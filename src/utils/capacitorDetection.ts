import { Capacitor } from '@capacitor/core';

// Detect if running inside the Tivly native app / shell
export const isNativeApp = (): boolean => {
  if (typeof window === 'undefined') return false;

  try {
    // Primary: Capacitor native runtime (covers real device + TestFlight + production)
    if (Capacitor.isNativePlatform()) return true;
  } catch {
    // Ignore and fall back to heuristics
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

  if (forced !== null) return forced;

  return matchesAppUA || isStandalonePWA || isIOSStandalone || looksLikeWebView;
};

export const isWebApp = (): boolean => {
  return !isNativeApp();
};
