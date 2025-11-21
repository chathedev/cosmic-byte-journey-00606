# Apple In-App Purchase Setup Guide

## Overview
The Tivly app now supports platform-specific payment methods:
- **iOS App (Capacitor)**: Uses Apple In-App Purchases
- **Web Browser**: Uses Stripe checkout

## Current Status
✅ Platform detection implemented (`isIosApp()`)
✅ UI conditionally shows Apple or Stripe payment options
✅ Apple IAP integration code prepared (stub)
⚠️ Requires `@capacitor-community/in-app-purchases` package installation

## Installation Steps

### 1. Install the IAP Package
Once the package is available in your environment, install it:
```bash
npm install @capacitor-community/in-app-purchases
```

### 2. Update the IAP Implementation
Replace the stub in `src/lib/appleIAP.ts` with the real import:
```typescript
import { InAppPurchases } from "@capacitor-community/in-app-purchases";
```
Remove the stub interface at the top of that file.

### 3. Configure App Store Connect
1. Create in-app purchase products in App Store Connect:
   - `tivly_plus_monthly` - Plus Monthly Subscription
   - `tivly_plus_yearly` - Plus Yearly Subscription  
   - `tivly_pro_monthly` - Pro Monthly Subscription
   - `tivly_pro_yearly` - Pro Yearly Subscription

2. Set up the subscription groups and pricing

### 4. Backend Verification Endpoint
The app sends purchase receipts to:
```
POST https://api.tivly.se/ios/verify
Body: { receipt: "..." }
```

Ensure this endpoint:
- Validates the receipt with Apple's servers
- Grants the user the appropriate subscription plan
- Returns success/error response

### 5. Test with TestFlight
1. Build the iOS app with Capacitor
2. Upload to TestFlight
3. Test purchases with Sandbox accounts
4. Verify receipt validation works

## How It Works

### Platform Detection
```typescript
import { isIosApp } from "@/utils/iosAppDetection";

const isIos = isIosApp(); // true on iOS Capacitor, false in browser
```

### Purchase Flow (iOS)
1. User clicks "Köp med Apple" button
2. `buyIosSubscription(productId)` is called
3. Shows Apple's native payment sheet
4. On success, sends receipt to backend
5. Backend validates and unlocks subscription
6. App refreshes user plan

### Restore Purchases
Users can restore previous purchases:
1. Click "Återställ köp" button
2. `restorePurchases()` is called
3. Apple returns all receipts
4. Backend validates and restores access

## Files Modified
- ✅ `src/utils/iosAppDetection.ts` - Platform detection
- ✅ `src/lib/appleIAP.ts` - IAP implementation
- ✅ `src/components/SubscribeDialog.tsx` - Conditional UI

## Notes
- The web version continues to use Stripe (unchanged)
- All URLs remain the same (https://app.tivly.se)
- Only payment method differs based on platform
- Same backend user accounts work across platforms
