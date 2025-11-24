import { toast } from "sonner";
import { isIosApp } from "@/utils/environment";
import { apiClient } from "./api";

/**
 * Apple In-App Purchase Integration
 * Direct implementation using Capacitor's native iOS APIs
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
    console.log("🍎 IAP: iOS app detected - IAP ready");
    // IAP is handled natively by iOS, no initialization needed
  } catch (error) {
    console.error("🍎 IAP: ❌ Failed to initialize:", error);
    throw error;
  }
}

/**
 * Load Apple products from App Store
 * Note: Product info should be loaded from your backend or hardcoded for now
 */
export async function loadAppleProducts(): Promise<PurchaseProduct[]> {
  if (!isNativeIOS()) {
    console.log("🍎 IAP: loadAppleProducts skipped (not iOS)");
    return [];
  }

  // Return hardcoded product info for now
  // In production, fetch this from App Store Connect via native StoreKit
  return [
    {
      identifier: PRODUCT_IDS.PRO_MONTHLY,
      title: "Tivly Pro Monthly",
      description: "10 meetings per month with full features",
      price: "99 kr",
      priceAmount: 99,
      currency: "SEK",
    },
  ];
}

/**
 * Purchase Apple subscription and verify with backend
 * This should be called from native iOS code after successful purchase
 */
export async function purchaseAppleSubscription(productId: string): Promise<boolean> {
  console.log("🍎 [appleIAP] purchaseAppleSubscription called with:", productId);
  console.log("🍎 [appleIAP] isNativeIOS():", isNativeIOS());
  console.log("🍎 [appleIAP] window.location.hostname:", window.location.hostname);
  
  if (!isNativeIOS()) {
    console.warn("🍎 [appleIAP] Purchase attempted in web browser");
    toast.error("Apple purchases only work in the iOS app");
    return false;
  }

  try {
    console.log("🍎 [appleIAP] Starting purchase for:", productId);
    toast.loading("Öppnar Apple betalning...", { id: 'iap-purchase' });
    
    // Check if Capacitor and native bridge are available
    console.log("🍎 [appleIAP] Checking Capacitor availability...");
    console.log("🍎 [appleIAP] window.Capacitor:", typeof (window as any).Capacitor);
    
    if (typeof (window as any).Capacitor === 'undefined') {
      console.log("🍎 [appleIAP] Capacitor not available - showing demo flow");
      
      // Simulate purchase flow for demo
      await new Promise(resolve => setTimeout(resolve, 1500));
      toast.success("Demo: Köp genomfört! (Implementera native bridge för riktiga köp)", { id: 'iap-purchase' });
      
      return false; // Don't actually activate subscription in demo
    }
    
    // Call native bridge when implemented
    console.log("🍎 [appleIAP] Capacitor available, calling native bridge...");
    // const result = await Capacitor.Plugins.IAPManager.purchaseProduct({ productId });
    
    toast.error("Native köpflöde behöver implementeras", { id: 'iap-purchase' });
    return false;
  } catch (error: any) {
    console.error("🍎 [appleIAP] ❌ Purchase failed:", error);
    
    if (!error.message?.includes("cancelled")) {
      toast.error(`Köpet misslyckades: ${error.message || "Okänt fel"}`, { id: 'iap-purchase' });
    }
    
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
    console.warn("🍎 IAP: Restore attempted in web browser");
    toast.error("Återställning fungerar endast i iOS-appen");
    return false;
  }

  try {
    console.log("🍎 IAP: Restoring purchases...");
    toast.loading("Återställer köp...", { id: 'iap-restore' });
    
    // Check if Capacitor and native bridge are available
    if (typeof (window as any).Capacitor === 'undefined') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.info("Inga tidigare köp hittades", { id: 'iap-restore' });
      return false;
    }
    
    // Call native bridge when implemented
    // const result = await Capacitor.Plugins.IAPManager.restorePurchases();
    
    toast.info("Återställning behöver implementeras i native bridge", { id: 'iap-restore' });
    return false;
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
    console.log("🍎 IAP: Backend URL: https://api.tivly.se/ios/verify");
    
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
      toast.success("Subscription activated! 🎉");
      return true;
    } else {
      console.error("🍎 IAP: ❌ Backend returned success=false");
      toast.error("Verification failed");
      return false;
    }
  } catch (error: any) {
    console.error("🍎 IAP: ❌ Receipt verification error:", error);
    toast.error(`Verification error: ${error.message}`);
    return false;
  }
}

// ============================================================
// NATIVE iOS BRIDGE INTEGRATION GUIDE
// ============================================================
// 
// To complete Apple IAP implementation:
//
// 1. Add this to your iOS Swift code (AppDelegate.swift or dedicated IAP handler):
//
// ```swift
// import StoreKit
// 
// func purchaseProduct(productId: String, completion: @escaping (String?, Error?) -> Void) {
//     // Implement StoreKit purchase
//     // On success, get receipt:
//     if let receiptURL = Bundle.main.appStoreReceiptURL,
//        let receiptData = try? Data(contentsOf: receiptURL) {
//         let receiptBase64 = receiptData.base64EncodedString()
//         completion(receiptBase64, nil)
//     }
// }
// ```
//
// 2. Call verifyReceiptWithBackend(receipt) from JavaScript after native purchase
//
// 3. On success, refresh user state with apiClient.getMe()
//
// ============================================================
