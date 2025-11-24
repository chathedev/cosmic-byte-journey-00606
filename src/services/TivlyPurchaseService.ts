/**
 * Tivly Purchase Service
 * Handles Apple In-App Purchases using @capgo/capacitor-purchases (RevenueCat)
 */

import { Capacitor } from '@capacitor/core';
import type { 
  CustomerInfo, 
  PurchasesPackage, 
  PurchasesOffering 
} from '@capgo/capacitor-purchases';

// Type definitions
interface PurchaseProduct {
  identifier: string;
  description: string;
  title: string;
  price: number;
  priceString: string;
  currency: string;
}

interface SubscriptionStatus {
  isActive: boolean;
  productIdentifier?: string;
  expirationDate?: string;
  willRenew?: boolean;
}

// Dynamic import of the purchases plugin
const getPurchasesPlugin = async () => {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Purchases are only available on native iOS platform');
  }
  
  try {
    const { CapacitorPurchases } = await import('@capgo/capacitor-purchases');
    return CapacitorPurchases;
  } catch (error) {
    console.error('Failed to load purchases plugin:', error);
    throw new Error('Purchases plugin not available');
  }
};

export class TivlyPurchaseService {
  private static instance: TivlyPurchaseService;
  private initialized = false;

  private constructor() {}

  static getInstance(): TivlyPurchaseService {
    if (!TivlyPurchaseService.instance) {
      TivlyPurchaseService.instance = new TivlyPurchaseService();
    }
    return TivlyPurchaseService.instance;
  }

  /**
   * Initialize the purchase service with RevenueCat API key
   */
  async initialize(apiKey?: string): Promise<void> {
    if (this.initialized) {
      console.log('TivlyPurchaseService: Already initialized');
      return;
    }

    if (!Capacitor.isNativePlatform()) {
      console.log('TivlyPurchaseService: Not on native platform, skipping initialization');
      return;
    }

    try {
      const plugin = await getPurchasesPlugin();
      // Setup with RevenueCat API key
      const key = apiKey || 'YOUR_REVENUECAT_API_KEY'; // Replace with actual key
      await plugin.setup({ apiKey: key });
      this.initialized = true;
      console.log('TivlyPurchaseService: Initialized successfully');
    } catch (error) {
      console.error('TivlyPurchaseService: Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Load available products from App Store (via RevenueCat offerings)
   */
  async loadProducts(): Promise<PurchaseProduct[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const plugin = await getPurchasesPlugin();
      const result = await plugin.getOfferings();
      
      const products: PurchaseProduct[] = [];
      
      // Extract products from offerings
      if (result.current?.availablePackages) {
        for (const pkg of result.current.availablePackages) {
          const product = pkg.product;
          if (product) {
            products.push({
              identifier: product.identifier,
              description: product.description || '',
              title: product.title || product.identifier,
              price: product.price,
              priceString: product.priceString,
              currency: product.currencyCode || 'SEK'
            });
          }
        }
      }
      
      console.log('TivlyPurchaseService: Products loaded:', products);
      return products;
    } catch (error) {
      console.error('TivlyPurchaseService: Failed to load products:', error);
      throw error;
    }
  }

  /**
   * Purchase a product using RevenueCat package
   */
  async purchaseProduct(productId: string): Promise<CustomerInfo> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const plugin = await getPurchasesPlugin();
      
      // Get offerings to find the package
      const offerings = await plugin.getOfferings();
      const currentOffering = offerings.current;
      
      if (!currentOffering) {
        throw new Error('No offerings available');
      }

      // Find package by product identifier
      const packageToPurchase = currentOffering.availablePackages?.find(
        pkg => pkg.product.identifier === productId
      );

      if (!packageToPurchase) {
        throw new Error(`Product ${productId} not found in offerings`);
      }

      // Make purchase
      const result = await plugin.purchasePackage({ 
        aPackage: packageToPurchase,
        upgradeInfo: undefined
      });
      
      console.log('TivlyPurchaseService: Purchase completed:', result);
      return result.customerInfo;
    } catch (error) {
      console.error('TivlyPurchaseService: Purchase failed:', error);
      throw error;
    }
  }

  /**
   * Restore previous purchases
   */
  async restorePurchases(): Promise<CustomerInfo> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const plugin = await getPurchasesPlugin();
      const result = await plugin.restorePurchases();
      console.log('TivlyPurchaseService: Purchases restored:', result);
      return result.customerInfo;
    } catch (error) {
      console.error('TivlyPurchaseService: Restore failed:', error);
      throw error;
    }
  }

  /**
   * Get current subscription status from customer info
   */
  async getSubscriptionStatus(): Promise<SubscriptionStatus> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const plugin = await getPurchasesPlugin();
      const result = await plugin.getCustomerInfo();
      const customerInfo = result.customerInfo;
      
      // Check for active entitlements
      const hasActiveSubscription = customerInfo.entitlements?.active 
        && Object.keys(customerInfo.entitlements.active).length > 0;
      
      let productId: string | undefined;
      let expirationDate: string | undefined;
      
      if (hasActiveSubscription && customerInfo.entitlements.active) {
        const firstEntitlement = Object.values(customerInfo.entitlements.active)[0];
        productId = firstEntitlement?.productIdentifier;
        expirationDate = firstEntitlement?.expirationDate;
      }
      
      console.log('TivlyPurchaseService: Subscription status:', {
        isActive: hasActiveSubscription,
        productId,
        expirationDate
      });
      
      return {
        isActive: hasActiveSubscription || false,
        productIdentifier: productId,
        expirationDate: expirationDate,
        willRenew: customerInfo.entitlements?.active?.[productId || '']?.willRenew
      };
    } catch (error) {
      console.error('TivlyPurchaseService: Failed to get subscription status:', error);
      return { isActive: false };
    }
  }

  /**
   * Get customer info (includes receipt data)
   */
  async getCustomerInfo(): Promise<CustomerInfo | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const plugin = await getPurchasesPlugin();
      const result = await plugin.getCustomerInfo();
      return result.customerInfo;
    } catch (error) {
      console.error('TivlyPurchaseService: Failed to get customer info:', error);
      return null;
    }
  }

  /**
   * Check if running on iOS native platform
   */
  isAvailable(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  }
}

// Export singleton instance
export const purchaseService = TivlyPurchaseService.getInstance();
