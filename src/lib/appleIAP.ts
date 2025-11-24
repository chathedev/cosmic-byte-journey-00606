import { toast } from "sonner";
import { isIosApp } from "@/utils/environment";
import { apiClient } from "./api";
import { CapacitorPurchases } from "@capgo/capacitor-purchases";

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

  console.log("🍎 IAP: RevenueCat initialized via native AppDelegate");
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
    const { offerings } = await CapacitorPurchases.getOfferings();
    
    if (!offerings.current) {
      console.warn("🍎 IAP: No current offering available");
      return [];
    }

    const packages = offerings.current.availablePackages || [];
    console.log("🍎 IAP: Found packages:", packages.length);

    return packages.map((pkg: any) => ({
      identifier: pkg.product.identifier,
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
    toast.error("Apple purchases only work in the iOS app");
    return false;
  }

  try {
    console.log("🍎 [appleIAP] Fetching offerings...");
    toast.loading("Öppnar Apple betalning...", { id: 'iap-purchase' });

    // Get offerings
    const { offerings } = await CapacitorPurchases.getOfferings();
    
    if (!offerings.current) {
      toast.error("Inga produkter tillgängliga", { id: 'iap-purchase' });
      return false;
    }

    // Find the package matching the product ID
    const packages = offerings.current.availablePackages || [];
    const targetPackage = packages.find((pkg: any) => pkg.product.identifier === productId);
    
    if (!targetPackage) {
      console.error("🍎 [appleIAP] Product not found:", productId);
      toast.error("Produkt hittades inte", { id: 'iap-purchase' });
      return false;
    }

    console.log("🍎 [appleIAP] Purchasing package:", targetPackage.identifier);
    
    // Make the purchase through RevenueCat
    const { customerInfo } = await CapacitorPurchases.purchasePackage({ 
      identifier: targetPackage.identifier,
      offeringIdentifier: offerings.current.identifier
    });

    console.log("🍎 [appleIAP] Purchase successful, customer info:", customerInfo);
    
    // Get receipt from native TivlyStoreKitManager and verify
    toast.loading("Verifierar köp...", { id: 'iap-purchase' });
    
    const receiptData = await getReceiptFromNative();
    if (receiptData) {
      const verified = await verifyReceiptWithBackend(receiptData);

      if (verified) {
        toast.success("Köp genomfört! 🎉", { id: 'iap-purchase' });
        return true;
      } else {
        toast.error("Kunde inte verifiera kvittot", { id: 'iap-purchase' });
        return false;
      }
    } else {
      console.warn("🍎 [appleIAP] No receipt available");
      toast.success("Köp genomfört! 🎉", { id: 'iap-purchase' });
      return true;
    }

  } catch (purchaseError: any) {
    console.error("🍎 [appleIAP] Purchase error:", purchaseError);

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

    const { customerInfo } = await CapacitorPurchases.restorePurchases();
    console.log("🍎 IAP: Restore result:", customerInfo);

    // Get receipt and verify with backend if available
    const receiptData = await getReceiptFromNative();
    if (receiptData) {
      await verifyReceiptWithBackend(receiptData);
    }

    toast.success("Köp återställda", { id: 'iap-restore' });
    return true;

  } catch (error: any) {
    console.error("🍎 IAP: Restore failed:", error);
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
