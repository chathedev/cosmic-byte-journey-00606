// Note: Install @capacitor-community/in-app-purchases package for production use
// For now, this is a stub implementation
import { toast } from "sonner";

// Stub interface until package is installed
const InAppPurchases = {
  initialize: async () => { console.log("IAP: initialize"); },
  getProducts: async (params: any) => { console.log("IAP: getProducts", params); return { products: [] }; },
  purchase: async (params: any): Promise<any> => { 
    console.log("IAP: purchase", params); 
    throw new Error("IAP package not installed"); 
  },
  restorePurchases: async (): Promise<any> => { 
    console.log("IAP: restorePurchases"); 
    throw new Error("IAP package not installed"); 
  },
};

export const PRODUCT_IDS = {
  PLUS_MONTHLY: "tivly_plus_monthly",
  PLUS_YEARLY: "tivly_plus_yearly",
  PRO_MONTHLY: "tivly_pro_monthly",
  PRO_YEARLY: "tivly_pro_yearly",
};

export async function initializeIAP() {
  try {
    await InAppPurchases.initialize();
    console.log("IAP initialized");
  } catch (error) {
    console.error("Failed to initialize IAP:", error);
    throw error;
  }
}

export async function getProducts(productIds: string[]) {
  try {
    const { products } = await InAppPurchases.getProducts({ productIds });
    return products;
  } catch (error) {
    console.error("Failed to get products:", error);
    return [];
  }
}

export async function buyIosSubscription(productId: string): Promise<boolean> {
  try {
    toast.info("Processing Apple purchase...");
    
    const result: any = await InAppPurchases.purchase({ productId });
    
    if (result?.receipt) {
      // Send receipt to backend for verification
      await verifyReceipt(result.receipt);
      toast.success("Subscription activated!");
      return true;
    }
    
    return false;
  } catch (error: any) {
    console.error("Purchase failed:", error);
    
    if (error.code === "userCancelled") {
      toast.info("Purchase cancelled");
    } else {
      toast.error("Purchase failed. Please try again.");
    }
    
    return false;
  }
}

export async function restorePurchases(): Promise<boolean> {
  try {
    toast.info("Restoring purchases...");
    
    const result: any = await InAppPurchases.restorePurchases();
    
    if (result?.receipts && result.receipts.length > 0) {
      // Verify the most recent receipt
      await verifyReceipt(result.receipts[0]);
      toast.success("Purchases restored!");
      return true;
    } else {
      toast.info("No purchases to restore");
      return false;
    }
  } catch (error) {
    console.error("Restore failed:", error);
    toast.error("Failed to restore purchases");
    return false;
  }
}

async function verifyReceipt(receipt: string): Promise<void> {
  try {
    const response = await fetch("https://api.tivly.se/ios/verify", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ receipt }),
      credentials: "include",
    });
    
    if (!response.ok) {
      throw new Error("Receipt verification failed");
    }
    
    const data = await response.json();
    console.log("Receipt verified:", data);
  } catch (error) {
    console.error("Receipt verification failed:", error);
    throw error;
  }
}
