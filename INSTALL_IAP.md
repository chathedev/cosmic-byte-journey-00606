# Installing Apple In-App Purchases

## Package Installation

The `@capacitor-community/in-app-purchases` package needs to be installed manually in your local development environment.

### Steps:

1. **Export your project to GitHub** (if not already done)
   - Click "Export to GitHub" in Lovable
   - Clone the repository locally

2. **Navigate to your project directory**
   ```bash
   cd your-project-directory
   ```

3. **Install the IAP package**
   ```bash
   npm install @capacitor-community/in-app-purchases
   ```

4. **Update the implementation**
   
   In `src/lib/appleIAP.ts`, uncomment this line:
   ```typescript
   import { InAppPurchases } from "@capacitor-community/in-app-purchases";
   ```
   
   And remove the stub implementation (lines 15-41).

5. **Sync Capacitor**
   ```bash
   npx cap sync ios
   ```

6. **Add iOS platform** (if not already added)
   ```bash
   npx cap add ios
   ```

7. **Open in Xcode and configure**
   ```bash
   npx cap open ios
   ```
   
   In Xcode:
   - Sign the app with your Apple Developer account
   - Enable In-App Purchase capability
   - Configure your bundle ID

8. **Set up App Store Connect**
   - Create in-app purchase products with these IDs:
     - `tivly_plus_monthly`
     - `tivly_plus_yearly`
     - `tivly_pro_monthly`
     - `tivly_pro_yearly`
   - Configure pricing and subscription details

9. **Build and test**
   ```bash
   npx cap run ios
   ```
   
   Use a Sandbox tester account for testing purchases.

## Backend Setup

Ensure your backend endpoint is ready:

**Endpoint:** `POST https://api.tivly.se/ios/verify`

**Request:**
```json
{
  "receipt": "base64_receipt_data"
}
```

**Response (Success):**
```json
{
  "success": true,
  "subscription": {
    "plan": "plus",
    "expiresAt": "2024-12-31T23:59:59Z"
  }
}
```

The backend should:
1. Decode the receipt
2. Verify with Apple's servers (`https://buy.itunes.apple.com/verifyReceipt`)
3. Update the user's subscription in your database
4. Return success/failure

## Testing

1. **Sandbox Testing** (pre-release)
   - Create a Sandbox tester account in App Store Connect
   - Test purchases without real charges
   - Verify receipt validation works

2. **TestFlight Testing** (beta)
   - Upload build to App Store Connect
   - Add TestFlight testers
   - Test the full purchase flow

3. **Production**
   - Submit app for review
   - After approval, purchases will use real credit cards

## Current Status

✅ Platform detection working
✅ UI shows Apple/Stripe based on platform
✅ Purchase flow implemented
⚠️ Waiting for manual package installation
⚠️ Needs App Store Connect configuration
⚠️ Needs backend verification endpoint

## Troubleshooting

**"IAP package not installed" error:**
- Follow installation steps above
- Rebuild the app after installing

**Purchases not working in browser:**
- This is expected - IAP only works in iOS app
- Browser users see Stripe checkout instead

**Receipt verification fails:**
- Check backend endpoint is accessible
- Verify Apple receipt format
- Test with Sandbox environment first

## Resources

- [Capacitor IAP Plugin Docs](https://github.com/capacitor-community/in-app-purchases)
- [Apple IAP Documentation](https://developer.apple.com/in-app-purchase/)
- [App Store Connect Guide](https://appstoreconnect.apple.com/)
