import { Capacitor } from '@capacitor/core';

export const isNativeApp = (): boolean => {
  return Capacitor.isNativePlatform();
};

export const isWebApp = (): boolean => {
  return !Capacitor.isNativePlatform();
};
