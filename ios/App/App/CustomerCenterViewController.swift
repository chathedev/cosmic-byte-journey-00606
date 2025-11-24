import UIKit
import SwiftUI
import RevenueCat

class CustomerCenterViewController: UIHostingController<CustomerCenterView> {
    
    init() {
        super.init(rootView: CustomerCenterView())
    }
    
    @MainActor required dynamic init?(coder aDecoder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
}

struct CustomerCenterView: View {
    @Environment(\.dismiss) var dismiss
    @State private var customerInfo: CustomerInfo?
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showingAlert = false
    @State private var alertMessage = ""
    
    var body: some View {
        NavigationView {
            ZStack {
                // Background
                Color(hex: "1A1F2C")
                    .ignoresSafeArea()
                
                if isLoading {
                    ProgressView()
                        .scaleEffect(1.5)
                        .tint(.white)
                } else if let error = errorMessage {
                    VStack(spacing: 20) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.system(size: 50))
                            .foregroundColor(.red)
                        
                        Text(error)
                            .foregroundColor(.white)
                            .multilineTextAlignment(.center)
                            .padding()
                    }
                } else if let customerInfo = customerInfo {
                    ScrollView {
                        VStack(spacing: 24) {
                            // Status Card
                            VStack(spacing: 16) {
                                if customerInfo.entitlements["Tivly Pro"]?.isActive == true {
                                    Image(systemName: "crown.fill")
                                        .font(.system(size: 50))
                                        .foregroundColor(.yellow)
                                    
                                    Text("Tivly Pro")
                                        .font(.system(size: 28, weight: .bold))
                                        .foregroundColor(.white)
                                    
                                    Text("Du har tillgång till alla premium-funktioner")
                                        .font(.system(size: 16))
                                        .foregroundColor(.gray)
                                        .multilineTextAlignment(.center)
                                    
                                    if let expirationDate = customerInfo.entitlements["Tivly Pro"]?.expirationDate {
                                        Text("Förnyas: \(formatDate(expirationDate))")
                                            .font(.system(size: 14))
                                            .foregroundColor(.gray)
                                    }
                                } else {
                                    Image(systemName: "person.circle")
                                        .font(.system(size: 50))
                                        .foregroundColor(.gray)
                                    
                                    Text("Tivly Free")
                                        .font(.system(size: 28, weight: .bold))
                                        .foregroundColor(.white)
                                    
                                    Text("Uppgradera för att få tillgång till alla funktioner")
                                        .font(.system(size: 16))
                                        .foregroundColor(.gray)
                                        .multilineTextAlignment(.center)
                                }
                            }
                            .padding()
                            .frame(maxWidth: .infinity)
                            .background(Color.white.opacity(0.05))
                            .cornerRadius(16)
                            
                            // Actions
                            VStack(spacing: 12) {
                                if customerInfo.entitlements["Tivly Pro"]?.isActive != true {
                                    Button(action: {
                                        dismiss()
                                        // Navigate to paywall
                                    }) {
                                        HStack {
                                            Image(systemName: "crown.fill")
                                            Text("Uppgradera till Pro")
                                            Spacer()
                                            Image(systemName: "chevron.right")
                                        }
                                        .foregroundColor(.white)
                                        .padding()
                                        .background(
                                            LinearGradient(
                                                colors: [Color.blue, Color.purple],
                                                startPoint: .leading,
                                                endPoint: .trailing
                                            )
                                        )
                                        .cornerRadius(12)
                                    }
                                }
                                
                                Button(action: restorePurchases) {
                                    HStack {
                                        Image(systemName: "arrow.clockwise")
                                        Text("Återställ köp")
                                        Spacer()
                                    }
                                    .foregroundColor(.white)
                                    .padding()
                                    .background(Color.white.opacity(0.1))
                                    .cornerRadius(12)
                                }
                                
                                if customerInfo.entitlements["Tivly Pro"]?.isActive == true {
                                    Button(action: manageSubscription) {
                                        HStack {
                                            Image(systemName: "gear")
                                            Text("Hantera prenumeration")
                                            Spacer()
                                            Image(systemName: "arrow.up.right")
                                        }
                                        .foregroundColor(.white)
                                        .padding()
                                        .background(Color.white.opacity(0.1))
                                        .cornerRadius(12)
                                    }
                                }
                            }
                            
                            // Info
                            VStack(alignment: .leading, spacing: 12) {
                                Text("Information")
                                    .font(.system(size: 20, weight: .semibold))
                                    .foregroundColor(.white)
                                
                                InfoRow(label: "Användar-ID", value: customerInfo.originalAppUserId)
                                
                                if !customerInfo.activeSubscriptions.isEmpty {
                                    InfoRow(label: "Aktiva prenumerationer", value: String(customerInfo.activeSubscriptions.count))
                                }
                            }
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.white.opacity(0.05))
                            .cornerRadius(16)
                            
                            Spacer()
                        }
                        .padding()
                    }
                }
            }
            .navigationTitle("Kontoinställningar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Stäng") {
                        dismiss()
                    }
                    .foregroundColor(.white)
                }
            }
            .alert("Meddelande", isPresented: $showingAlert) {
                Button("OK", role: .cancel) { }
            } message: {
                Text(alertMessage)
            }
        }
        .onAppear {
            loadCustomerInfo()
        }
    }
    
    private func loadCustomerInfo() {
        isLoading = true
        errorMessage = nil
        
        Task {
            do {
                customerInfo = try await Purchases.shared.customerInfo()
                isLoading = false
            } catch {
                errorMessage = "Kunde inte ladda kontoinformation: \(error.localizedDescription)"
                isLoading = false
            }
        }
    }
    
    private func restorePurchases() {
        isLoading = true
        
        Task {
            do {
                customerInfo = try await Purchases.shared.restorePurchases()
                isLoading = false
                alertMessage = "Köp återställda!"
                showingAlert = true
            } catch {
                errorMessage = "Återställning misslyckades: \(error.localizedDescription)"
                isLoading = false
            }
        }
    }
    
    private func manageSubscription() {
        if let url = URL(string: "https://apps.apple.com/account/subscriptions") {
            UIApplication.shared.open(url)
        }
    }
    
    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        formatter.locale = Locale(identifier: "sv_SE")
        return formatter.string(from: date)
    }
}

struct InfoRow: View {
    let label: String
    let value: String
    
    var body: some View {
        HStack {
            Text(label)
                .font(.system(size: 14))
                .foregroundColor(.gray)
            
            Spacer()
            
            Text(value)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.white)
        }
    }
}
