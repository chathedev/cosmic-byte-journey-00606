import { toast } from "sonner";

/**
 * Apple In-App Purchase Integration
 * Using native iOS bridge: window.TivlyNative.showPaywall()
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
 * Check if running in iOS native app with TivlyNative bridge
 */
export function isNativeIOS(): boolean {
  const isIos = typeof window !== 'undefined'
    && !!window.TivlyNative
    && window.location.hostname === 'io.tivly.se';
  
  console.log("[Tivly] isNativeIOS check:", {
    hasWindow: typeof window !== 'undefined',
    hasTivlyNative: !!window.TivlyNative,
    hostname: typeof window !== 'undefined' ? window.location.hostname : 'N/A',
    result: isIos
  });
  
  return isIos;
}

/**
 * Initialize the IAP plugin (no-op, bridge is injected by native app)
 */
export async function initializeIAP() {
  console.log("🍎 IAP: Checking for TivlyNative bridge...");
  console.log("🍎 IAP: TivlyNative available:", !!window.TivlyNative);
}

/**
 * Show native iOS paywall via TivlyNative bridge
 */
export async function purchaseAppleSubscription(productId: string): Promise<boolean> {
  console.log("🍎 [appleIAP] purchaseAppleSubscription called with:", productId);
  console.log("[Tivly] Trigger paywall (iOS):", isNativeIOS());

  if (!isNativeIOS()) {
    console.log("🍎 [appleIAP] Not iOS native app, aborting");
    toast.error("Apple-köp fungerar endast i iOS-appen");
    return false;
  }

  try {
    console.log("🍎 [appleIAP] Calling window.TivlyNative.showPaywall()...");
    toast.loading("Öppnar Apple-betalning...", { id: 'iap-purchase' });
    
    // Call native paywall bridge
    window.TivlyNative!.showPaywall();
    
    console.log("🍎 [appleIAP] Native paywall triggered successfully");
    toast.dismiss('iap-purchase');
    
    // The native app handles the purchase flow from here
    // Return true to indicate the paywall was shown
    return true;

  } catch (error: any) {
    console.error("🍎 [appleIAP] Error calling TivlyNative.showPaywall():", error);
    toast.error("In-app purchase is not available right now.", { id: 'iap-purchase' });
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
  console.log("[Tivly] Restore purchases (iOS):", isNativeIOS());

  if (!isNativeIOS()) {
    toast.error("Återställning fungerar endast i iOS-appen");
    return false;
  }

  try {
    console.log("🍎 IAP: Calling TivlyNative.restorePurchases()...");
    toast.loading("Återställer köp...", { id: 'iap-restore' });

    if (window.TivlyNative?.restorePurchases) {
      window.TivlyNative.restorePurchases();
      console.log("🍎 IAP: Native restore triggered");
      toast.dismiss('iap-restore');
      return true;
    } else {
      // If restorePurchases not available, show paywall instead
      console.log("🍎 IAP: restorePurchases not available, showing paywall");
      window.TivlyNative!.showPaywall();
      toast.dismiss('iap-restore');
      return true;
    }

  } catch (error: any) {
    console.error("🍎 IAP: Restore failed:", error);
    toast.error("In-app purchase is not available right now.", { id: 'iap-restore' });
    return false;
  }
}

/**
 * Show Customer Center - uses showPaywall as fallback
 */
export async function showCustomerCenter(): Promise<void> {
  if (!isNativeIOS()) {
    toast.error("Customer Center fungerar endast i iOS-appen");
    return;
  }

  try {
    console.log("🍎 IAP: Showing customer center via paywall...");
    window.TivlyNative!.showPaywall();
  } catch (error: any) {
    console.error("🍎 IAP: Failed to show customer center:", error);
    toast.error("In-app purchase is not available right now.");
  }
}

// Removed unused functions: loadAppleProducts, getReceiptFromNative, verifyReceiptWithBackend
// The native app handles all purchase logic
