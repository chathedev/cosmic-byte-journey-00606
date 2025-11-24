# RevenueCat iOS Integration - CONFIGURED ✅

## Production API Key
**API Key:** `appl_FKrIkzvUZsEugFXZaYznvBWjEvK`

This production key has been configured in:
- `ios/App/App/RevenueCatManager.swift` (line 13)

## What's Been Implemented

### 1. Native iOS Integration
✅ **RevenueCatManager.swift** - Capacitor plugin bridge
- Configured with production API key
- Provides: getOfferings, purchasePackage, restorePurchases, getCustomerInfo, showPaywall, showCustomerCenter

✅ **PaywallViewController.swift** - Native SwiftUI paywall
- Fully localized Swedish UI
- Product display with pricing
- Purchase & restore functionality

✅ **CustomerCenterViewController.swift** - Subscription management
- Subscription status display
- Restore purchases button
- Link to Apple subscription settings

✅ **AppDelegate.swift** - Auto-initialization
- RevenueCat configured on app launch
- Debug logging enabled

### 2. TypeScript Integration
✅ **src/lib/appleIAP.ts** - Enhanced iOS purchase flow
- Platform detection (iOS vs web)
- Shows native paywall via `RevenueCatManager.showPaywall()`
- Checks subscription status via `RevenueCatManager.getCustomerInfo()`
- Smooth user feedback with toast notifications
- Auto page reload after successful purchase

✅ **src/components/SubscribeDialog.tsx** - iOS-aware subscription UI
- Detects iOS platform automatically
- Routes to Apple IAP for iOS users
- Routes to Stripe for web users
- Restore purchases button for iOS

✅ **src/contexts/SubscriptionContext.tsx** - RevenueCat status sync
- Checks RevenueCat subscription status on app launch (iOS only)
- Grants Pro plan access if RevenueCat reports active subscription
- Falls back to backend plan check for web users

## Purchase Flow (iOS)

1. User clicks "Välj Pro" in SubscribeDialog
2. Platform detection identifies iOS app
3. Calls `buyIosSubscription()` in appleIAP.ts
4. Shows native SwiftUI paywall via `RevenueCatManager.showPaywall()`
5. User completes purchase in native UI
6. System checks `RevenueCatManager.getCustomerInfo()` for Pro status
7. If Pro: Shows success toast + reloads page
8. SubscriptionContext detects Pro status on reload
9. User gains full Pro access

## Next Steps in Xcode

1. **Install RevenueCat SDK**
   - Open Xcode project: `ios/App/App.xcodeproj`
   - File → Add Package Dependencies
   - Paste: `https://github.com/RevenueCat/purchases-ios-spm.git`
   - Select latest version
   - Add to App target

2. **Verify Configuration**
   - Ensure all Swift files are in Xcode project:
     - RevenueCatManager.swift
     - RevenueCatManager.m
     - PaywallViewController.swift
     - CustomerCenterViewController.swift
   - Check AppDelegate.swift imports RevenueCat

3. **RevenueCat Dashboard Setup**
   - Add iOS app with bundle ID: `se.tivly.app`
   - Upload App Store Connect API key
   - Create product: `monthly`
   - Create offering: `default` with `monthly` package
   - Create entitlement: `Tivly Pro` linked to `monthly` product

4. **App Store Connect**
   - Create subscription group
   - Add subscription product ID: `monthly`
   - Set price: 99 SEK
   - Configure localization

5. **Testing**
   - Simulator: Use `Tivly.storekit` configuration
   - Device: Create sandbox test account in App Store Connect

## Product Configuration

**Product ID:** `monthly`
**Price:** 99 SEK per month
**Entitlement:** Tivly Pro
**Features:** 10 meetings/month, unlimited protocols, 30-day history

## Troubleshooting

If purchases don't work:
1. Check RevenueCat SDK is installed in Xcode
2. Verify production API key in RevenueCatManager.swift
3. Ensure product `monthly` exists in RevenueCat dashboard
4. Confirm offering `default` contains `monthly` package
5. Check entitlement `Tivly Pro` is linked to product
6. Review Xcode console logs for RevenueCat debug output

## Testing Commands

```bash
# Sync native code
npm run sync

# Open iOS project
npm run open

# Build for device
npm run build
npx cap sync ios
npx cap run ios
```

## Status: READY FOR XCODE SETUP 🚀
All code is configured with production keys. Just need to install RevenueCat SDK via Swift Package Manager and configure RevenueCat Dashboard + App Store Connect.
