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
  if (!isNativeIOS()) {
    console.warn("🍎 IAP: Purchase attempted in web browser");
    toast.error("Apple purchases only work in the iOS app");
    return false;
  }

  try {
    console.log("🍎 IAP: Starting purchase for:", productId);
    toast.loading("Opening Apple payment...");
    
    // In a real implementation, this would trigger native iOS StoreKit purchase
    // For now, show instruction to implement native bridge
    toast.error("Native iOS purchase not yet implemented. Please add StoreKit bridge.");
    
    console.error("🍎 IAP: Native bridge not implemented");
    console.log("🍎 IAP: To implement:");
    console.log("  1. Add StoreKit framework to iOS project");
    console.log("  2. Create native purchase handler");
    console.log("  3. Get receipt from Bundle.main.appStoreReceiptURL");
    console.log("  4. Convert to base64 and call verifyReceiptWithBackend()");
    
    return false;
  } catch (error: any) {
    console.error("🍎 IAP: ❌ Purchase failed:", error);
    toast.error(`Purchase failed: ${error.message || "Unknown error"}`);
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
    toast.error("Restore purchases only works in the iOS app");
    return false;
  }

  try {
    console.log("🍎 IAP: Restoring purchases...");
    toast.loading("Restoring purchases...");
    
    // In a real implementation, this would restore from StoreKit
    toast.error("Native iOS restore not yet implemented. Please add StoreKit bridge.");
    
    console.log("🍎 IAP: To implement restore:");
    console.log("  1. Call SKPaymentQueue.default().restoreCompletedTransactions()");
    console.log("  2. Get latest receipt from Bundle.main.appStoreReceiptURL");
    console.log("  3. Convert to base64 and call verifyReceiptWithBackend()");
    
    return false;
  } catch (error: any) {
    console.error("🍎 IAP: ❌ Restore failed:", error);
    toast.error(`Failed to restore: ${error.message || "Unknown error"}`);
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
