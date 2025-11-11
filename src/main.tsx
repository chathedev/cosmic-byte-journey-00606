import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

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

createRoot(document.getElementById("root")!).render(<App />);
