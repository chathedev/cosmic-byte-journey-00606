export const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768;
};

export const shouldShowToasts = (): boolean => {
  return !isMobileDevice();
};
