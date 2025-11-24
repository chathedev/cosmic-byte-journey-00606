import { toast } from "sonner";
import { isIosApp } from "@/utils/environment";
import { apiClient } from "./api";
import { registerPlugin } from "@capacitor/core";

/**
 * Apple In-App Purchase Integration
 * Using RevenueCat SDK via native Swift bridge
 */

interface RevenueCatPlugin {
  getOfferings(): Promise<{ current: { identifier: string; packages: any[] } }>;
  purchasePackage(options: { identifier: string; offeringIdentifier: string }): Promise<{ isPro: boolean }>;
  restorePurchases(): Promise<{ isPro: boolean }>;
  getCustomerInfo(): Promise<{ isPro: boolean }>;
  showPaywall(): Promise<void>;
  showCustomerCenter(): Promise<void>;
}

const RevenueCatManager = registerPlugin<RevenueCatPlugin>('RevenueCatManager');

/**
 * Apple In-App Purchase Integration
 * Using @capgo/capacitor-purchases (RevenueCat wrapper)
 * Native iOS StoreKit bridge already configured in Xcode
 */

export const PRODUCT_IDS = {
  PRO_MONTHLY: "tivly_pro_monthly",
};

interface PurchaseProduct {
  identifier: string;
  title: string;
  description: string;
  price: string;
  priceAmount: number;
  currency: string;
}

/**
 * Platform detection helper
 */
export function isNativeIOS(): boolean {
  return isIosApp();
}

/**
 * Initialize the IAP plugin (RevenueCat is initialized automatically by native code)
 */
export async function initializeIAP() {
  if (!isNativeIOS()) {
    console.log("🍎 IAP: Skipping initialization (not iOS app)");
    return;
  }

  console.log("🍎 IAP: RevenueCat initialized via native AppDelegate with production API key");
  console.log("🍎 IAP: API Key: appl_FKrIkzvUZsEugFXZaYznvBWjEvK");
}

/**
 * Load Apple products from App Store via RevenueCat Offerings
 */
export async function loadAppleProducts(): Promise<PurchaseProduct[]> {
  if (!isNativeIOS()) {
    return [];
  }

  try {
    console.log("🍎 IAP: Fetching offerings...");
    
    const result = await RevenueCatManager.getOfferings();
    
    if (!result.current) {
      console.warn("🍎 IAP: No current offering available");
      return [];
    }

    const packages = result.current.packages || [];
    console.log("🍎 IAP: Found packages:", packages.length);

    return packages.map((pkg: any) => ({
      identifier: pkg.identifier,
      title: pkg.product.title || pkg.product.identifier,
      description: pkg.product.description || "",
      price: pkg.product.priceString || "99 SEK",
      priceAmount: pkg.product.price || 99,
      currency: pkg.product.currencyCode || "SEK",
    }));
  } catch (error) {
    console.error("🍎 IAP: Failed to load products:", error);
    return [];
  }
}

/**
 * Purchase Apple subscription via RevenueCat and verify with backend
 */
export async function purchaseAppleSubscription(productId: string): Promise<boolean> {
  console.log("🍎 [appleIAP] purchaseAppleSubscription called with:", productId);

  if (!isNativeIOS()) {
    console.error("🍎 [appleIAP] Not iOS, aborting");
    toast.error("Apple-köp fungerar endast i iOS-appen");
    return false;
  }

  try {
    console.log("🍎 [appleIAP] Showing native RevenueCat paywall...");
    toast.loading("Öppnar Apple-betalning...", { id: 'iap-purchase' });
    
    // Show native SwiftUI paywall
    await RevenueCatManager.showPaywall();
    
    // Give user time to interact with paywall
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check subscription status after paywall interaction
    console.log("🍎 [appleIAP] Checking customer info after paywall...");
    const customerInfo = await RevenueCatManager.getCustomerInfo();
    const isPro = customerInfo.isPro || false;
    
    console.log("🍎 [appleIAP] Customer info result:", { isPro });
    
    if (isPro) {
      console.log("✅ Purchase successful! User is now Tivly Pro");
      toast.success("Välkommen till Tivly Pro! 🎉", { id: 'iap-purchase' });
      
      // Reload page to refresh subscription status
      setTimeout(() => window.location.reload(), 1500);
      return true;
    }
    
    console.log("⚠️ User closed paywall without purchasing");
    toast.dismiss('iap-purchase');
    return false;

  } catch (purchaseError: any) {
    console.error("🍎 [appleIAP] Purchase error:", purchaseError);

    // Handle UNIMPLEMENTED error (native plugin not installed in Xcode yet)
    if (purchaseError.code === 'UNIMPLEMENTED') {
      console.error("❌ RevenueCat native plugin not installed in Xcode");
      toast.dismiss('iap-purchase');
      
      // Re-throw with UNIMPLEMENTED code so SubscribeDialog can show setup instructions
      throw { code: 'UNIMPLEMENTED', message: 'RevenueCat SDK not installed' };
    }

    if (purchaseError.code === 1 || purchaseError.message?.includes("cancel")) {
      toast.dismiss('iap-purchase');
      return false;
    }

    toast.error(`Köpet misslyckades: ${purchaseError.message || "Okänt fel"}`, { id: 'iap-purchase' });
    return false;
  }
}

