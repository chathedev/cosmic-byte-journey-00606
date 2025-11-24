import { toast } from "sonner";
import { isIosApp } from "@/utils/environment";
import { apiClient } from "./api";
import { NativePurchases, PURCHASE_TYPE } from "@capgo/native-purchases";

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
    console.log("🍎 IAP: Checking billing support");
    const { isBillingSupported } = await NativePurchases.isBillingSupported();
    
    if (!isBillingSupported) {
      console.error("🍎 IAP: ❌ Billing not supported on this device");
      return;
    }
    
    console.log("🍎 IAP: ✅ Billing supported, initialization successful");
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
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: Object.values(PRODUCT_IDS),
      productType: PURCHASE_TYPE.SUBS,
    });

    return products.map((p: any) => ({
      identifier: p.productIdentifier,
      title: p.title,
      description: p.description,
      price: p.priceString,
      priceAmount: p.price,
      currency: p.currency,
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

  // Check if NativePurchases is available
  if (typeof NativePurchases === 'undefined') {
    console.error("🍎 [appleIAP] ❌ NativePurchases is not defined! Plugin not loaded.");
    console.error("🍎 [appleIAP] window.NativePurchases:", typeof (window as any).NativePurchases);
    console.error("🍎 [appleIAP] window.Capacitor:", typeof (window as any).Capacitor);
    toast.error("IAP plugin inte tillgängligt. Appen behöver uppdateras.");
    return false;
  }

  console.log("🍎 [appleIAP] NativePurchases available");

  try {
    console.log("🍎 [appleIAP] Starting purchase for:", productId);
    
    // Check if we're in a mocked environment
    if ((window as any).Capacitor?.getPlatform() === 'web') {
      console.error("🍎 [appleIAP] ❌ Running in web mode, not native iOS!");
      toast.error("TestFlight-appen behöver uppdateras. Kontakta support.", { id: 'iap-purchase' });
      return false;
    }
    
    toast.loading("Öppnar Apple betalning...", { id: 'iap-purchase' });

    const transaction = await NativePurchases.purchaseProduct({
      productIdentifier: productId,
      productType: PURCHASE_TYPE.SUBS,
    });

    console.log("🍎 [appleIAP] Purchase result:", transaction);
    console.log("🍎 [appleIAP] Transaction keys:", Object.keys(transaction));
    console.log("🍎 [appleIAP] Has receipt?", !!transaction.receipt);

    // Check if this is a mock transaction (indicates old build)
    if (transaction.transactionId === "transactionId" || !transaction.receipt) {
      console.error("🍎 [appleIAP] ❌ MOCK TRANSACTION DETECTED! App needs rebuild with new IAP package.");
      console.error("🍎 [appleIAP] Steps: 1) git pull, 2) npm install, 3) npx cap sync ios, 4) rebuild in Xcode");
      toast.error("TestFlight-bygget är föråldrat. En ny version krävs för IAP.", { 
        id: 'iap-purchase',
        duration: 5000 
      });
      return false;
    }
    
    if (transaction.receipt) {
      toast.loading("Verifierar köp...", { id: 'iap-purchase' });
      const verified = await verifyReceiptWithBackend(transaction.receipt);

      if (verified) {
        toast.success("Köp genomfört! 🎉", { id: 'iap-purchase' });
        return true;
      } else {
        toast.error("Kunde inte verifiera kvittot", { id: 'iap-purchase' });
        return false;
      }
    } else {
      console.warn("🍎 [appleIAP] No receipt in transaction");
      toast.error("Inget kvitto mottogs. Kontakta support.", { id: 'iap-purchase' });
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

    await NativePurchases.restorePurchases();
    console.log("🍎 IAP: ✅ Restore successful");

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
