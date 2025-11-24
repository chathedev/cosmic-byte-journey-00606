# RevenueCat SDK Setup Instructions for Tivly iOS App

## 📦 Step 1: Install RevenueCat via Swift Package Manager

1. Open your project in Xcode:
   ```bash
   npx cap open ios
   ```

2. In Xcode, go to **File → Add Package Dependencies**

3. Enter the RevenueCat SPM URL:
   ```
   https://github.com/RevenueCat/purchases-ios-spm.git
   ```

4. Select version: **Latest** or **5.0.0+**

5. Click **Add Package**

6. Select the **RevenueCat** library target

7. Click **Add Package** to finish

## 🔧 Step 2: Update AppDelegate.swift

Replace your `AppDelegate.swift` with:

```swift
import UIKit
import Capacitor
import RevenueCat

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        
        // Configure RevenueCat FIRST
        RevenueCatManager.configure()
        
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}
```

## 📁 Step 3: Add Swift Files to Xcode

Add these files to your Xcode project (already created in `ios/App/App/`):

1. **RevenueCatManager.swift** - Main plugin for Capacitor bridge
2. **RevenueCatManager.m** - Objective-C bridge file
3. **PaywallViewController.swift** - SwiftUI paywall screen
4. **CustomerCenterViewController.swift** - Customer management screen

To add them in Xcode:
1. Right-click on the `App` folder in Xcode
2. Select **Add Files to "App"...**
3. Navigate to `ios/App/App/`
4. Select all the new `.swift` and `.m` files
5. Make sure **"Copy items if needed"** is checked
6. Click **Add**

## 🔑 Step 4: Configure RevenueCat Dashboard

1. Go to [RevenueCat Dashboard](https://app.revenuecat.com)

2. Create a new project or select existing

3. Add iOS app:
   - **Bundle ID**: `se.tivly.app`
   - **App Name**: Tivly

4. Navigate to **App Settings → iOS**

5. Upload your App Store Connect API Key (or use Shared Secret)

## 🛍️ Step 5: Configure Products

1. In RevenueCat Dashboard, go to **Products**

2. Create a new product:
   - **Product ID**: `monthly` (must match App Store Connect)
   - **Type**: Subscription
   - **Duration**: 1 month

3. Create an Offering:
   - **Offering ID**: `default`
   - **Add Package**: Select your `monthly` product
   - **Package Type**: Monthly

4. Make the offering **Current**

## 📱 Step 6: App Store Connect Configuration

1. Go to [App Store Connect](https://appstoreconnect.apple.com)

2. Select your app (Tivly)

3. Navigate to **Features → In-App Purchases**

4. Create a new subscription:
   - **Reference Name**: Tivly Pro Monthly
   - **Product ID**: `monthly` (must match RevenueCat)
   - **Subscription Group**: Create "Tivly Pro" group
   - **Duration**: 1 month
   - **Price**: 99 SEK

5. Fill in all required metadata and localizations

6. Submit for review (required before testing on device)

## 🎯 Step 7: Configure Entitlement

1. In RevenueCat Dashboard, go to **Entitlements**

2. Create new entitlement:
   - **Identifier**: `Tivly Pro`
   - **Products**: Link your `monthly` product

## 🔐 Step 8: Update Info.plist (if not already done)

Add to `ios/App/App/Info.plist`:

```xml
<key>SKStoreKitConfigurationName</key>
<string>Tivly</string>
<key>SKReceiptRefreshRequest</key>
<true/>
```

## ✅ Step 9: Enable In-App Purchase Capability

1. In Xcode, select your project
2. Select the **App** target
3. Go to **Signing & Capabilities**
4. Click **+ Capability**
5. Add **In-App Purchase**

## 🧪 Step 10: Testing

### Simulator Testing (StoreKit Configuration File)

1. Make sure `Tivly.storekit` is in your project
2. In Xcode, go to **Product → Scheme → Edit Scheme**
3. Under **Run → Options**, set **StoreKit Configuration** to `Tivly.storekit`
4. Build and run in simulator
5. Purchases will work with the local StoreKit file

### Device Testing (Sandbox)

1. Create sandbox testers in App Store Connect
2. Sign out of your real Apple ID on the device
3. Build and install via Xcode to device
4. Launch app and attempt purchase
5. When prompted, sign in with sandbox tester account

## 🚀 Step 11: Usage in Your App

### Show Paywall
```typescript
import { purchaseAppleSubscription } from '@/lib/appleIAP';

// Show native SwiftUI paywall
const success = await purchaseAppleSubscription('monthly');
```

### Check Subscription Status
```typescript
import { Capacitor } from '@capacitor/core';

const RevenueCatManager = Capacitor.Plugins.RevenueCatManager as any;
const customerInfo = await RevenueCatManager.getCustomerInfo();

if (customerInfo.isPro) {
  console.log('User has Tivly Pro!');
}
```

### Show Customer Center
```typescript
const RevenueCatManager = Capacitor.Plugins.RevenueCatManager as any;
await RevenueCatManager.showCustomerCenter();
```

### Restore Purchases
```typescript
import { restorePurchases } from '@/lib/appleIAP';

const success = await restorePurchases();
```

## 🎨 Customization

### Paywall Design
Edit `PaywallViewController.swift` to customize:
- Colors and gradients
- Feature list
- Button styles
- Text and localization

### Customer Center
Edit `CustomerCenterViewController.swift` to customize:
- Status display
- Action buttons
- Information sections

## ⚠️ Important Notes

1. **API Key**: The test API key `test_ZPMHNNIDGuUIiXIRsmsotqQaNdo` is already configured in `RevenueCatManager.swift`

2. **Product IDs**: Ensure `monthly` matches between:
   - App Store Connect
   - RevenueCat Dashboard
   - `Tivly.storekit` file

3. **Bundle ID**: Must be `se.tivly.app` everywhere

4. **Entitlement**: `Tivly Pro` is used to check subscription status

5. **Testing**: Use StoreKit Configuration for simulator, sandbox accounts for device

## 🐛 Troubleshooting

### "No products available"
- Check product IDs match everywhere
- Verify RevenueCat offering is marked as "Current"
- Ensure App Store Connect products are approved

### "Purchase failed"
- Check RevenueCat API key is correct
- Verify App Store Connect API key is uploaded
- Ensure device is signed in with sandbox account

### "Entitlement not found"
- Verify entitlement identifier is exactly `Tivly Pro`
- Check product is linked to entitlement in RevenueCat

### Plugin not found
- Verify all Swift files are added to Xcode project
- Check `RevenueCatManager.m` is included in **Compile Sources**
- Run `npx cap sync` after changes

## 📚 Additional Resources

- [RevenueCat Documentation](https://www.revenuecat.com/docs/getting-started)
- [RevenueCat Paywalls Guide](https://www.revenuecat.com/docs/tools/paywalls)
- [RevenueCat Customer Center](https://www.revenuecat.com/docs/tools/customer-center)
- [Apple StoreKit Documentation](https://developer.apple.com/storekit/)

---

Your Tivly iOS app is now fully configured with RevenueCat! 🎉
