import { isNativeApp } from './environment';

// Check if running in native app (without URL param influence)
export const isRunningInNativeApp = isNativeApp;

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
