# Tivly iOS App - Apple In-App Purchases Setup ✅

## 🎯 Implementation Complete

All necessary files for Apple In-App Purchases have been created and configured.

### ✅ Native iOS Files

#### **App.entitlements**
- **Location**: `ios/App/App/App.entitlements`
- **Purpose**: Enables In-App Purchase and Payment Processing capabilities
- **Contains**:
  - Merchant ID: `merchant.se.tivly.app`
  - App Groups: `group.se.tivly.app`
  - Associated Domains for deep linking

#### **Tivly.storekit**
- **Location**: `ios/App/App/Tivly.storekit`
- **Purpose**: Local StoreKit testing configuration
- **Product**:
  - ID: `tivly_pro_monthly`
  - Type: Auto-renewable subscription
  - Duration: 1 month (P1M)
  - Price: 99.00 SEK
  - Localized in English and Swedish

#### **TivlyStoreKitManager.swift**
- **Location**: `ios/App/App/TivlyStoreKitManager.swift`
- **Purpose**: Native receipt management
- **Features**:
  - `getReceiptData()`: Get App Store receipt as base64
  - `hasReceipt()`: Check if receipt exists
  - `refreshReceipt()`: Refresh receipt from App Store
  - `isReceiptValid()`: Validate receipt format

#### **CapacitorPlugins.swift**
- **Location**: `ios/App/App/CapacitorPlugins.swift`
- **Purpose**: Custom plugin registration
- **Function**: Registers purchases plugin and initializes StoreKit manager

#### **AppDelegate.swift** (Updated)
- **Changes**:
  - Imports `StoreKit` framework
  - Registers `CapacitorPlugins` on app launch
  - Initializes `TivlyStoreKitManager`

#### **Info.plist** (Updated)
- **New Keys**:
  - `SKStoreKitConfigurationName`: "Tivly"
  - `SKReceiptRefreshRequest`: true
  - `NSUserTrackingUsageDescription`: Privacy description

### ✅ TypeScript Service

#### **TivlyPurchaseService.ts**
- **Location**: `src/services/TivlyPurchaseService.ts`
- **Purpose**: TypeScript interface for purchase operations
- **Features**:
  - `initialize()`: Set up purchase system
  - `loadProducts()`: Fetch available products
  - `purchaseProduct()`: Execute purchase flow
  - `restorePurchases()`: Restore previous purchases
  - `getSubscriptionStatus()`: Check subscription state
  - `getReceipt()`: Retrieve App Store receipt
  - `isAvailable()`: Check platform availability

### ✅ Configuration Files

#### **capacitor.config.json** (Updated)
- **Plugin Config**:
  ```json
  "CapacitorPurchases": {
    "usesStoreKit2IfAvailable": true,
    "enablePendingPurchases": true
  }
  ```

## 🚀 Next Steps

### 1. Install Dependencies
```bash
# Already installed: @capgo/capacitor-purchases
npm install
npx cap sync ios
```

### 2. Open in Xcode
```bash
npx cap open ios
```

### 3. Xcode Configuration
1. **Add Entitlements File**:
   - In Xcode, add `App.entitlements` to the project
   - Ensure it's included in the target

2. **Add StoreKit Configuration**:
   - Add `Tivly.storekit` to the project
   - Set as the active StoreKit configuration file

3. **Signing & Capabilities**:
   - Enable "In-App Purchase" capability
   - Enable "App Groups" with ID: `group.se.tivly.app`
   - Configure merchant ID: `merchant.se.tivly.app`

### 4. App Store Connect Setup
1. **Create Subscription Group**:
   - Name: "Tivly Pro"
   - Add subscription product

2. **Configure Product**:
   - Product ID: `tivly_pro_monthly`
   - Type: Auto-renewable subscription
   - Duration: 1 month
   - Price: 99 SEK
   - Localization: English and Swedish

