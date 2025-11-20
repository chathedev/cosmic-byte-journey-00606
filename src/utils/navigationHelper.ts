import { Capacitor } from '@capacitor/core';

// Check if running in native app (without URL param influence)
export const isRunningInNativeApp = (): boolean => {
  if (typeof window === 'undefined') return false;

  // Check Capacitor first
  try {
    if (Capacitor.isNativePlatform()) return true;
  } catch {
    // Ignore and fall back to heuristics
  }

  const ua = navigator.userAgent || navigator.vendor || '';
  const isStandalonePWA = window.matchMedia?.('(display-mode: standalone)').matches;

  // Heuristics for installed app shells / PWAs
  return /Capacitor|TivlyApp/i.test(ua) || isStandalonePWA;
};

// Preserve usingapp parameter across navigation
export const preserveAppParam = (to: string): string => {
  if (typeof window === 'undefined') return to;
  
  const currentUrl = new URL(window.location.href);
  const usingApp = currentUrl.searchParams.get('usingapp');
  
  if (!usingApp) return to;
  
  // Parse the target URL
  try {
    const targetUrl = new URL(to, window.location.origin);
    if (!targetUrl.searchParams.has('usingapp')) {
      targetUrl.searchParams.set('usingapp', usingApp);
    }
    return targetUrl.pathname + targetUrl.search + targetUrl.hash;
  } catch {
    // If it's a relative path
    const separator = to.includes('?') ? '&' : '?';
    return `${to}${separator}usingapp=${usingApp}`;
  }
};

// Check if we should have the app param
export const shouldHaveAppParam = (): boolean => {
  return isRunningInNativeApp();
};
