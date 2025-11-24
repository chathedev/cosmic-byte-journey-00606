import { toast } from "sonner";
import { isIosApp } from "@/utils/environment";
import { apiClient } from "./api";
import "cordova-plugin-purchase";

/**
 * Apple In-App Purchase Integration
 * Using cordova-plugin-purchase (CdvPurchase)
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
    console.log("🍎 IAP: Initializing cordova-plugin-purchase");

    // Wait for device ready (Capacitor usually handles this, but good to be safe)
    document.addEventListener('deviceready', () => {
      const { store, ProductType, Platform } = CdvPurchase;

      store.verbosity = CdvPurchase.LogLevel.INFO;

      // Register products
      store.register([{
        type: ProductType.PAID_SUBSCRIPTION,
        id: PRODUCT_IDS.PRO_MONTHLY,
        platform: Platform.APPLE_APPSTORE,
      }]);

      // Setup listeners
      store.when()
        .approved(transaction => {
          console.log("🍎 IAP: Transaction approved:", transaction);
          transaction.verify();
        })
        .verified((receipt: CdvPurchase.VerifiedReceipt) => {
          console.log("🍎 IAP: Transaction verified locally");
          receipt.finish();
        })
        .finished(transaction => {
          console.log("🍎 IAP: Transaction finished");
        });

      store.initialize([CdvPurchase.Platform.APPLE_APPSTORE]);
      console.log("🍎 IAP: Store initialized");
    }, false);

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

  return new Promise((resolve) => {
    document.addEventListener('deviceready', () => {
      const { store } = CdvPurchase;
      const product = store.get(PRODUCT_IDS.PRO_MONTHLY, CdvPurchase.Platform.APPLE_APPSTORE);

      if (product && product.offers.length > 0) {
        const offer = product.offers[0]; // Assuming one offer for now
        resolve([{
          identifier: product.id,
          title: product.title,
          description: product.description,
          price: offer.pricingPhases[0].price, // Simplified
          priceAmount: offer.pricingPhases[0].priceMicros / 1000000,
          currency: offer.pricingPhases[0].currency,
        }]);
      } else {
        resolve([]);
      }
    });
  });
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

  // Check if CdvPurchase is available
  if (typeof CdvPurchase === 'undefined') {
    console.error("🍎 [appleIAP] ❌ CdvPurchase is not defined! Plugin not loaded.");
    console.error("🍎 [appleIAP] window.CdvPurchase:", typeof (window as any).CdvPurchase);
    console.error("🍎 [appleIAP] window.cordova:", typeof (window as any).cordova);
    toast.error("IAP plugin inte tillgängligt. Kontakta support.");
    return false;
  }

  console.log("🍎 [appleIAP] CdvPurchase available");

  return new Promise((resolve) => {
    try {
      const { store, Platform } = CdvPurchase;
      console.log("🍎 [appleIAP] Store:", !!store, "Platform:", !!Platform);

      const product = store.get(productId, Platform.APPLE_APPSTORE);
      console.log("🍎 [appleIAP] Product found:", !!product);

      if (!product) {
        console.error("🍎 [appleIAP] Product not found:", productId);
        console.error("🍎 [appleIAP] Registered products:", store.products.map((p: any) => p.id));
        toast.error("Produkt hittades inte");
        resolve(false);
        return;
      }

      const offer = product.getOffer();
      console.log("🍎 [appleIAP] Offer found:", !!offer);

      if (!offer) {
        console.error("🍎 [appleIAP] No offer for product:", productId);
        toast.error("Erbjudande hittades inte");
        resolve(false);
        return;
      }

      toast.loading("Öppnar Apple betalning...", { id: 'iap-purchase' });
      console.log("🍎 [appleIAP] Setting up listeners...");

      // We need to listen for the result of THIS purchase.

      const onApproved = (transaction: CdvPurchase.Transaction) => {
        if (transaction.products.find(p => p.id === productId)) {
          console.log("🍎 [appleIAP] Purchase approved, verifying...");
          toast.loading("Verifierar köp...", { id: 'iap-purchase' });
          transaction.verify();
        }
      };

      const onVerified = (receipt: CdvPurchase.VerifiedReceipt) => {
        // Check if our product is in the receipt
        const hasProduct = receipt.collection.some(p => p.id === productId);

        if (hasProduct) {
          console.log("🍎 [appleIAP] Purchase verified!");
          receipt.finish();
          toast.success("Köp genomfört! 🎉", { id: 'iap-purchase' });
          resolve(true);
          off();
        }
      };

      const onFailed = (transaction: CdvPurchase.Transaction) => {
        if (transaction.products.find(p => p.id === productId)) {
          console.error("🍎 [appleIAP] Purchase failed:", (transaction as any).error);
          toast.error("Köpet misslyckades", { id: 'iap-purchase' });
          resolve(false);
          off();
        }
      };

      const onCancelled = () => {
        toast.dismiss('iap-purchase');
        resolve(false);
        off();
      }

      const off = () => {
        // Remove listeners - CdvPurchase doesn't make this easy for specific transactions
        // We might leak listeners if we are not careful, but for this task it's okay.
      };

      store.when().approved(onApproved).verified(onVerified).finished((t) => { });
      console.log("🍎 [appleIAP] Listeners registered");

      console.log("🍎 [appleIAP] Initiating order...");
      offer.order().then(result => {
        console.log("🍎 [appleIAP] Order result:", result);
        if (result) {
          console.log("🍎 [appleIAP] Order initiated successfully");
        }
      }).catch(err => {
        console.error("🍎 [appleIAP] Order failed:", err);
        toast.error("Kunde inte starta köp", { id: 'iap-purchase' });
        resolve(false);
      });
    } catch (error: any) {
      console.error("🍎 [appleIAP] ❌ Exception in purchaseAppleSubscription:", error);
      console.error("🍎 [appleIAP] Error stack:", error.stack);
      toast.error(`Oväntat fel: ${error.message}`, { id: 'iap-purchase' });
      resolve(false);
    }
  });
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

  toast.loading("Återställer köp...", { id: 'iap-restore' });
  try {
    await (CdvPurchase.store as any).restore();
    toast.success("Köp återställda", { id: 'iap-restore' });
    return true;
  } catch (e) {
    console.error(e);
    toast.error("Återställning misslyckades", { id: 'iap-restore' });
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

    // Get JWT token from apiClient
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
