import { Capacitor } from '@capacitor/core';

// Detect if running inside the Tivly native app / shell
export const isNativeApp = (): boolean => {
  if (typeof window === 'undefined') return false;

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

export const isWebApp = (): boolean => {
  return !isNativeApp();
};
