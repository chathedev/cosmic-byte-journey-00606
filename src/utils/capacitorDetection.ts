import { Capacitor } from '@capacitor/core';

// Detect if running inside a native shell (Capacitor or installed app)
export const isNativeApp = (): boolean => {
  if (typeof window === 'undefined') return false;

  try {
    if (Capacitor.isNativePlatform()) return true;
  } catch {
    // Ignore and fall back to heuristics
  }

  const ua = navigator.userAgent || navigator.vendor || '';

  // Heuristics:
  // - Custom app identifiers (update if you add your own)
  // - "Capacitor" token added by many Capacitor shells
  // - Installed PWA display mode
  const isStandalonePWA = window.matchMedia?.('(display-mode: standalone)').matches;

  return /Capacitor|TivlyApp/i.test(ua) || isStandalonePWA;
};

export const isWebApp = (): boolean => {
  return !isNativeApp();
};
