import Foundation
import StoreKit
import Capacitor

@objc(StoreKitManager)
public class StoreKitManager: CAPPlugin {
    
    private var products: [Product] = []
    private var purchaseTask: Task<Void, Never>?
    
    // Product IDs - adjust based on your App Store Connect configuration
    private let productIDs = ["se.tivly.pro.monthly"]
    
    // MARK: - Initialization
    
    override public func load() {
        super.load()
        print("🍎 StoreKitManager loaded")
        
        // Start observing transactions
        purchaseTask = Task {
            await observeTransactions()
        }
        
        // Load products
        Task {
            await loadProducts()
        }
    }
    
    deinit {
        purchaseTask?.cancel()
    }
    
    // MARK: - Transaction Observation
    
    private func observeTransactions() async {
        for await result in Transaction.updates {
            guard case .verified(let transaction) = result else {
                print("⚠️ Transaction verification failed")
                continue
            }
            
            print("✅ Transaction verified: \(transaction.productID)")
            await transaction.finish()
        }
    }
    
    // MARK: - Product Loading
    
    private func loadProducts() async {
        do {
            products = try await Product.products(for: productIDs)
            print("✅ Loaded \(products.count) products")
            for product in products {
                print("  - \(product.id): \(product.displayPrice)")
            }
        } catch {
            print("❌ Failed to load products: \(error)")
        }
    }
    
    // MARK: - Plugin Methods
    
    @objc func getProducts(_ call: CAPPluginCall) {
        Task {
            // Ensure products are loaded
            if products.isEmpty {
                await loadProducts()
            }
            
            let productsData = products.map { product -> [String: Any] in
                return [
                    "id": product.id,
                    "displayName": product.displayName,
                    "description": product.description,
                    "price": product.price as NSDecimalNumber,
                    "displayPrice": product.displayPrice,
                    "type": product.type.rawValue
                ]
            }
            
            call.resolve([
                "products": productsData
            ])
        }
    }
    
    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("Missing productId")
            return
        }
        
        Task {
            // Ensure products are loaded
            if products.isEmpty {
                await loadProducts()
            }
            
            guard let product = products.first(where: { $0.id == productId }) else {
                call.reject("Product not found")
                return
            }
            
            do {
                let result = try await product.purchase()
                
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        print("✅ Purchase successful: \(transaction.productID)")
                        await transaction.finish()
                        
                        call.resolve([
                            "success": true,
                            "productId": transaction.productID,
                            "transactionId": String(transaction.id)
                        ])
                        
                    case .unverified(_, let error):
                        print("⚠️ Purchase unverified: \(error)")
                        call.reject("Purchase verification failed")
                    }
                    
                case .userCancelled:
                    print("ℹ️ User cancelled purchase")
                    call.resolve([
                        "success": false,
                        "cancelled": true
                    ])
                    
                case .pending:
                    print("⏳ Purchase pending")
                    call.resolve([
                        "success": false,
                        "pending": true
                    ])
                    
                @unknown default:
                    call.reject("Unknown purchase result")
                }
                
            } catch {
                print("❌ Purchase failed: \(error)")
                call.reject("Purchase failed: \(error.localizedDescription)")
            }
        }
    }
    
    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                
                var activeSubscriptions: [String] = []
                
                for await result in Transaction.currentEntitlements {
                    guard case .verified(let transaction) = result else {
                        continue
                    }
                    
                    activeSubscriptions.append(transaction.productID)
                }
                
                call.resolve([
                    "success": true,
                    "activeSubscriptions": activeSubscriptions
                ])
                
            } catch {
                print("❌ Restore failed: \(error)")
                call.reject("Restore failed: \(error.localizedDescription)")
            }
        }
    }
    
    @objc func getActiveSubscriptions(_ call: CAPPluginCall) {
        Task {
            var activeSubscriptions: [String] = []
            
            for await result in Transaction.currentEntitlements {
                guard case .verified(let transaction) = result else {
                    continue
                }
                
                activeSubscriptions.append(transaction.productID)
            }
            
            call.resolve([
                "activeSubscriptions": activeSubscriptions,
                "hasPro": activeSubscriptions.contains("se.tivly.pro.monthly")
            ])
        }
    }
}
