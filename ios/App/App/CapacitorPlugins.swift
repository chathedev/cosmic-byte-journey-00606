import Foundation
import Capacitor

@objc public class CapacitorPlugins: NSObject {
    
    @objc public static func registerPlugins(with bridge: CAPBridgeProtocol) {
        // Register @capgo/capacitor-purchases plugin
        // The plugin will be automatically discovered by Capacitor
        print("CapacitorPlugins: Registering custom plugins")
        
        // Initialize StoreKit manager
        let _ = TivlyStoreKitManager.shared
        print("CapacitorPlugins: TivlyStoreKitManager initialized")
    }
}
