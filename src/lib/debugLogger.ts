// Debug logger - only logs for admins and allowed users

const ALLOWED_EMAILS = ['charlie.wretling@icloud.com', 'vildewretling@gmail.com'];

let cachedIsAllowed: boolean | null = null;
let cachedEmail: string | null = null;

function checkIsAllowed(): boolean {
  // Check localStorage for user email (cached auth)
  const authData = localStorage.getItem('authUser');
  if (!authData) return false;
  
  try {
    const user = JSON.parse(authData);
    const email = user?.email?.toLowerCase();
    
    if (!email) return false;
    
    // Cache the result
    if (email !== cachedEmail) {
      cachedEmail = email;
      // Check if admin or allowed email
      cachedIsAllowed = ALLOWED_EMAILS.some(e => e.toLowerCase() === email);
    }
    
    return cachedIsAllowed || false;
  } catch {
    return false;
  }
}

// Check if user is admin (set by SubscriptionContext)
function isAdmin(): boolean {
  return window.__TIVLY_IS_ADMIN__ === true;
}

// Extend window type
declare global {
  interface Window {
    __TIVLY_IS_ADMIN__?: boolean;
  }
}

export const debugLog = (...args: any[]) => {
  if (isAdmin() || checkIsAllowed()) {
    console.log(...args);
  }
};

export const debugError = (...args: any[]) => {
  if (isAdmin() || checkIsAllowed()) {
    console.error(...args);
  }
};

export const debugWarn = (...args: any[]) => {
  if (isAdmin() || checkIsAllowed()) {
    console.warn(...args);
  }
};

// Set admin status (call from SubscriptionContext)
export const setDebugAdminStatus = (isAdminUser: boolean) => {
  window.__TIVLY_IS_ADMIN__ = isAdminUser;
};

// Install global error & navigation logging for allowed users
export const installGlobalDebugLogging = () => {
  if (!isAdmin() && !checkIsAllowed()) return;

  // Log all uncaught errors
  window.addEventListener('error', (e) => {
    console.error('[🔴 GlobalError]', e.message, e.filename, e.lineno, e.colno, e.error);
  });

  // Log unhandled promise rejections
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[🔴 UnhandledRejection]', e.reason);
  });

  // Log page visibility changes
  document.addEventListener('visibilitychange', () => {
    console.log(`[👁 Visibility] ${document.visibilityState}`);
  });

  // Log focus/blur
  window.addEventListener('focus', () => console.log('[🔵 Focus] Window focused'));
  window.addEventListener('blur', () => console.log('[🔵 Blur] Window blurred'));

  // Patch pushState/replaceState to log navigation
  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = function (...args: Parameters<typeof origPush>) {
    console.log('[🧭 Navigate] pushState →', args[2]);
    return origPush(...args);
  };
  history.replaceState = function (...args: Parameters<typeof origReplace>) {
    console.log('[🧭 Navigate] replaceState →', args[2]);
    return origReplace(...args);
  };
  window.addEventListener('popstate', () => {
    console.log('[🧭 Navigate] popstate →', window.location.pathname);
  });

  console.log('[🛠 DebugLogger] Global logging installed for', cachedEmail);
};
