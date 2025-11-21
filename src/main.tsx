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
      navigator.serviceWorker.register('/sw.js').then((registration) => {
        console.log('Service Worker registered:', registration);
      }).catch((error) => {
        console.log('Service Worker registration failed:', error);
      });
    });
  } else {
    // In dev, ensure no old SWs linger which can cause blank screens
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach(r => r.unregister()));
  }
}

const rootElement = document.getElementById("root")!;

// Show content once React is ready to render
requestAnimationFrame(() => {
  rootElement.classList.add('loaded');
});

createRoot(rootElement).render(<App />);
