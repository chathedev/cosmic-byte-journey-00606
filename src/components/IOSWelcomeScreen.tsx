import { useState } from "react";
import { Mic, Shield, Lock, ChevronRight, Zap, FileText } from "lucide-react";
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
      description: "Konvertera dina möten till text i realtid med högsta precision",
      gradient: "from-blue-500 to-cyan-500"
    },
    {
      icon: FileText,
      title: "Smart Protokoll",
      description: "Generera automatiskt professionella mötesprotokoll direkt efter mötet",
      gradient: "from-purple-500 to-pink-500"
    },
    {
      icon: Shield,
      title: "100% Privat",
      description: "All transkribering sker lokalt i din enhet. Ingen data lämnar din telefon.",
      gradient: "from-green-500 to-emerald-500"
    }
  ];

  if (step === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-600 to-blue-700 flex flex-col items-center justify-center p-6 safe-area-inset relative overflow-hidden">
        {/* Animated background blobs */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-20 left-10 w-72 h-72 bg-white/10 rounded-full blur-3xl animate-float" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-white/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }} />
        </div>

        {/* Main Content Card */}
        <div className="relative z-10 w-full max-w-sm">
          {/* Logo Section */}
          <div className="text-center mb-12">
            <div className="relative mb-8 inline-block">
              <div className="absolute inset-0 bg-white/30 rounded-3xl blur-xl" />
              <div className="relative w-28 h-28 bg-white/20 backdrop-blur-xl border border-white/30 rounded-3xl flex items-center justify-center shadow-2xl">
                <Mic className="w-14 h-14 text-white" />
              </div>
            </div>

            <h1 className="text-6xl font-bold text-white mb-3 tracking-tight">
              Tivly
            </h1>
            
            <p className="text-xl text-white/90 font-medium">
              Din smarta mötesassistent
            </p>
          </div>

          {/* Glass Card */}
          <div className="bg-white/20 backdrop-blur-2xl border border-white/30 rounded-3xl p-8 shadow-2xl mb-6">
            <div className="space-y-4 text-white">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-white rounded-full" />
                <p className="text-sm font-medium">Transkribera möten i realtid</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-white rounded-full" />
                <p className="text-sm font-medium">Generera professionella protokoll</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-white rounded-full" />
                <p className="text-sm font-medium">100% privat och säkert</p>
              </div>
            </div>
          </div>

          {/* CTA Button */}
          <Button 
            onClick={() => setStep(1)}
            size="lg"
            className="w-full h-16 text-lg font-semibold rounded-2xl bg-white text-blue-600 hover:bg-white/95 shadow-2xl touch-manipulation transition-all"
          >
            Kom igång
            <ChevronRight className="ml-2 w-6 h-6" />
          </Button>
        </div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-600 to-blue-700 flex flex-col p-6 safe-area-inset relative overflow-hidden">
        {/* Animated background */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-20 right-10 w-72 h-72 bg-white/10 rounded-full blur-3xl animate-float" />
          <div className="absolute bottom-40 left-10 w-80 h-80 bg-white/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '1.5s' }} />
        </div>

        {/* Header */}
        <div className="relative z-10 text-center mb-8 mt-12">
          <h2 className="text-4xl font-bold text-white mb-3">
            Varför Tivly?
          </h2>
          <p className="text-white/80 text-lg">
            Allt du behöver för effektiva möten
          </p>
        </div>

        {/* Features - Glass Cards */}
        <div className="relative z-10 flex-1 space-y-4">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div 
                key={index}
                className="bg-white/15 backdrop-blur-2xl rounded-3xl p-6 shadow-xl border border-white/25 touch-manipulation"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center flex-shrink-0 shadow-lg`}>
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-white/80 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="relative z-10 mt-8">
          <Button 
            onClick={() => setStep(2)}
            size="lg"
            className="w-full h-16 text-lg font-semibold rounded-2xl bg-white text-blue-600 hover:bg-white/95 shadow-2xl touch-manipulation transition-all"
          >
            Fortsätt
            <ChevronRight className="ml-2 w-6 h-6" />
          </Button>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 via-purple-600 to-blue-700 flex flex-col items-center justify-center p-6 safe-area-inset relative overflow-hidden">
        {/* Animated background */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-white/10 rounded-full blur-3xl animate-pulse" />
        </div>

        <div className="relative z-10 max-w-sm w-full text-center space-y-8">
          {/* Icon in Glass Card */}
          <div className="relative mx-auto w-36 h-36">
            <div className="absolute inset-0 bg-white/30 rounded-full blur-2xl" />
            <div className="relative w-full h-full bg-white/20 backdrop-blur-2xl border border-white/30 rounded-full flex items-center justify-center shadow-2xl">
              <Mic className="w-20 h-20 text-white" />
            </div>
          </div>

          {/* Text */}
          <div className="space-y-4">
            <h2 className="text-4xl font-bold text-white">
              Mikrofontillgång
            </h2>
            <p className="text-lg text-white/90 leading-relaxed px-4">
              Vi behöver tillgång till din mikrofon för att transkribera möten i realtid
            </p>
          </div>

          {/* Info Cards - Glass */}
          <div className="space-y-3 text-left">
            <div className="bg-white/15 backdrop-blur-2xl border border-white/25 rounded-2xl p-5 shadow-xl">
              <div className="flex items-start gap-3">
                <Shield className="w-6 h-6 text-white flex-shrink-0 mt-0.5" />
                <p className="text-sm text-white/95 font-medium">
                  All transkribering sker lokalt på din enhet
                </p>
              </div>
            </div>
            
            <div className="bg-white/15 backdrop-blur-2xl border border-white/25 rounded-2xl p-5 shadow-xl">
              <div className="flex items-start gap-3">
                <Lock className="w-6 h-6 text-white flex-shrink-0 mt-0.5" />
                <p className="text-sm text-white/95 font-medium">
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
            className="w-full h-16 text-lg font-semibold rounded-2xl bg-white text-blue-600 hover:bg-white/95 shadow-2xl touch-manipulation disabled:opacity-70 transition-all"
          >
            {permissionGranted ? (
              <>
                <Shield className="mr-2 w-6 h-6" />
                Tillgång beviljad
              </>
            ) : (
              <>
                <Mic className="mr-2 w-6 h-6" />
                Ge mikrofontillgång
              </>
            )}
          </Button>

          <p className="text-sm text-white/70">
            Du kan ändra detta när som helst i inställningar
          </p>
        </div>
      </div>
    );
  }

  return null;
};
