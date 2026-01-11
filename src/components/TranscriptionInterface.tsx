import { useState, useEffect } from "react";
import { Mic, AlertCircle, FileText, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TranscriptPreview } from "./TranscriptPreview";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { SubscribeDialog } from "./SubscribeDialog";
import { TrustpilotDialog } from "./TrustpilotDialog";
import { DigitalMeetingDialog } from "./DigitalMeetingDialog";

import { useSearchParams, useNavigate } from "react-router-dom";
import { meetingStorage } from "@/utils/meetingStorage";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type View = "welcome" | "analyzing" | "transcript-preview";

interface AIActionItem {
  title: string;
  description?: string;
  owner?: string;
  deadline?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

interface AIProtocol {
  title: string;
  summary: string;
  mainPoints: string[];
  decisions: string[];
  actionItems: AIActionItem[];
}

interface TranscriptionInterfaceProps {
  isFreeTrialMode: boolean;
}

export const TranscriptionInterface = ({ isFreeTrialMode = false }: TranscriptionInterfaceProps) => {
  const [currentView, setCurrentView] = useState<View>("welcome");
  const [transcript, setTranscript] = useState("");
  const { canCreateMeeting, userPlan, incrementMeetingCount, refreshPlan } = useSubscription();
  const { user } = useAuth();
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState('');
  const [searchParams] = useSearchParams();
  const [isStartingRecording, setIsStartingRecording] = useState(false);
  const { toast } = useToast();
  const [selectedLanguage, setSelectedLanguage] = useState<'sv-SE' | 'en-US'>('sv-SE');
  const navigate = useNavigate();
  const [showDigitalMeetingDialog, setShowDigitalMeetingDialog] = useState(false);

  useEffect(() => {
    const id = searchParams.get('continue');
    if (!id) return;
    if (currentView !== "welcome") return;
    (async () => {
      try {
        const meeting = await meetingStorage.getMeeting(id);
        if (meeting) {
          navigate('/recording', { 
            state: { 
              continuedMeeting: meeting,
              isFreeTrialMode,
              selectedLanguage 
            } 
          });
        }
      } catch (e) {
        console.warn('Failed to load meeting to continue:', e);
      }
    })();
  }, [searchParams, currentView, navigate, isFreeTrialMode, selectedLanguage]);

  const handleStartRecording = async () => {
    const { allowed, reason } = await canCreateMeeting();
    if (!allowed) {
      setUpgradeReason(reason || 'Du har nått din gräns för möten');
      setShowUpgradeDialog(true);
      return;
    }

    navigate('/recording', { 
      state: { 
        continuedMeeting: null,
        isFreeTrialMode,
        selectedLanguage 
      } 
    });
  };


  const handleBackToWelcome = () => {
    setCurrentView("welcome");
    setTranscript("");
  };

  const handleDigitalMeetingUpload = async (transcript: string) => {
    // Just show the transcript preview - don't save yet
    // User will save when they click "Spara till bibliotek" or "Generera protokoll"
    setTranscript(transcript);
    setCurrentView("transcript-preview");
  };

  const handleOpenDigitalMeeting = async () => {
    // Dialog handles plan restrictions and shows upgrade prompt for free users
    setShowDigitalMeetingDialog(true);
  };

  // Check if user has Pro or Enterprise plan (for upload access)
  const hasProAccess = userPlan && (userPlan.plan === 'pro' || userPlan.plan === 'enterprise');


  const handleFileUpload = async (file: File) => {
    if (!file) return;

    // Check file size (limit to 500MB)
    const maxSizeMB = 5000;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      toast({
        title: "Filen är för stor",
        description: `Filen får max vara ${maxSizeMB}MB. Din fil är ${(file.size / 1024 / 1024).toFixed(1)}MB`,
        variant: "destructive",
      });
      return;
    }

    // Check if user can create a meeting
    const { allowed, reason } = await canCreateMeeting();
    if (!allowed) {
      setUpgradeReason(reason || 'Du har nått din gräns för möten');
      setShowUpgradeDialog(true);
      return;
    }

    // Show analyzing state
    setCurrentView("analyzing");

    try {
      const token = localStorage.getItem('authToken');

      if (!token) {
        throw new Error("Ingen autentiseringstoken hittades");
      }

      // Use multipart/form-data
      const formData = new FormData();
      formData.append('audioFile', file);
    formData.append('modelSize', 'base');
    formData.append('language', 'sv');

      // Call transcription API
      const response = await fetch('https://api.tivly.se/transcribe', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        if (response.status === 413) {
          throw new Error("Filen är för stor för servern att hantera");
        }
        throw new Error(`Transkribering misslyckades: ${response.status}`);
      }

      const result = await response.json();
      const transcriptText = result.text;

      if (!transcriptText) {
        throw new Error("Ingen transkription mottogs");
      }

      // Gå direkt till transkriptions-vyn utan att spara mötet ännu
      // Mötet sparas först när användaren väljer "Spara till bibliotek" eller "Generera protokoll"
      setTranscript(transcriptText);
      setCurrentView("transcript-preview");

      toast({
        title: "Transkribering klar",
        description: "Din fil har bearbetats framgångsrikt",
      });
    } catch (error) {
      console.error('File upload error:', error);
      let errorMessage = "Kunde inte bearbeta filen";
      
      if (error instanceof Error) {
        if (error.message.includes('Failed to fetch')) {
          errorMessage = "Nätverksfel. Kontrollera att backend-API:et är tillgängligt och har CORS konfigurerat korrekt.";
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: "Fel vid uppladdning",
        description: errorMessage,
        variant: "destructive",
      });
      setCurrentView("welcome");
    }
  };

