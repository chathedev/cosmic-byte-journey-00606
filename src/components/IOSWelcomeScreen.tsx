import { useState } from "react";
import { Mic, Shield } from "lucide-react";

interface IOSWelcomeScreenProps {
  onComplete: () => void;
}

export const IOSWelcomeScreen = ({ onComplete }: IOSWelcomeScreenProps) => {
  const [step, setStep] = useState(0);

  const requestMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      onComplete();
    } catch (error) {
      console.error('Microphone permission denied:', error);
      alert('Mikrofonåtkomst krävs för att spela in möten. Vänligen aktivera det i inställningarna.');
    }
  };

  if (step === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-ios-blue via-ios-purple to-ios-pink flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="backdrop-blur-2xl bg-white/10 rounded-3xl border border-white/20 shadow-2xl p-8 space-y-8">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-3xl bg-white/20 backdrop-blur-xl border border-white/30 flex items-center justify-center shadow-lg">
                <Mic className="w-10 h-10 text-white" />
              </div>
            </div>

            <div className="text-center space-y-3">
              <h1 className="text-3xl font-bold text-white">
                Välkommen till Tivly
              </h1>
              <p className="text-white/80 text-lg leading-relaxed">
                Transkribera och dokumentera dina möten enkelt
              </p>
            </div>

            <button
              onClick={() => setStep(1)}
              className="w-full py-4 px-6 bg-white/20 backdrop-blur-xl border border-white/30 rounded-2xl text-white font-semibold text-lg shadow-lg hover:bg-white/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
            >
              Kom igång
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-ios-blue via-ios-purple to-ios-pink flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="backdrop-blur-2xl bg-white/10 rounded-3xl border border-white/20 shadow-2xl p-8 space-y-8">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-3xl bg-white/20 backdrop-blur-xl border border-white/30 flex items-center justify-center shadow-lg">
                <Mic className="w-10 h-10 text-white" />
              </div>
            </div>

            <div className="text-center space-y-3">
              <h2 className="text-2xl font-bold text-white">
                Mikrofonåtkomst
              </h2>
              <p className="text-white/80 leading-relaxed">
                För att spela in möten behöver vi tillgång till din mikrofon
              </p>
            </div>

            <div className="backdrop-blur-xl bg-white/5 rounded-2xl border border-white/10 p-4">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-white/90 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-white/80 leading-relaxed">
                  Dina inspelningar lagras säkert och delas aldrig utan ditt tillstånd
                </p>
              </div>
            </div>

            <button
              onClick={requestMicrophonePermission}
              className="w-full py-4 px-6 bg-white/20 backdrop-blur-xl border border-white/30 rounded-2xl text-white font-semibold text-lg shadow-lg hover:bg-white/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
            >
              Tillåt mikrofonåtkomst
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
