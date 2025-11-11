import { useState } from "react";
import { Mic, Shield, Lock, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface IOSWelcomeScreenProps {
  onComplete: () => void;
}

export const IOSWelcomeScreen = ({ onComplete }: IOSWelcomeScreenProps) => {
  const [step, setStep] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);

  const requestMicrophonePermission = async () => {
    try {
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };

      await navigator.mediaDevices.getUserMedia(constraints);
      setPermissionGranted(true);
      setTimeout(() => onComplete(), 800);
    } catch (error) {
      console.error("Microphone permission denied:", error);
    }
  };

  const features = [
    {
      icon: Mic,
      title: "Mötestranskribering",
      description: "Konvertera dina möten till text i realtid med AI-precision",
      gradient: "from-blue-500 to-cyan-500"
    },
    {
      icon: Shield,
      title: "100% Privat",
      description: "All transkribering sker lokalt i din enhet. Ingen data lämnar din telefon.",
      gradient: "from-purple-500 to-pink-500"
    },
    {
      icon: Lock,
      title: "Säker & Krypterad",
      description: "Dina möten är skyddade med bank-nivå säkerhet",
      gradient: "from-green-500 to-emerald-500"
    }
  ];

  if (step === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-purple-900 flex flex-col items-center justify-between p-6 safe-area-inset">
        {/* Logo & Title Section */}
        <div className="flex-1 flex flex-col items-center justify-center text-center max-w-sm">
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-3xl blur-2xl opacity-30 animate-pulse-glow" />
            <div className="relative w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-3xl flex items-center justify-center shadow-2xl">
              <Mic className="w-12 h-12 text-white" />
            </div>
          </div>

          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent mb-4">
            Tivly
          </h1>
          
          <p className="text-xl text-muted-foreground mb-2">
            Din AI-drivna mötesassistent
          </p>
          
          <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
            <Sparkles className="w-4 h-4" />
            <span>Powered by AI</span>
          </div>
        </div>

        {/* CTA Section */}
        <div className="w-full max-w-sm space-y-4">
          <Button 
            onClick={() => setStep(1)}
            size="lg"
            className="w-full h-14 text-lg font-semibold rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-xl shadow-blue-500/30 touch-manipulation"
          >
            Kom igång
            <ChevronRight className="ml-2 w-5 h-5" />
          </Button>
          
          <p className="text-xs text-center text-muted-foreground px-4">
            Genom att fortsätta godkänner du våra användarvillkor
          </p>
        </div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-purple-900 flex flex-col p-6 safe-area-inset">
        {/* Header */}
        <div className="text-center mb-8 mt-12">
          <h2 className="text-3xl font-bold text-foreground mb-2">
            Varför Tivly?
          </h2>
          <p className="text-muted-foreground">
            Kraftfulla funktioner för dina möten
          </p>
        </div>

        {/* Features */}
        <div className="flex-1 space-y-6">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div 
                key={index}
                className="bg-card/80 backdrop-blur-xl rounded-3xl p-6 shadow-lg border border-border/50 hover-lift touch-manipulation"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center flex-shrink-0 shadow-lg`}>
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-card-foreground mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="mt-8">
          <Button 
            onClick={() => setStep(2)}
            size="lg"
            className="w-full h-14 text-lg font-semibold rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-xl shadow-blue-500/30 touch-manipulation"
          >
            Fortsätt
            <ChevronRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-purple-900 flex flex-col items-center justify-center p-6 safe-area-inset">
        <div className="max-w-sm w-full text-center space-y-8">
          {/* Icon */}
          <div className="relative mx-auto w-32 h-32">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full blur-2xl opacity-40 animate-pulse" />
            <div className="relative w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-2xl">
              <Mic className="w-16 h-16 text-white" />
            </div>
          </div>

          {/* Text */}
          <div className="space-y-4">
            <h2 className="text-3xl font-bold text-foreground">
              Mikrofontillgång
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Tivly behöver tillgång till din mikrofon för att transkribera dina möten i realtid.
            </p>
          </div>

          {/* Info Cards */}
          <div className="space-y-3 text-left">
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-green-800 dark:text-green-200">
                  All transkribering sker lokalt på din enhet
                </p>
              </div>
            </div>
            
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <Lock className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Ingen data sparas eller skickas någonstans
                </p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <Button 
            onClick={requestMicrophonePermission}
            disabled={permissionGranted}
            size="lg"
            className="w-full h-14 text-lg font-semibold rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-xl shadow-blue-500/30 touch-manipulation disabled:opacity-50"
          >
            {permissionGranted ? (
              <>
                <Shield className="mr-2 w-5 h-5" />
                Tillgång beviljad
              </>
            ) : (
              <>
                <Mic className="mr-2 w-5 h-5" />
                Ge mikrofontillgång
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground">
            Du kan när som helst ändra detta i enhetens inställningar
          </p>
        </div>
      </div>
    );
  }

  return null;
};
