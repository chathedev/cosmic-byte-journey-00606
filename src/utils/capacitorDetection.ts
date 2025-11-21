/**
 * @deprecated Use src/utils/environment.ts instead
 * This file is kept for backward compatibility
 */
import { isNativeApp as isNativeAppNew, isWebBrowser } from './environment';

export const isNativeApp = isNativeAppNew;
export const isWebApp = isWebBrowser;
