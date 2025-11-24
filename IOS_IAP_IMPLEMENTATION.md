# iOS In-App Purchase Implementation Guide

This guide explains how to complete the Apple IAP integration for the Tivly iOS app.

## Overview

The frontend (io.tivly.se) is now ready for Apple IAP with:
- ✅ Platform detection (iOS vs Web)
- ✅ UI showing Apple purchase buttons only on iOS
- ✅ Backend verification endpoint (POST https://api.tivly.se/ios/verify)
- ✅ Receipt verification function ready to use
- ⚠️ **MISSING: Native iOS StoreKit bridge**

## What You Need to Implement

### 1. Add StoreKit to Your iOS Project

In Xcode, add the StoreKit framework:

1. Open your iOS project in Xcode
2. Select your app target
3. Go to "Frameworks, Libraries, and Embedded Content"
4. Click "+" and add `StoreKit.framework`

### 2. Create IAP Manager (Swift)

Create a new Swift file `IAPManager.swift`:

```swift
import Foundation
import StoreKit
import Capacitor

@objc(IAPManagerPlugin)
public class IAPManagerPlugin: CAPPlugin {
    
    // Product ID from App Store Connect
    let proMonthlyProductId = "tivly_pro_monthly"
    
    @objc func purchaseProduct(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("Product ID required")
            return
        }
        
        // Start purchase flow
        SKPaymentQueue.default().add(self)
        
        // Fetch product from App Store
        let request = SKProductsRequest(productIdentifiers: [productId])
        request.delegate = self
        request.start()
        
        // Store the call to resolve later
        self.pendingCall = call
    }
    
    @objc func restorePurchases(_ call: CAPPluginCall) {
        SKPaymentQueue.default().add(self)
        SKPaymentQueue.default().restoreCompletedTransactions()
        self.pendingCall = call
    }
    
    private var pendingCall: CAPPluginCall?
}

// MARK: - SKProductsRequestDelegate
extension IAPManagerPlugin: SKProductsRequestDelegate {
    
    public func productsRequest(_ request: SKProductsRequest, didReceive response: SKProductsResponse) {
        guard let product = response.products.first else {
            pendingCall?.reject("Product not found")
            return
        }
        
        // Start purchase
        let payment = SKPayment(product: product)
        SKPaymentQueue.default().add(payment)
    }
}

// MARK: - SKPaymentTransactionObserver
extension IAPManagerPlugin: SKPaymentTransactionObserver {
    
    public func paymentQueue(_ queue: SKPaymentQueue, updatedTransactions transactions: [SKPaymentTransaction]) {
        for transaction in transactions {
            switch transaction.transactionState {
            case .purchased:
                handlePurchased(transaction)
            case .failed:
                handleFailed(transaction)
            case .restored:
                handleRestored(transaction)
            case .deferred, .purchasing:
                break
            @unknown default:
                break
            }
        }
    }
    
    private func handlePurchased(_ transaction: SKPaymentTransaction) {
        // Get the App Store receipt
        guard let receiptURL = Bundle.main.appStoreReceiptURL,
              let receiptData = try? Data(contentsOf: receiptURL) else {
            pendingCall?.reject("No receipt found")
            SKPaymentQueue.default().finishTransaction(transaction)
            return
        }
        
        let receiptBase64 = receiptData.base64EncodedString()
        
        // Return receipt to JavaScript
        pendingCall?.resolve([
            "success": true,
            "receipt": receiptBase64,
            "productId": transaction.payment.productIdentifier
        ])
        
        // Finish transaction
        SKPaymentQueue.default().finishTransaction(transaction)
        pendingCall = nil
    }
    
    private func handleFailed(_ transaction: SKPaymentTransaction) {
        let errorMessage = transaction.error?.localizedDescription ?? "Purchase failed"
        pendingCall?.reject(errorMessage)
        SKPaymentQueue.default().finishTransaction(transaction)
        pendingCall = nil
    }
    
    private func handleRestored(_ transaction: SKPaymentTransaction) {
        handlePurchased(transaction)
    }
}
```

### 3. Register the Plugin

In your `AppDelegate.swift` or Capacitor config:

```swift
import Capacitor

// Register the plugin
self.bridge?.registerPluginInstance(IAPManagerPlugin())
```

### 4. Update JavaScript Integration

Update `src/lib/appleIAP.ts` to call the native bridge:

```typescript
// Replace purchaseAppleSubscription with:
export async function purchaseAppleSubscription(productId: string): Promise<boolean> {
  if (!isNativeIOS()) {
    toast.error("Apple purchases only work in the iOS app");
    return false;
  }

  try {
    console.log("🍎 IAP: Starting purchase for:", productId);
    toast.loading("Opening Apple payment...");
    
    // Call native iOS plugin
    const result = await Capacitor.Plugins.IAPManager.purchaseProduct({
      productId: productId
    });
    
    console.log("🍎 IAP: Native purchase result:", result);
    
    if (result.success && result.receipt) {
      console.log("🍎 IAP: ✅ Receipt received, verifying with backend...");
      toast.loading("Verifying purchase...");
      
      const verified = await verifyReceiptWithBackend(result.receipt);
      
      if (verified) {
        console.log("🍎 IAP: ✅ Purchase verified!");
        toast.success("Subscription activated! 🎉");
        return true;
      }
    }
    
    toast.error("Purchase verification failed");
    return false;
  } catch (error: any) {
    console.error("🍎 IAP: ❌ Purchase failed:", error);
    
    if (error.code === "E_USER_CANCELLED") {
      toast.info("Purchase cancelled");
    } else {
      toast.error(`Purchase failed: ${error.message}`);
    }
    
    return false;
  }
}
```

### 5. App Store Connect Configuration

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Select your app
3. Go to "In-App Purchases"
4. Create a new subscription:
   - **Product ID**: `tivly_pro_monthly`
   - **Name**: Tivly Pro Monthly
   - **Price**: 99 SEK (or equivalent in other regions)
   - **Subscription Duration**: 1 month
   - **Subscription Group**: Create "Tivly Subscriptions" if needed

### 6. Testing

#### Sandbox Testing (Before App Store Submission)

1. Create a sandbox tester account in App Store Connect
2. Sign out of your Apple ID on your test device
3. Build and run the app in Xcode
4. When prompted, sign in with your sandbox tester account
5. Test purchase flow - **sandbox purchases are free**

#### Production Testing

1. Submit app to TestFlight
2. Add internal/external testers
3. Test with real purchases (you'll be charged, but Apple provides test refunds)

### 7. Backend Verification Flow

After successful purchase:

1. **iOS App**: Gets receipt from `Bundle.main.appStoreReceiptURL`
2. **iOS App**: Converts to base64 and sends to JavaScript
3. **JavaScript**: Calls `verifyReceiptWithBackend(receipt)`
4. **Backend**: POST https://api.tivly.se/ios/verify with:
   ```json
   {
     "receipt": "<base64_receipt_string>"
   }
   ```
5. **Backend**: Validates with Apple's servers
6. **Backend**: Updates user subscription to `plan: "pro"`
7. **Backend**: Returns success:
   ```json
   {
     "success": true,
     "subscription": {
       "plan": "pro",
       "expiresAt": "2024-12-01T00:00:00Z"
     }
   }
   ```
8. **JavaScript**: Refreshes user state
9. **UI**: Shows PRO features unlocked

## Platform Behavior

### iOS App (io.tivly.se)
- ✅ Shows Apple purchase button
- ✅ Hides Stripe payment options
- ✅ Uses native StoreKit for payments
- ✅ Sends receipts to backend for verification

### Web Browser (app.tivly.se)
- ✅ Hides Apple purchase button
- ✅ Shows Stripe payment options
- ✅ Uses standard web checkout flow

## Troubleshooting

### "Native bridge not implemented"
- You need to add the Swift code above to your iOS project
- Register the plugin in AppDelegate
- Rebuild the app in Xcode

### "Product not found"
- Verify product ID matches App Store Connect exactly
- Check that product is approved and available
- Use correct region/locale for testing

### "Receipt verification failed"
- Check backend logs for Apple API errors
- Ensure receipt is properly base64 encoded
- Verify backend has correct Apple shared secret

### Sandbox vs Production
- Backend automatically detects sandbox vs production receipts
- Use sandbox Apple ID for testing
- Switch to real Apple ID for production

## Security Notes

- ✅ Receipts are verified server-side (never trust client)
- ✅ JWT authentication required for /ios/verify endpoint
- ✅ Receipt validation happens against Apple's servers
- ✅ Subscriptions are tied to user accounts, not devices

## Next Steps

1. Implement the Swift code above
2. Test with sandbox Apple ID
3. Submit to TestFlight for beta testing
4. Monitor backend logs during testing
5. Submit to App Store for review

## Support

- Apple IAP docs: https://developer.apple.com/in-app-purchase/
- StoreKit docs: https://developer.apple.com/documentation/storekit
- Backend API: Contact backend team for /ios/verify issues
