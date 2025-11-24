import Foundation
import StoreKit

@objc public class TivlyStoreKitManager: NSObject {
    
    @objc public static let shared = TivlyStoreKitManager()
    
    private override init() {
        super.init()
    }
    
    /// Get the App Store receipt as base64 string
    @objc public func getReceiptData() -> String? {
        guard let receiptURL = Bundle.main.appStoreReceiptURL,
              let receiptData = try? Data(contentsOf: receiptURL) else {
            print("TivlyStoreKitManager: No receipt found")
            return nil
        }
        
        let receiptString = receiptData.base64EncodedString()
        print("TivlyStoreKitManager: Receipt retrieved, length: \(receiptString.count)")
        return receiptString
    }
    
    /// Check if receipt exists
    @objc public func hasReceipt() -> Bool {
        guard let receiptURL = Bundle.main.appStoreReceiptURL else {
            return false
        }
        return FileManager.default.fileExists(atPath: receiptURL.path)
    }
    
    /// Refresh the receipt (triggers App Store login if needed)
    @objc public func refreshReceipt(completion: @escaping (Bool, Error?) -> Void) {
        let request = SKReceiptRefreshRequest()
        let delegate = ReceiptRefreshDelegate(completion: completion)
        request.delegate = delegate
        request.start()
        
        // Keep delegate alive during request
        objc_setAssociatedObject(request, "delegate", delegate, .OBJC_ASSOCIATION_RETAIN)
    }
    
    /// Validate receipt format (basic check)
    @objc public func isReceiptValid() -> Bool {
        guard let receiptData = getReceiptData() else {
            return false
        }
        // Basic validation: check if it's not empty and is valid base64
        return !receiptData.isEmpty && Data(base64Encoded: receiptData) != nil
    }
}

// MARK: - Receipt Refresh Delegate
private class ReceiptRefreshDelegate: NSObject, SKRequestDelegate {
    let completion: (Bool, Error?) -> Void
    
    init(completion: @escaping (Bool, Error?) -> Void) {
        self.completion = completion
        super.init()
    }
    
    func requestDidFinish(_ request: SKRequest) {
        print("TivlyStoreKitManager: Receipt refresh completed successfully")
        completion(true, nil)
    }
    
    func request(_ request: SKRequest, didFailWithError error: Error) {
        print("TivlyStoreKitManager: Receipt refresh failed: \(error.localizedDescription)")
        completion(false, error)
    }
}
