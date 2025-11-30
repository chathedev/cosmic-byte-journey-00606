/**
 * Native Apple StoreKit integration via Capacitor
 * Works ONLY on io.tivly.se (iOS app domain)
 */

import { registerPlugin } from '@capacitor/core';

interface StoreKitPlugin {
  getProducts(): Promise<{ products: Array<{
    id: string;
    displayName: string;
    description: string;
    price: number;
    displayPrice: string;
    type: string;
  }> }>;
  
  purchase(options: { productId: string }): Promise<{
    success: boolean;
    cancelled?: boolean;
    pending?: boolean;
    productId?: string;
    transactionId?: string;
  }>;
  
  restorePurchases(): Promise<{
    success: boolean;
    activeSubscriptions: string[];
  }>;
  
  getActiveSubscriptions(): Promise<{
    activeSubscriptions: string[];
    hasPro: boolean;
  }>;
}

const StoreKit = registerPlugin<StoreKitPlugin>('StoreKitManager');

// Product ID for Tivly Pro monthly subscription
export const TIVLY_PRO_PRODUCT_ID = 'se.tivly.pro.monthly';

/**
 * Check if running on iOS native app
 */
export const isIOSNativeApp = (): boolean => {
  return typeof window !== 'undefined' && window.location.hostname === 'io.tivly.se';
};

/**
 * Get available products from App Store
 */
export const getProducts = async () => {
  if (!isIOSNativeApp()) {
    throw new Error('StoreKit only available on iOS app');
  }
  
  try {
    console.log('[StoreKit] Fetching products...');
    const result = await StoreKit.getProducts();
    console.log('[StoreKit] Products:', result.products);
    return result.products;
  } catch (error) {
    console.error('[StoreKit] Failed to get products:', error);
    throw error;
  }
};

/**
 * Purchase a product
 */
export const purchaseProduct = async (productId: string = TIVLY_PRO_PRODUCT_ID) => {
  if (!isIOSNativeApp()) {
    throw new Error('StoreKit only available on iOS app');
  }
  
  try {
    console.log('[StoreKit] Purchasing:', productId);
    const result = await StoreKit.purchase({ productId });
    console.log('[StoreKit] Purchase result:', result);
    return result;
  } catch (error) {
    console.error('[StoreKit] Purchase failed:', error);
    throw error;
  }
};

/**
 * Restore previous purchases
 */
export const restorePurchases = async () => {
  if (!isIOSNativeApp()) {
    throw new Error('StoreKit only available on iOS app');
  }
  
  try {
    console.log('[StoreKit] Restoring purchases...');
    const result = await StoreKit.restorePurchases();
    console.log('[StoreKit] Restore result:', result);
    return result;
  } catch (error) {
    console.error('[StoreKit] Restore failed:', error);
    throw error;
  }
};

/**
 * Get active subscriptions
 */
export const getActiveSubscriptions = async () => {
  if (!isIOSNativeApp()) {
    throw new Error('StoreKit only available on iOS app');
  }
  
  try {
    console.log('[StoreKit] Checking subscriptions...');
    const result = await StoreKit.getActiveSubscriptions();
    console.log('[StoreKit] Active subscriptions:', result);
    return result;
  } catch (error) {
    console.error('[StoreKit] Failed to check subscriptions:', error);
    throw error;
  }
};
