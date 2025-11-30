#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(StoreKitManager, "StoreKitManager",
  CAP_PLUGIN_METHOD(getProducts, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(purchase, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(restorePurchases, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(getActiveSubscriptions, CAPPluginReturnPromise);
)
