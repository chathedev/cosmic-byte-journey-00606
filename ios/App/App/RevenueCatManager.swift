import Foundation
import RevenueCat
import Capacitor

@objc(RevenueCatManager)
public class RevenueCatManager: CAPPlugin {
    
    // MARK: - Configuration
    
    public static func configure() {
        // Configure RevenueCat with production API key
        Purchases.logLevel = .debug
        Purchases.configure(withAPIKey: "appl_FKrIkzvUZsEugFXZaYznvBWjEvK")
        
        print("🎯 RevenueCat configured with production API key")
    }
    
    // MARK: - Plugin Methods
    
    @objc func getOfferings(_ call: CAPPluginCall) {
        Task {
            do {
                let offerings = try await Purchases.shared.offerings()
                
                guard let currentOffering = offerings.current else {
                    call.reject("No current offering available")
                    return
                }
                
                let packagesData = currentOffering.availablePackages.map { package in
                    return [
                        "identifier": package.identifier,
                        "packageType": package.packageType.rawValue,
                        "product": [
                            "identifier": package.storeProduct.productIdentifier,
                            "title": package.storeProduct.localizedTitle,
                            "description": package.storeProduct.localizedDescription,
                            "price": package.storeProduct.price,
                            "priceString": package.storeProduct.localizedPriceString,
                            "currencyCode": package.storeProduct.currencyCode ?? "SEK"
                        ]
                    ]
                }
                
                call.resolve([
                    "current": [
                        "identifier": currentOffering.identifier,
                        "packages": packagesData
                    ]
                ])
                
            } catch {
                call.reject("Failed to fetch offerings: \(error.localizedDescription)")
            }
        }
    }
    
    @objc func purchasePackage(_ call: CAPPluginCall) {
        guard let identifier = call.getString("identifier"),
              let offeringIdentifier = call.getString("offeringIdentifier") else {
            call.reject("Missing required parameters")
            return
        }
        
        Task {
            do {
                let offerings = try await Purchases.shared.offerings()
                
                guard let offering = offerings.all[offeringIdentifier],
                      let package = offering.availablePackages.first(where: { $0.identifier == identifier }) else {
                    call.reject("Package not found")
                    return
                }
                
                let result = try await Purchases.shared.purchase(package: package)
                
                let customerInfo = result.customerInfo
                let isPro = customerInfo.entitlements["Tivly Pro"]?.isActive == true
                
                call.resolve([
                    "isPro": isPro,
                    "activeSubscriptions": Array(customerInfo.activeSubscriptions),
                    "allPurchasedProductIdentifiers": Array(customerInfo.allPurchasedProductIdentifiers)
                ])
                
            } catch {
                call.reject("Purchase failed: \(error.localizedDescription)")
            }
        }
    }
    
    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task {
            do {
                let customerInfo = try await Purchases.shared.restorePurchases()
                let isPro = customerInfo.entitlements["Tivly Pro"]?.isActive == true
                
                call.resolve([
                    "isPro": isPro,
                    "activeSubscriptions": Array(customerInfo.activeSubscriptions),
                    "allPurchasedProductIdentifiers": Array(customerInfo.allPurchasedProductIdentifiers)
                ])
                
            } catch {
                call.reject("Restore failed: \(error.localizedDescription)")
            }
        }
    }
    
    @objc func getCustomerInfo(_ call: CAPPluginCall) {
        Task {
            do {
                let customerInfo = try await Purchases.shared.customerInfo()
                let isPro = customerInfo.entitlements["Tivly Pro"]?.isActive == true
                
                call.resolve([
                    "isPro": isPro,
                    "activeSubscriptions": Array(customerInfo.activeSubscriptions),
                    "allPurchasedProductIdentifiers": Array(customerInfo.allPurchasedProductIdentifiers),
                    "originalAppUserId": customerInfo.originalAppUserId
                ])
                
            } catch {
                call.reject("Failed to get customer info: \(error.localizedDescription)")
            }
        }
    }
    
    @objc func showPaywall(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let viewController = self.bridge?.viewController else {
                call.reject("View controller not available")
                return
            }
            
            let paywallVC = PaywallViewController()
            paywallVC.modalPresentationStyle = .pageSheet
            
            if let sheet = paywallVC.sheetPresentationController {
                sheet.detents = [.large()]
                sheet.prefersGrabberVisible = true
            }
            
            viewController.present(paywallVC, animated: true) {
                call.resolve()
            }
        }
    }
    
    @objc func showCustomerCenter(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let viewController = self.bridge?.viewController else {
                call.reject("View controller not available")
                return
            }
            
            let customerCenterVC = CustomerCenterViewController()
            customerCenterVC.modalPresentationStyle = .pageSheet
            
            if let sheet = customerCenterVC.sheetPresentationController {
                sheet.detents = [.large()]
                sheet.prefersGrabberVisible = true
            }
            
            viewController.present(customerCenterVC, animated: true) {
                call.resolve()
            }
        }
    }
}
