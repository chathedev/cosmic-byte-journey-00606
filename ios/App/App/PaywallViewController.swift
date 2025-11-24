import UIKit
import SwiftUI
import RevenueCat

class PaywallViewController: UIHostingController<PaywallView> {
    
    init() {
        super.init(rootView: PaywallView())
    }
    
    @MainActor required dynamic init?(coder aDecoder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
}

struct PaywallView: View {
    @Environment(\.dismiss) var dismiss
    @State private var offerings: Offerings?
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var isPurchasing = false
    
    var body: some View {
        NavigationView {
            ZStack {
                // Background gradient
                LinearGradient(
                    colors: [Color(hex: "1A1F2C"), Color(hex: "2A2F3C")],
                    startPoint: .top,
                    endPoint: .bottom
                )
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
                        
                        Button("Försök igen") {
                            loadOfferings()
                        }
                        .buttonStyle(PrimaryButtonStyle())
                    }
                    .padding()
                } else {
                    ScrollView {
                        VStack(spacing: 30) {
                            // Header
                            VStack(spacing: 12) {
                                Image(systemName: "crown.fill")
                                    .font(.system(size: 60))
                                    .foregroundColor(.yellow)
                                
                                Text("Uppgradera till Tivly Pro")
                                    .font(.system(size: 28, weight: .bold))
                                    .foregroundColor(.white)
                                
                                Text("Obegränsade möten och funktioner")
                                    .font(.system(size: 16))
                                    .foregroundColor(.gray)
                            }
                            .padding(.top, 40)
                            
                            // Features
                            VStack(spacing: 16) {
                                FeatureRow(icon: "infinity", title: "Obegränsade möten", description: "Spela in så många möten du vill")
                                FeatureRow(icon: "doc.text", title: "Obegränsade protokoll", description: "Generera protokoll för alla dina möten")
                                FeatureRow(icon: "sparkles", title: "AI-analys", description: "Avancerad mötesanalys med AI")
                                FeatureRow(icon: "folder", title: "Mapphantering", description: "Organisera dina möten i mappar")
                                FeatureRow(icon: "cloud", title: "Molnsynk", description: "Synka mellan alla dina enheter")
                            }
                            .padding()
                            .background(Color.white.opacity(0.05))
                            .cornerRadius(16)
                            
                            // Packages
                            if let offering = offerings?.current {
                                VStack(spacing: 12) {
                                    ForEach(offering.availablePackages, id: \.identifier) { package in
                                        PackageButton(package: package, isPurchasing: isPurchasing) {
                                            purchase(package: package)
                                        }
                                    }
                                }
                            }
                            
                            // Restore button
                            Button("Återställ köp") {
                                restorePurchases()
                            }
                            .foregroundColor(.gray)
                            .font(.system(size: 14))
                            
                            // Terms
                            Text("Prenumerationen förnyas automatiskt. Avbryt när som helst.")
                                .font(.system(size: 12))
                                .foregroundColor(.gray)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal)
                                .padding(.bottom, 20)
                        }
                        .padding(.horizontal)
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Stäng") {
                        dismiss()
                    }
                    .foregroundColor(.white)
                }
            }
        }
        .onAppear {
            loadOfferings()
        }
    }
    
    private func loadOfferings() {
        isLoading = true
        errorMessage = nil
        
        Task {
            do {
                offerings = try await Purchases.shared.offerings()
                isLoading = false
            } catch {
                errorMessage = "Kunde inte ladda prenumerationer: \(error.localizedDescription)"
                isLoading = false
            }
        }
    }
    
    private func purchase(package: Package) {
        isPurchasing = true
        
        Task {
            do {
                let result = try await Purchases.shared.purchase(package: package)
                
                if result.customerInfo.entitlements["Tivly Pro"]?.isActive == true {
                    dismiss()
                }
                
                isPurchasing = false
            } catch {
                errorMessage = "Köpet misslyckades: \(error.localizedDescription)"
                isPurchasing = false
            }
        }
    }
    
    private func restorePurchases() {
        isPurchasing = true
        
        Task {
            do {
                let customerInfo = try await Purchases.shared.restorePurchases()
                
                if customerInfo.entitlements["Tivly Pro"]?.isActive == true {
                    dismiss()
                }
                
                isPurchasing = false
            } catch {
                errorMessage = "Återställning misslyckades: \(error.localizedDescription)"
                isPurchasing = false
            }
        }
    }
}

struct FeatureRow: View {
    let icon: String
    let title: String
    let description: String
    
    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 24))
                .foregroundColor(.blue)
                .frame(width: 40)
            
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.white)
                
                Text(description)
                    .font(.system(size: 14))
                    .foregroundColor(.gray)
            }
            
            Spacer()
        }
    }
}

struct PackageButton: View {
    let package: Package
    let isPurchasing: Bool
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(package.storeProduct.localizedTitle)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white)
                    
                    Text(package.storeProduct.localizedDescription)
                        .font(.system(size: 14))
                        .foregroundColor(.gray)
                }
                
                Spacer()
                
                if isPurchasing {
                    ProgressView()
                        .tint(.white)
                } else {
                    Text(package.storeProduct.localizedPriceString)
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(.white)
                }
            }
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
        .disabled(isPurchasing)
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding()
            .background(Color.blue)
            .foregroundColor(.white)
            .cornerRadius(12)
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
    }
}

extension Color {
    init(hex: String) {
        let scanner = Scanner(string: hex)
        var rgbValue: UInt64 = 0
        scanner.scanHexInt64(&rgbValue)
        
        let r = Double((rgbValue & 0xff0000) >> 16) / 255.0
        let g = Double((rgbValue & 0xff00) >> 8) / 255.0
        let b = Double(rgbValue & 0xff) / 255.0
        
        self.init(red: r, green: g, blue: b)
    }
}