  if (currentView === "analyzing") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-6">
          <Loader2 className="w-16 h-16 animate-spin text-primary mx-auto" />
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-foreground">
              Analyserar möte...
            </h2>
            <p className="text-muted-foreground">
              Transkriberar och bearbetar din fil
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (currentView === "transcript-preview") {
    return (
      <TranscriptPreview
        transcript={transcript}
        onBack={handleBackToWelcome}
        onGenerateProtocol={() => {
          navigate('/protocol', { state: { transcript, aiProtocol: null } });
        }}
      />
    );
  }

  // Get greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 5) return "God natt";
    if (hour < 10) return "God morgon";
    if (hour < 12) return "God förmiddag";
    if (hour < 18) return "God eftermiddag";
    if (hour < 22) return "God kväll";
    return "God natt";
  };

  const preferredName = (user as any)?.preferredName;
  const displayName = preferredName || user?.displayName?.split(' ')[0] || '';

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col overflow-hidden relative">
      {/* Animated background gradient */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-primary/10 via-transparent to-transparent rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-accent/10 via-transparent to-transparent rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-start p-4 pt-8 md:p-8 md:justify-center overflow-y-auto relative z-10">
        <div className="max-w-5xl w-full space-y-8 md:space-y-12">
          
          {/* Hero section */}
          <div className="text-center space-y-4 md:space-y-6">
            {displayName && (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 animate-fade-in">
                <span className="text-sm md:text-base text-muted-foreground font-medium">
                  {getGreeting()},
                </span>
                <span className="text-sm md:text-base font-semibold text-primary">{displayName}</span>
                <span className="text-lg">👋</span>
              </div>
            )}
            
            {/* Animated microphone icon */}
            <div className="relative inline-flex items-center justify-center">
              <div className="absolute inset-0 w-20 h-20 md:w-28 md:h-28 rounded-full bg-primary/20 animate-ping opacity-20" />
              <div className="absolute inset-0 w-20 h-20 md:w-28 md:h-28 rounded-full bg-primary/10 animate-pulse" />
              <div className="relative w-20 h-20 md:w-28 md:h-28 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-2xl shadow-primary/30">
                <Mic className="w-10 h-10 md:w-14 md:h-14 text-primary-foreground" />
              </div>
            </div>
            
            <div className="space-y-3 md:space-y-4">
              <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold text-foreground tracking-tight">
                <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient">
                  Mötestranskribering
                </span>
              </h1>
              <p className="text-base md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed px-4">
                Omvandla dina möten till text på sekunder. 
                <span className="hidden md:inline"> AI-driven transkribering med stöd för svenska.</span>
              </p>
            </div>
          </div>

          {/* CTA Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 max-w-3xl mx-auto">
            {/* Record Card */}
            <div 
              onClick={handleStartRecording}
              className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-6 md:p-8 cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-primary/30 active:scale-[0.98]"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10 space-y-4">
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <Mic className="w-7 h-7 md:w-8 md:h-8 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="text-xl md:text-2xl font-bold text-primary-foreground mb-1">
                    Spela in live
                  </h3>
                  <p className="text-sm md:text-base text-primary-foreground/80">
                    Transkribera möten i realtid direkt i webbläsaren
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 text-sm font-medium text-primary-foreground/90 pt-2">
                  <span className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm">
                    ✨ Bäst för fysiska möten
                  </span>
                </div>
              </div>
              {/* Decorative circles */}
              <div className="absolute -bottom-8 -right-8 w-32 h-32 rounded-full bg-white/10" />
              <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-white/5" />
            </div>

            {/* Upload Card */}
            <div 
              onClick={handleOpenDigitalMeeting}
              className="group relative overflow-hidden rounded-2xl bg-card border-2 border-border p-6 md:p-8 cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:border-accent/50 active:scale-[0.98]"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10 space-y-4">
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                  <Upload className="w-7 h-7 md:w-8 md:h-8 text-accent" />
                </div>
                <div>
                  <h3 className="text-xl md:text-2xl font-bold text-foreground mb-1">
                    Ladda upp fil
                  </h3>
                  <p className="text-sm md:text-base text-muted-foreground">
                    Ladda upp ljudfiler för snabb transkribering
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 text-sm font-medium pt-2">
                  {hasProAccess ? (
                    <span className="px-3 py-1 rounded-full bg-accent/10 text-accent">
                      🎯 Alla format stöds
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full bg-muted text-muted-foreground">
                      🔒 Pro/Enterprise
                    </span>
                  )}
                </div>
              </div>
              {/* Decorative elements */}
              <div className="absolute -bottom-8 -right-8 w-32 h-32 rounded-full bg-accent/5" />
            </div>
          </div>

          {/* Features section */}
          <div className="space-y-4 md:space-y-6">
            <h2 className="text-center text-lg md:text-xl font-semibold text-muted-foreground">
              Allt du behöver för effektiva möten
            </h2>
            
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 max-w-4xl mx-auto">
              {/* Feature 1 */}
              <div className="group relative bg-card rounded-xl p-4 md:p-6 border border-border hover:border-primary/30 transition-all duration-300 hover:shadow-lg">
                <div className="space-y-3">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <svg className="w-5 h-5 md:w-6 md:h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm md:text-base text-foreground">Realtid</h3>
                    <p className="text-xs md:text-sm text-muted-foreground leading-relaxed mt-1 hidden md:block">
                      Transkribering medan du pratar
                    </p>
                  </div>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="group relative bg-card rounded-xl p-4 md:p-6 border border-border hover:border-accent/30 transition-all duration-300 hover:shadow-lg">
                <div className="space-y-3">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-accent/20 to-accent/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <svg className="w-5 h-5 md:w-6 md:h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm md:text-base text-foreground">Visualisering</h3>
                    <p className="text-xs md:text-sm text-muted-foreground leading-relaxed mt-1 hidden md:block">
                      Animerad ljudvisualisering
                    </p>
                  </div>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="group relative bg-card rounded-xl p-4 md:p-6 border border-border hover:border-primary/30 transition-all duration-300 hover:shadow-lg">
                <div className="space-y-3">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <FileText className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm md:text-base text-foreground">Protokoll</h3>
                    <p className="text-xs md:text-sm text-muted-foreground leading-relaxed mt-1 hidden md:block">
                      Generera Word-dokument
                    </p>
                  </div>
                </div>
              </div>

              {/* Feature 4 */}
              <div className="group relative bg-card rounded-xl p-4 md:p-6 border border-border hover:border-accent/30 transition-all duration-300 hover:shadow-lg">
                <div className="space-y-3">
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-accent/20 to-accent/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <svg className="w-5 h-5 md:w-6 md:h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm md:text-base text-foreground">Bibliotek</h3>
                    <p className="text-xs md:text-sm text-muted-foreground leading-relaxed mt-1 hidden md:block">
                      Organisera i mappar
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Pro tip */}
          <div className="hidden md:block max-w-2xl mx-auto">
            <Alert className="border-primary/20 bg-gradient-to-r from-primary/5 to-accent/5 backdrop-blur-sm">
              <AlertCircle className="h-5 w-5 text-primary" />
              <AlertDescription className="text-sm ml-2">
                <span className="font-semibold text-foreground">Pro-tips:</span>{' '}
                <span className="text-muted-foreground">
                  Inspelaren är optimerad för fysiska möten. Vid digitala möten (Teams, Zoom) fungerar det bättre att spela in ljudet och ladda upp filen efteråt.
                </span>
              </AlertDescription>
            </Alert>
          </div>

        </div>
      </div>

      <SubscribeDialog
        open={showUpgradeDialog}
        onOpenChange={setShowUpgradeDialog}
      />
      
      <DigitalMeetingDialog
        open={showDigitalMeetingDialog}
        onOpenChange={setShowDigitalMeetingDialog}
        onTranscriptReady={handleDigitalMeetingUpload}
        selectedLanguage={selectedLanguage}
      />
    </div>
  );
};
