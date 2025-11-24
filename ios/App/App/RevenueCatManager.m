#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(RevenueCatManager, "RevenueCatManager",
  CAP_PLUGIN_METHOD(getOfferings, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(purchasePackage, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(restorePurchases, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(getCustomerInfo, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(showPaywall, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(showCustomerCenter, CAPPluginReturnPromise);
)
