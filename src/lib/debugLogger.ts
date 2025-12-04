// Debug logger - only logs for admins and allowed users

const ALLOWED_EMAILS = ['charlie.wretling@icloud.com'];

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
