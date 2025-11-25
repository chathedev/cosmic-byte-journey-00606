import { toast } from "sonner";

/**
 * Apple In-App Purchase Integration
 * Using native iOS bridge: window.TivlyNative.showPaywall()
 * 
 * The native iOS app injects window.TivlyNative when running on io.tivly.se
 * This bridge is used to trigger the RevenueCat paywall
 */

// Type declaration for native bridge
declare global {
  interface Window {
    TivlyNative?: {
      showPaywall: () => void;
      restorePurchases?: () => void;
    };
  }
}

export const PRODUCT_IDS = {
  PRO_MONTHLY: "tivly_pro_monthly",
};

/**
 * Check if running on iOS app domain (io.tivly.se)
 * This domain is exclusively for the iOS native app
 */
export function isIosDomain(): boolean {
  return typeof window !== 'undefined' && window.location.hostname === 'io.tivly.se';
}

/**
 * Check if TivlyNative bridge is available
 */
export function hasTivlyNative(): boolean {
  return typeof window !== 'undefined' && !!window.TivlyNative?.showPaywall;
}

/**
 * Check if running in iOS native app with TivlyNative bridge
 * Returns true if on io.tivly.se domain (always use Apple IAP on this domain)
 */
export function isNativeIOS(): boolean {
  const onIosDomain = isIosDomain();
  const hasNative = hasTivlyNative();
  
  console.log("[Tivly] isNativeIOS check:", {
    isIosDomain: onIosDomain,
    hasTivlyNative: hasNative,
    hostname: typeof window !== 'undefined' ? window.location.hostname : 'N/A',
  });
  
  // On io.tivly.se, we're always in iOS mode (never use Stripe)
  return onIosDomain;
}

/**
 * Initialize the IAP plugin (no-op, bridge is injected by native app)
 */
export async function initializeIAP() {
  console.log("🍎 IAP: iOS domain:", isIosDomain());
  console.log("🍎 IAP: TivlyNative available:", hasTivlyNative());
}

/**
 * Show native iOS paywall via TivlyNative bridge
 */
export async function purchaseAppleSubscription(productId: string): Promise<boolean> {
  console.log("🍎 [appleIAP] purchaseAppleSubscription called with:", productId);
  console.log("[Tivly] Trigger paywall - isIosDomain:", isIosDomain(), "hasTivlyNative:", hasTivlyNative());

  if (!isIosDomain()) {
    console.log("🍎 [appleIAP] Not on iOS domain, aborting");
    toast.error("Apple-köp fungerar endast i iOS-appen");
    return false;
  }

  if (!window.TivlyNative?.showPaywall) {
    console.error("🍎 [appleIAP] TivlyNative.showPaywall not available!");
    toast.error("Vänligen uppdatera appen för att köpa prenumeration.");
    return false;
  }

  try {
    console.log("🍎 [appleIAP] Calling window.TivlyNative.showPaywall()...");
    
    // Call native paywall bridge
    window.TivlyNative.showPaywall();
    
    console.log("🍎 [appleIAP] Native paywall call completed");
    
    // The native app handles the purchase flow from here
    // Return true to indicate the paywall was triggered
    return true;

  } catch (error: any) {
    console.error("🍎 [appleIAP] Error calling TivlyNative.showPaywall():", error);
    toast.error("In-app purchase is not available right now.");
    return false;
  }
}

/**
 * Legacy function name for backward compatibility
 */
export async function buyIosSubscription(productId: string): Promise<boolean> {
  return purchaseAppleSubscription(productId);
}

/**
 * Restore previous purchases via native bridge
 */
export async function restorePurchases(): Promise<boolean> {
  console.log("[Tivly] Restore purchases - isIosDomain:", isIosDomain(), "hasTivlyNative:", hasTivlyNative());

  if (!isIosDomain()) {
    toast.error("Återställning fungerar endast i iOS-appen");
    return false;
  }

  if (!window.TivlyNative) {
    toast.error("Vänligen uppdatera appen för att återställa köp.");
    return false;
  }

  try {
    console.log("🍎 IAP: Calling TivlyNative for restore...");

    if (window.TivlyNative.restorePurchases) {
      window.TivlyNative.restorePurchases();
      console.log("🍎 IAP: restorePurchases() called");
    } else {
      // If restorePurchases not available, show paywall instead
      console.log("🍎 IAP: restorePurchases not available, showing paywall");
      window.TivlyNative.showPaywall();
    }
    
    return true;

  } catch (error: any) {
    console.error("🍎 IAP: Restore failed:", error);
    toast.error("In-app purchase is not available right now.");
    return false;
  }
}

/**
 * Show Customer Center - uses showPaywall as fallback
 */
export async function showCustomerCenter(): Promise<void> {
  if (!isIosDomain()) {
    toast.error("Customer Center fungerar endast i iOS-appen");
    return;
  }

  if (!window.TivlyNative?.showPaywall) {
    toast.error("Vänligen uppdatera appen.");
    return;
  }

  try {
    console.log("🍎 IAP: Showing customer center via paywall...");
    window.TivlyNative.showPaywall();
  } catch (error: any) {
    console.error("🍎 IAP: Failed to show customer center:", error);
    toast.error("In-app purchase is not available right now.");
  }
}
