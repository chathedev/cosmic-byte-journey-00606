// Debug logger - only logs for admins
// Suppresses ALL console output for non-admin users

// Store original console methods
const originalConsole = {
  log: console.log.bind(console),
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
};

// Extend window type
declare global {
  interface Window {
    __TIVLY_IS_ADMIN__?: boolean;
    __TIVLY_CONSOLE_INITIALIZED__?: boolean;
  }
}

// Check if user is admin (set by SubscriptionContext)
function isAdmin(): boolean {
  return window.__TIVLY_IS_ADMIN__ === true;
}

// Initialize console suppression for non-admins
export const initializeConsoleSuppression = () => {
  if (window.__TIVLY_CONSOLE_INITIALIZED__) return;
  window.__TIVLY_CONSOLE_INITIALIZED__ = true;

  // Override all console methods
  console.log = (...args: any[]) => {
    if (isAdmin()) originalConsole.log(...args);
  };
  
  console.error = (...args: any[]) => {
    if (isAdmin()) originalConsole.error(...args);
  };
  
  console.warn = (...args: any[]) => {
    if (isAdmin()) originalConsole.warn(...args);
  };
  
  console.info = (...args: any[]) => {
    if (isAdmin()) originalConsole.info(...args);
  };
  
  console.debug = (...args: any[]) => {
    if (isAdmin()) originalConsole.debug(...args);
  };
};

// Debug log functions (always check admin status)
export const debugLog = (...args: any[]) => {
  if (isAdmin()) originalConsole.log(...args);
};

export const debugError = (...args: any[]) => {
  if (isAdmin()) originalConsole.error(...args);
};

export const debugWarn = (...args: any[]) => {
  if (isAdmin()) originalConsole.warn(...args);
};

export const debugInfo = (...args: any[]) => {
  if (isAdmin()) originalConsole.info(...args);
};

// Set admin status (call from SubscriptionContext)
export const setDebugAdminStatus = (isAdminUser: boolean) => {
  window.__TIVLY_IS_ADMIN__ = isAdminUser;
};

// Restore original console (for cleanup/testing)
export const restoreConsole = () => {
  console.log = originalConsole.log;
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
  console.debug = originalConsole.debug;
};
