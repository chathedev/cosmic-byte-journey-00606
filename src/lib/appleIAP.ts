import { toast } from "sonner";
import { isIosApp } from "@/utils/iosAppDetection";

/**
 * Apple In-App Purchase Integration
 * 
 * MANUAL INSTALLATION REQUIRED:
 * Run: npm install @capacitor-community/in-app-purchases
 * 
 * Then uncomment the import below and remove the stub.
 */

// TODO: Uncomment when package is installed
// import { InAppPurchases } from "@capacitor-community/in-app-purchases";

// Stub implementation - replace with real import above
const InAppPurchases = {
  initialize: async () => {
    console.warn("IAP: Using stub - install @capacitor-community/in-app-purchases");
    if (!isIosApp()) return;
    throw new Error("IAP package not installed. Run: npm install @capacitor-community/in-app-purchases");
  },
  getProducts: async (params: any) => {
    console.warn("IAP: Using stub - install @capacitor-community/in-app-purchases");
    if (!isIosApp()) return { products: [] };
    throw new Error("IAP package not installed");
  },
  purchase: async (params: any): Promise<any> => {
    console.warn("IAP: Attempting purchase with stub");
    if (!isIosApp()) {
      throw new Error("IAP only works in iOS app");
    }
    throw new Error("IAP package not installed. Install @capacitor-community/in-app-purchases and rebuild the app.");
  },
  restorePurchases: async (): Promise<any> => {
    console.warn("IAP: Attempting restore with stub");
    if (!isIosApp()) {
      throw new Error("IAP only works in iOS app");
    }
    throw new Error("IAP package not installed. Install @capacitor-community/in-app-purchases and rebuild the app.");
  },
};

export const PRODUCT_IDS = {
  PLUS_MONTHLY: "tivly_plus_monthly",
  PLUS_YEARLY: "tivly_plus_yearly",
  PRO_MONTHLY: "tivly_pro_monthly",
  PRO_YEARLY: "tivly_pro_yearly",
};

/**
 * Initialize the IAP plugin
 * Call this once when the app starts (iOS only)
 */
export async function initializeIAP() {
  if (!isIosApp()) {
    console.log("IAP: Skipping initialization (not iOS app)");
    return;
  }

  try {
    await InAppPurchases.initialize();
    console.log("IAP: Initialized successfully");
  } catch (error) {
    console.error("IAP: Failed to initialize:", error);
    throw error;
  }
}

/**
 * Fetch product information from App Store
 */
export async function getProducts(productIds: string[]) {
  if (!isIosApp()) {
    console.log("IAP: getProducts skipped (not iOS)");
    return [];
  }

  try {
    const { products } = await InAppPurchases.getProducts({ productIds });
    console.log("IAP: Products fetched:", products);
    return products;
  } catch (error) {
    console.error("IAP: Failed to get products:", error);
    return [];
  }
}

/**
 * Purchase a subscription via Apple IAP
 * Returns true if successful, false otherwise
 */
export async function buyIosSubscription(productId: string): Promise<boolean> {
  if (!isIosApp()) {
    toast.error("Apple purchases only work in the iOS app");
    return false;
  }

  try {
    toast.info("Opening Apple payment sheet...");
    
    const result: any = await InAppPurchases.purchase({ productId });
    console.log("IAP: Purchase result:", result);
    
    if (result?.receipt) {
      toast.loading("Verifying purchase...");
      await verifyReceipt(result.receipt);
      toast.success("Subscription activated!");
      return true;
    }
    
    toast.error("No receipt received from Apple");
    return false;
  } catch (error: any) {
    console.error("IAP: Purchase failed:", error);
    
    // Handle common error codes
    if (error.code === "userCancelled" || error.message?.includes("cancelled")) {
      toast.info("Purchase cancelled");
    } else if (error.message?.includes("not installed")) {
      toast.error("App Store unavailable. Please rebuild the app with IAP support.");
    } else {
      toast.error(`Purchase failed: ${error.message || "Unknown error"}`);
    }
    
    return false;
  }
}

/**
 * Restore previous purchases
 * Returns true if purchases were restored, false otherwise
 */
export async function restorePurchases(): Promise<boolean> {
  if (!isIosApp()) {
    toast.error("Restore purchases only works in the iOS app");
    return false;
  }

  try {
    toast.info("Restoring purchases...");
    
    const result: any = await InAppPurchases.restorePurchases();
    console.log("IAP: Restore result:", result);
    
    if (result?.receipts && result.receipts.length > 0) {
      toast.loading("Verifying receipts...");
      
      // Verify the most recent receipt
      await verifyReceipt(result.receipts[0]);
      
      toast.success(`${result.receipts.length} purchase(s) restored!`);
      return true;
    } else {
      toast.info("No previous purchases found");
      return false;
    }
  } catch (error: any) {
    console.error("IAP: Restore failed:", error);
    
    if (error.message?.includes("not installed")) {
      toast.error("App Store unavailable. Please rebuild the app with IAP support.");
    } else {
      toast.error(`Failed to restore: ${error.message || "Unknown error"}`);
    }
    
    return false;
  }
}

/**
 * Send receipt to backend for verification with Apple servers
 */
async function verifyReceipt(receipt: string): Promise<void> {
  try {
    console.log("IAP: Verifying receipt with backend...");
    
    const response = await fetch("https://api.tivly.se/ios/verify", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ receipt }),
      credentials: "include",
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Verification failed: ${response.status}`);
    }
    
    const data = await response.json();
    console.log("IAP: Receipt verified successfully:", data);
  } catch (error: any) {
    console.error("IAP: Receipt verification failed:", error);
    throw new Error(`Verification failed: ${error.message}`);
  }
}