/**
 * Get receipt from native TivlyStoreKitManager plugin
 */
async function getReceiptFromNative(): Promise<string | null> {
  try {
    const result = await (window as any).Capacitor?.Plugins?.TivlyStoreKitManager?.getReceipt();
    return result?.receiptData || null;
  } catch (error) {
    console.error("🍎 IAP: Failed to get receipt from native:", error);
    return null;
  }
}

/**
 * Legacy function name for backward compatibility
 */
export async function buyIosSubscription(productId: string): Promise<boolean> {
  return purchaseAppleSubscription(productId);
}

/**
 * Show Customer Center for subscription management
 */
export async function showCustomerCenter(): Promise<void> {
  if (!isNativeIOS()) {
    toast.error("Customer Center fungerar endast i iOS-appen");
    return;
  }

  try {
    console.log("🍎 IAP: Showing customer center...");
    await RevenueCatManager.showCustomerCenter();
  } catch (error: any) {
    console.error("🍎 IAP: Failed to show customer center:", error);
    toast.error("Kunde inte öppna kontoinställningar");
  }
}

/**
 * Restore previous purchases via RevenueCat
 */
export async function restorePurchases(): Promise<boolean> {
  if (!isNativeIOS()) {
    toast.error("Återställning fungerar endast i iOS-appen");
    return false;
  }

  try {
    console.log("🍎 IAP: Restoring purchases...");
    toast.loading("Återställer köp...", { id: 'iap-restore' });

    const result = await RevenueCatManager.restorePurchases();
    console.log("🍎 IAP: Restore result:", result);

    const isPro = result.isPro || false;
    
    if (isPro) {
      toast.success("Köp återställda! Du har Tivly Pro 🎉", { id: 'iap-restore' });
      
      // Reload page to refresh subscription status
      setTimeout(() => window.location.reload(), 1500);
      return true;
    } else {
      toast.info("Inga tidigare köp hittades", { id: 'iap-restore' });
      return false;
    }

  } catch (error: any) {
    console.error("🍎 IAP: Restore failed:", error);
    
    // Handle UNIMPLEMENTED error (native plugin not installed in Xcode yet)
    if (error.code === 'UNIMPLEMENTED') {
      console.error("❌ RevenueCat native plugin not installed in Xcode");
      toast.error("RevenueCat SDK krävs. Följ installationsinstruktioner i Xcode.", { 
        id: 'iap-restore',
        duration: 5000 
      });
      return false;
    }
    
    toast.error(`Återställning misslyckades: ${error.message || "Okänt fel"}`, { id: 'iap-restore' });
    return false;
  }
}

/**
 * Verify receipt with backend
 */
export async function verifyReceiptWithBackend(receiptBase64: string): Promise<boolean> {
  try {
    console.log("🍎 IAP: Verifying receipt with backend...");

    const token = apiClient.getAuthToken();
    if (!token) {
      console.error("🍎 IAP: No auth token available");
      toast.error("Authentication required. Please log in.");
      return false;
    }

    const response = await fetch("https://api.tivly.se/ios/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ receipt: receiptBase64 }),
      credentials: "include",
    });

    console.log("🍎 IAP: Backend response status:", response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("🍎 IAP: Backend verification failed:", errorData);
      toast.error(errorData.message || "Verification failed");
      return false;
    }

    const data = await response.json();
    console.log("🍎 IAP: Receipt verified by backend:", data);

    if (data.success && data.subscription) {
      console.log("🍎 IAP: Subscription activated:", data.subscription);
      return true;
    } else {
      console.error("🍎 IAP: Backend returned success=false");
      return false;
    }
  } catch (error: any) {
    console.error("🍎 IAP: Receipt verification error:", error);
    toast.error(`Verification error: ${error.message}`);
    return false;
  }
}
