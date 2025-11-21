/**
 * @deprecated Use src/utils/environment.ts instead
 * This file is kept for backward compatibility
 */
import { isIosApp as isIosAppNew, isWebBrowser as isWebBrowserNew } from './environment';

export const isIosApp = isIosAppNew;
export const isWebBrowser = isWebBrowserNew;
