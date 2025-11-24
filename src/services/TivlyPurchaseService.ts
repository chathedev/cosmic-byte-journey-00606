/**
 * Tivly Purchase Service
 * Handles Apple In-App Purchases using @capgo/capacitor-purchases
 */

import { Capacitor } from '@capacitor/core';

// Type definitions for purchase plugin
interface PurchaseProduct {
  identifier: string;
  description: string;
  title: string;
  price: number;
  priceString: string;
  currency: string;
}

interface PurchaseResult {
  productIdentifier: string;
  transactionIdentifier: string;
  transactionDate: string;
  receipt?: string;
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
   * Initialize the purchase service
   */
  async initialize(): Promise<void> {
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
      await plugin.setup();
      this.initialized = true;
      console.log('TivlyPurchaseService: Initialized successfully');
    } catch (error) {
      console.error('TivlyPurchaseService: Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Load available products from App Store
   */
  async loadProducts(productIds: string[]): Promise<PurchaseProduct[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const plugin = await getPurchasesPlugin();
      const result = await plugin.getProducts({ productIdentifiers: productIds });
      console.log('TivlyPurchaseService: Products loaded:', result.products);
      return result.products || [];
    } catch (error) {
      console.error('TivlyPurchaseService: Failed to load products:', error);
      throw error;
    }
  }

  /**
   * Purchase a product
   */
  async purchaseProduct(productId: string): Promise<PurchaseResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const plugin = await getPurchasesPlugin();
      const result = await plugin.purchaseProduct({ identifier: productId });
      console.log('TivlyPurchaseService: Purchase completed:', result);
      return result;
    } catch (error) {
      console.error('TivlyPurchaseService: Purchase failed:', error);
      throw error;
    }
  }

  /**
   * Restore previous purchases
   */
  async restorePurchases(): Promise<PurchaseResult[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const plugin = await getPurchasesPlugin();
      const result = await plugin.restorePurchases();
      console.log('TivlyPurchaseService: Purchases restored:', result);
      return result.purchases || [];
    } catch (error) {
      console.error('TivlyPurchaseService: Restore failed:', error);
      throw error;
    }
  }

  /**
   * Get current subscription status
   */
  async getSubscriptionStatus(): Promise<SubscriptionStatus> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const plugin = await getPurchasesPlugin();
      const result = await plugin.getSubscriptionStatus();
      console.log('TivlyPurchaseService: Subscription status:', result);
      
      return {
        isActive: result.isActive || false,
        productIdentifier: result.productIdentifier,
        expirationDate: result.expirationDate,
        willRenew: result.willRenew
      };
    } catch (error) {
      console.error('TivlyPurchaseService: Failed to get subscription status:', error);
      return { isActive: false };
    }
  }

  /**
   * Get App Store receipt (for backend verification)
   */
  async getReceipt(): Promise<string | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const plugin = await getPurchasesPlugin();
      const result = await plugin.getReceipt();
      return result.receipt || null;
    } catch (error) {
      console.error('TivlyPurchaseService: Failed to get receipt:', error);
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