### 5. Integration with SubscribeDialog
Update `src/components/SubscribeDialog.tsx` to use the new service:

```typescript
import { purchaseService } from '@/services/TivlyPurchaseService';
import { isIosApp } from '@/utils/iosAppDetection';

// In handleIosPurchase function:
const handleIosPurchase = async (productId: string) => {
  if (!purchaseService.isAvailable()) {
    toast.error("In-App Purchases not available");
    return;
  }

  try {
    setIsLoading(true);
    
    // Purchase the product
    const result = await purchaseService.purchaseProduct(productId);
    
    // Get receipt for backend verification
    const receipt = await purchaseService.getReceipt();
    
    if (receipt) {
      // Send to backend for verification
      const response = await fetch('https://api.tivly.se/ios/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.jwt}`
        },
        body: JSON.stringify({ receipt })
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success("Subscription activated!");
        onOpenChange(false);
        // Refresh user subscription status
      } else {
        throw new Error(data.message || "Verification failed");
      }
    }
  } catch (error) {
    console.error('Purchase failed:', error);
    toast.error("Purchase failed. Please try again.");
  } finally {
    setIsLoading(false);
  }
};
```

### 6. Backend Verification Endpoint
Ensure `https://api.tivly.se/ios/verify` endpoint:
- Accepts POST requests with receipt data
- Validates receipt with Apple servers
- Updates user subscription in database
- Returns success/failure response

### 7. Testing

#### **Local Testing (Simulator)**
1. Build and run in Xcode simulator
2. StoreKit configuration will be used automatically
3. Test purchase flow with mock data

#### **Device Testing (TestFlight)**
1. Archive the app in Xcode
2. Upload to App Store Connect
3. Create TestFlight build
4. Test with sandbox accounts on physical device

#### **Production**
1. Complete App Store Connect configuration
2. Submit app for review
3. Include purchase flow screenshots
4. Wait for approval

## 📋 Usage Example

```typescript
import { purchaseService } from '@/services/TivlyPurchaseService';

// Initialize on app start
await purchaseService.initialize();

// Load products
const products = await purchaseService.loadProducts(['tivly_pro_monthly']);

// Purchase
const result = await purchaseService.purchaseProduct('tivly_pro_monthly');

// Check subscription
const status = await purchaseService.getSubscriptionStatus();
console.log('Subscription active:', status.isActive);

// Restore purchases
const restored = await purchaseService.restorePurchases();
```

## ⚠️ Important Notes

1. **Platform Detection**: Use `isIosApp()` to show Apple payment buttons only on iOS
2. **Receipt Verification**: Always verify receipts server-side for security
3. **Error Handling**: Implement proper error handling and user feedback
4. **Testing**: Test thoroughly with sandbox accounts before production
5. **App Store Review**: Prepare screenshots showing purchase flow

## 🔧 Troubleshooting

### "Plugin not found"
- Run `npm install` and `npx cap sync ios`
- Ensure `@capgo/capacitor-purchases` is in package.json

### "Receipt not found"
- Receipt only exists after first purchase
- Use `refreshReceipt()` to request new receipt
- Test with sandbox account

### "Purchase fails in simulator"
- Use StoreKit configuration file for testing
- Some features require physical device

### "Backend verification fails"
- Check receipt is sent in correct format (base64)
- Verify backend endpoint is accessible
- Test with Apple's sandbox verification first

## 🎉 Status

**✅ Native iOS Implementation: Complete**
- All Swift files created
- StoreKit configuration ready
- Receipt management implemented

**✅ TypeScript Service: Complete**
- Purchase service created
- Type-safe interfaces
- Error handling included

**✅ Configuration: Complete**
- Capacitor config updated
- Info.plist configured
- Entitlements ready

**🔄 Next: Xcode Setup & Testing**
- Add files to Xcode project
- Configure capabilities
- Test with StoreKit config

Your iOS app is now fully prepared for Apple In-App Purchases! 🚀
