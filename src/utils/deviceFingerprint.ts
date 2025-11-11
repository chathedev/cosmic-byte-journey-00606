/**
 * Device fingerprinting to prevent multiple free accounts on the same device
 */

const STORAGE_KEY = 'tivly_device_id';
const ACCOUNT_CREATION_KEY = 'tivly_account_created';

// Generate a device fingerprint based on browser characteristics
const generateDeviceId = (): string => {
  const components = [
    navigator.userAgent,
    navigator.language,
    new Date().getTimezoneOffset(),
    screen.width,
    screen.height,
    screen.colorDepth,
  ];
  
  const fingerprint = components.join('|');
  return btoa(fingerprint).substring(0, 32);
};

// Get or create device ID
export const getDeviceId = (): string => {
  let deviceId = localStorage.getItem(STORAGE_KEY);
  
  if (!deviceId) {
    deviceId = generateDeviceId();
    localStorage.setItem(STORAGE_KEY, deviceId);
  }
  
  return deviceId;
};

// Check if this device has already created a free account
export const hasCreatedFreeAccount = (): boolean => {
  return localStorage.getItem(ACCOUNT_CREATION_KEY) === 'true';
};

// Mark that this device has created a free account
export const markAccountCreated = (): void => {
  localStorage.setItem(ACCOUNT_CREATION_KEY, 'true');
};

// Clear account creation flag (for admin/testing purposes)
export const clearAccountCreationFlag = (): void => {
  localStorage.removeItem(ACCOUNT_CREATION_KEY);
};
