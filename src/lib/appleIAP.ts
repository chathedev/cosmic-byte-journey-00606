import { toast } from "sonner";
import { isIosApp } from "@/utils/environment";
import { apiClient } from "./api";
import { CapacitorPurchases } from "@capgo/capacitor-purchases";

/**
 * Apple In-App Purchase Integration
 * Using @capgo/capacitor-purchases
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
 * Initialize the IAP plugin
 * Call this once when the app starts (iOS only)
 */
export async function initializeIAP() {
  if (!isNativeIOS()) {
    console.log("🍎 IAP: Skipping initialization (not iOS app)");
    return;
  }

  try {
    console.log("🍎 IAP: Initializing @capgo/capacitor-purchases");
    await CapacitorPurchases.setup({});
    console.log("🍎 IAP: Initialization successful");
  } catch (error) {
    console.error("🍎 IAP: ❌ Failed to initialize:", error);
  }
}

/**
 * Load Apple products from App Store
 */
export async function loadAppleProducts(): Promise<PurchaseProduct[]> {
  if (!isNativeIOS()) {
    return [];
  }

  try {
    const { products } = await CapacitorPurchases.getProducts({
      productIdentifiers: Object.values(PRODUCT_IDS),
    });

    return products.map((p: any) => ({
      identifier: p.productIdentifier,
      title: p.localizedTitle,
      description: p.localizedDescription,
      price: p.localizedPrice,
      priceAmount: p.price,
      currency: p.currencyCode,
    }));
  } catch (error) {
    console.error("🍎 IAP: Failed to load products:", error);
    return [];
  }
}

/**
 * Purchase Apple subscription and verify with backend
 */
export async function purchaseAppleSubscription(productId: string): Promise<boolean> {
  console.log("🍎 [appleIAP] purchaseAppleSubscription called with:", productId);

  if (!isNativeIOS()) {
    console.error("🍎 [appleIAP] Not iOS, aborting");
    toast.error("Apple purchases only work in the iOS app");
    return false;
  }

  // Check if CapacitorPurchases is available
  if (typeof CapacitorPurchases === 'undefined') {
    console.error("🍎 [appleIAP] ❌ CapacitorPurchases is not defined! Plugin not loaded.");
    console.error("🍎 [appleIAP] window.CapacitorPurchases:", typeof (window as any).CapacitorPurchases);
    console.error("🍎 [appleIAP] window.Capacitor:", typeof (window as any).Capacitor);
    toast.error("IAP plugin inte tillgängligt. Appen behöver uppdateras.");
    return false;
  }

  console.log("🍎 [appleIAP] CapacitorPurchases available");

  try {
    console.log("🍎 [appleIAP] Starting purchase for:", productId);
    toast.loading("Öppnar Apple betalning...", { id: 'iap-purchase' });

    const result = await CapacitorPurchases.purchase({
      productIdentifier: productId,
    });

    console.log("🍎 [appleIAP] Purchase result:", result);

    if (result.transaction?.appStoreReceipt) {
      toast.loading("Verifierar köp...", { id: 'iap-purchase' });
      const verified = await verifyReceiptWithBackend(result.transaction.appStoreReceipt);

      if (verified) {
        toast.success("Köp genomfört! 🎉", { id: 'iap-purchase' });
        return true;
      } else {
        toast.error("Kunde inte verifiera kvittot", { id: 'iap-purchase' });
        return false;
      }
    } else {
      console.warn("🍎 [appleIAP] No receipt in transaction");
      toast.error("Inget kvitto mottogs", { id: 'iap-purchase' });
      return false;
    }

  } catch (purchaseError: any) {
    console.error("🍎 [appleIAP] Purchase error:", purchaseError);

    if (purchaseError.message?.includes("canceled") || purchaseError.code === "1") {
      toast.dismiss('iap-purchase');
      return false;
    }

    // More detailed error logging
    console.error("🍎 [appleIAP] Error code:", purchaseError.code);
    console.error("🍎 [appleIAP] Error message:", purchaseError.message);
    console.error("🍎 [appleIAP] Full error:", JSON.stringify(purchaseError));

    toast.error(`Köpet misslyckades: ${purchaseError.message || purchaseError.code || "Okänt fel"}`, { id: 'iap-purchase' });
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
 * Restore previous purchases
 */
export async function restorePurchases(): Promise<boolean> {
  if (!isNativeIOS()) {
    toast.error("Återställning fungerar endast i iOS-appen");
    return false;
  }

  try {
    console.log("🍎 IAP: Restoring purchases...");
    toast.loading("Återställer köp...", { id: 'iap-restore' });

    const result = await CapacitorPurchases.restorePurchases();
    console.log("🍎 IAP: Restore result:", result);

    toast.success("Köp återställda", { id: 'iap-restore' });
    return true;

  } catch (error: any) {
    console.error("🍎 IAP: ❌ Restore failed:", error);
    toast.error(`Återställning misslyckades: ${error.message || "Okänt fel"}`, { id: 'iap-restore' });
    return false;
  }
}

/**
 * Verify receipt with backend
 * Call this after successful purchase with base64 receipt
 */
export async function verifyReceiptWithBackend(receiptBase64: string): Promise<boolean> {
  try {
    console.log("🍎 IAP: Verifying receipt with backend...");

    const token = apiClient.getAuthToken();
    if (!token) {
      console.error("🍎 IAP: ❌ No auth token available");
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
      console.error("🍎 IAP: ❌ Backend verification failed:", errorData);
      toast.error(errorData.message || "Verification failed");
      return false;
    }

    const data = await response.json();
    console.log("🍎 IAP: ✅ Receipt verified by backend:", data);

    if (data.success && data.subscription) {
      console.log("🍎 IAP: ✅ Subscription activated:", data.subscription);
      return true;
    } else {
      console.error("🍎 IAP: ❌ Backend returned success=false");
      return false;
    }
  } catch (error: any) {
    console.error("🍎 IAP: ❌ Receipt verification error:", error);
    toast.error(`Verification error: ${error.message}`);
    return false;
  }
}
