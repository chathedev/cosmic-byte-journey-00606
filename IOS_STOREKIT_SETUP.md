# Native Apple StoreKit Setup for iOS App

## Overview
This app now uses **Native Apple StoreKit** instead of RevenueCat. All payment processing happens directly through Apple's App Store using StoreKit 2 APIs.

## ✅ What's Configured

### 1. Native iOS Plugin
**StoreKitManager.swift** - Capacitor plugin for StoreKit
- Uses StoreKit 2 (async/await)
- Handles product fetching, purchases, and transaction verification
- Automatic transaction observation
- Methods: `getProducts()`, `purchase()`, `restorePurchases()`, `getActiveSubscriptions()`

**StoreKitManager.m** - Objective-C bridge
- Registers the StoreKit plugin with Capacitor
- Enables JavaScript ↔ Swift communication

### 2. TypeScript Integration
**src/lib/nativeStoreKit.ts** - Frontend StoreKit wrapper
- Platform detection (iOS vs web)
- Type-safe API wrapper
- Product ID constants
- Error handling

**src/components/SubscribeDialog.tsx** - iOS-aware subscription UI
- Detects iOS platform automatically
- Routes to Native StoreKit for iOS users
- Routes to Stripe for web users
- Restore purchases button for iOS

## 🚀 Next Steps in Xcode

### Step 1: Open Project in Xcode
```bash
cd your-project
npm install
npx cap sync ios
npx cap open ios
```

### Step 2: Verify Files in Xcode
Ensure these files are in your Xcode project:
- ✅ `StoreKitManager.swift`
- ✅ `StoreKitManager.m`
- ✅ `AppDelegate.swift`

If they're not visible in the Project Navigator, add them:
1. Right-click "App" folder → Add Files to "App"
2. Select the Swift files
3. Check "Copy items if needed"
4. Ensure "App" target is selected

### Step 3: Enable In-App Purchase Capability
1. Select the "App" target in Xcode
2. Go to "Signing & Capabilities" tab
3. Click "+ Capability"
4. Add "In-App Purchase"

### Step 4: Configure App Store Connect

#### Create Subscription Group
1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Select your app
3. Go to "Subscriptions" section
4. Create a new subscription group (e.g., "Tivly Pro")

#### Create Subscription Product
1. Within the subscription group, click "+"
2. Enter Product ID: `se.tivly.pro.monthly`
3. Set subscription duration: 1 month
4. Configure pricing:
   - Price: 99 SEK
   - Add other countries as needed
5. Add localization:
   - Display name: "Tivly Pro"
   - Description: "Obegränsade möten, AI-protokoll, och mer"

### Step 5: Create StoreKit Configuration File (for testing)
1. In Xcode: File → New → File
2. Select "StoreKit Configuration File"
3. Name it `Tivly.storekit`
4. Add Product:
   - Type: Auto-Renewable Subscription
   - Reference Name: Tivly Pro Monthly
   - Product ID: `se.tivly.pro.monthly`
   - Price: 99 SEK
   - Duration: 1 Month
   - Subscription Group: Tivly Pro

### Step 6: Configure Scheme for Testing
1. Product → Scheme → Edit Scheme
2. Go to "Run" → "Options"
3. Under "StoreKit Configuration", select `Tivly.storekit`

### Step 7: Build & Test
1. Select a simulator or device
2. Press ⌘+R to build and run
3. Test purchase flow:
   - Click "Välj Pro" in the app
   - Complete sandbox purchase
   - Verify subscription activation

## 🔧 Product Configuration

**Product ID:** `se.tivly.pro.monthly`  
**Price:** 99 SEK per month  
**Features:**
- 10 meetings per month
- Unlimited protocols
- 30-day meeting history
- AI-generated meeting summaries
- Action items tracking

## 🧪 Testing

### Simulator Testing (Recommended for Development)
1. Use the StoreKit Configuration File (`Tivly.storekit`)
2. No real credit card required
3. Instant purchases
4. Can clear purchase history easily

### Device Testing (Production-like)
1. Create a Sandbox Test Account in App Store Connect
2. Sign out of your personal Apple ID on the device
3. When making a purchase, enter sandbox credentials
4. Test real purchase flow

## 🐛 Troubleshooting

### "Product not found"
- Verify Product ID matches: `se.tivly.pro.monthly`
- Ensure subscription is approved in App Store Connect
- Check StoreKit Configuration File has the product

### "Purchase failed"
- Check Xcode console for detailed error logs
- Verify In-App Purchase capability is enabled
- Ensure you're signed into a sandbox account (device testing)

### "StoreKitManager plugin not found"
- Run `npx cap sync ios` to sync native files
- Verify StoreKitManager.swift and .m are in Xcode project
- Clean build folder (⌘+Shift+K) and rebuild

### Purchases not persisting
- StoreKit automatically handles transaction persistence
- Check `Transaction.currentEntitlements` is being queried
- Verify backend is receiving purchase notifications (if applicable)

## 📱 Purchase Flow

1. User clicks "Välj Pro" in SubscribeDialog
2. Platform detection identifies iOS app (io.tivly.se)
3. Frontend calls `purchaseProduct()` from nativeStoreKit.ts
4. Native StoreKit plugin shows Apple's payment sheet
5. User authorizes payment with Face ID/Touch ID
6. StoreKit verifies and completes transaction
7. App checks active subscriptions via `getActiveSubscriptions()`
8. Frontend updates UI and grants Pro access

## 🔐 Security

- All transactions are verified by StoreKit
- Receipt validation happens on Apple's servers
- No sensitive payment data passes through your app
- StoreKit 2 uses modern async/await patterns

## 📋 Status: READY FOR XCODE SETUP

All code is implemented and configured. Just need to:
1. Open in Xcode
2. Add In-App Purchase capability
3. Configure App Store Connect subscription product
4. Create StoreKit Configuration File for testing
5. Build and test!

---

**Note:** This replaces the previous RevenueCat integration. RevenueCat SDK is no longer needed or used.
