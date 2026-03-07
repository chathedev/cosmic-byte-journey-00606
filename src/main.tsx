import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { isNativeApp, getPlatform } from "./utils/environment";

// Detect and log environment immediately on app load
console.log("=".repeat(60));
if (isNativeApp()) {
  console.log(`✅ TIVLY RUNNING IN: Native Capacitor App (${getPlatform().toUpperCase()})`);
  console.log("📱 Features: Apple IAP enabled, Stripe hidden");
} else {
  console.log("🌍 TIVLY RUNNING IN: Standard Web Browser");
  console.log("💳 Features: Stripe checkout enabled, Apple IAP hidden");
}
console.log("=".repeat(60));

// Register service worker for PWA (safe registration)
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js?v=tivly-v4')
        .then((registration) => {
          console.log('Service Worker registered:', registration);
          console.log('SW active script:', registration.active?.scriptURL);
          console.log('SW controller:', navigator.serviceWorker.controller?.scriptURL);
          registration.update?.().catch(() => {});
        })
        .catch((error) => {
          console.log('Service Worker registration failed:', error);
        });
    });
  } else {
    // In dev, ensure no old SWs linger which can cause blank screens
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach(r => r.unregister()));
  }
}

const rootElement = document.getElementById("root")!;

const SSO_CALLBACK_PATH = '/auth/sso/callback';

/**
 * Normalize malformed SSO callback URLs (doubled paths from IdP redirects).
 * Also extracts any query params embedded in the doubled path portion.
 */
function normalizeDoubledSSOCallbackUrl(): void {
  const { pathname, search, hash } = window.location;
  if (!pathname.startsWith(SSO_CALLBACK_PATH)) return;

  // Check if path is clean already
  const rest = pathname.slice(SSO_CALLBACK_PATH.length);
  if (rest === '' || rest === '/') return;

  // Path has extra segments — likely a doubled callback URL
  console.warn('[main] Normalizing malformed SSO callback URL:', pathname);

  // Try to extract query params from the embedded URL
  // e.g. /auth/sso/callback/https://host/auth/sso/callback?sessionToken=abc
  let finalSearch = search;
  const fullRaw = pathname + search + hash;
  // Find the LAST '?' which may contain the real params
  const embeddedQIdx = rest.indexOf('?');
  if (embeddedQIdx !== -1 && !search) {
    // Params were in the path portion (browser didn't parse them as query)
    finalSearch = rest.slice(embeddedQIdx);
  }

  window.history.replaceState({}, document.title, `${SSO_CALLBACK_PATH}${finalSearch}${hash}`);
}

// Handle 404 redirects from 404.html FIRST (before normalization)
const redirectPath = sessionStorage.getItem('redirectPath');
if (redirectPath) {
  sessionStorage.removeItem('redirectPath');
  window.history.replaceState({}, document.title, redirectPath);
}

// Now normalize SSO callback URLs (runs on the restored path)
normalizeDoubledSSOCallbackUrl();

// Migrate legacy hash URLs (/#/feedback → /feedback)
if (window.location.hash.startsWith("#/")) {
  const cleanPath = window.location.hash.slice(1);
  window.history.replaceState({}, document.title, cleanPath + window.location.search);
}

// Show content once React is ready to render
requestAnimationFrame(() => {
  rootElement.classList.add('loaded');
});

createRoot(rootElement).render(<App />);
