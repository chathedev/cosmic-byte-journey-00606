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

function normalizeDoubledSSOCallbackUrl(): void {
  const { pathname, search, hash } = window.location;
  if (!pathname.startsWith(SSO_CALLBACK_PATH)) return;

  const decodedPath = (() => {
    try {
      return decodeURIComponent(pathname);
    } catch {
      return pathname;
    }
  })();

  const hasTrailingSlashOnly = pathname === `${SSO_CALLBACK_PATH}/`;
  const hasExtraSegments = pathname !== SSO_CALLBACK_PATH && !hasTrailingSlashOnly;
  const looksEmbeddedUrl =
    decodedPath.includes(`${SSO_CALLBACK_PATH}/http://`) ||
    decodedPath.includes(`${SSO_CALLBACK_PATH}/https://`) ||
    decodedPath.includes(`${SSO_CALLBACK_PATH}/${window.location.origin}`);

  if (!hasTrailingSlashOnly && !hasExtraSegments && !looksEmbeddedUrl) return;

  console.warn('[main] Normalizing malformed SSO callback URL:', pathname);
  window.history.replaceState({}, document.title, `${SSO_CALLBACK_PATH}${search}${hash}`);
}

normalizeDoubledSSOCallbackUrl();

// Migrate legacy hash URLs (/#/feedback → /feedback)
if (window.location.hash.startsWith("#/")) {
  const cleanPath = window.location.hash.slice(1);
  window.history.replaceState({}, document.title, cleanPath + window.location.search);
}

// Handle 404 redirects from 404.html
const redirectPath = sessionStorage.getItem('redirectPath');
if (redirectPath) {
  sessionStorage.removeItem('redirectPath');
  window.history.replaceState({}, document.title, redirectPath);
}

// Show content once React is ready to render
requestAnimationFrame(() => {
  rootElement.classList.add('loaded');
});

createRoot(rootElement).render(<App />);
