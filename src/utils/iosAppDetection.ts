import { Capacitor } from "@capacitor/core";

export const isIosApp = (): boolean => {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
  } catch {
    return false;
  }
};

export const isWebBrowser = (): boolean => {
  return !isIosApp();
};
