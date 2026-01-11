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
    <div className="min-h-[100dvh] bg-background flex flex-col overflow-hidden">
      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-start p-4 pt-6 md:p-8 md:justify-center overflow-y-auto">
        <div className="max-w-4xl w-full space-y-6 md:space-y-8">
          {/* Hero section with greeting - Compact for mobile */}
          <div className="text-center space-y-2 md:space-y-3">
            {displayName && (
              <p className="text-base md:text-xl text-muted-foreground font-medium animate-fade-in">
                {getGreeting()}, <span className="text-primary">{displayName}</span> 👋
              </p>
            )}
            
            <div className="inline-flex items-center justify-center w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-primary/10 mb-2">
              <Mic className="w-6 h-6 md:w-8 md:h-8 text-primary" />
            </div>
            
            <div className="space-y-1 md:space-y-2">
              <h1 className="text-2xl md:text-4xl font-bold text-foreground tracking-tight">
                Mötestranskribering
              </h1>
              <p className="text-sm md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed px-2">
                Transkribera dina möten i realtid eller ladda upp inspelningar.
              </p>
            </div>
          </div>

          {/* CTA Buttons - Stack on small mobile */}
          <div className="space-y-3 md:space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center sm:gap-4">
              <div className="w-full sm:flex-1 sm:max-w-xs">
                <Button
                  onClick={handleStartRecording}
                  size="lg"
                  className="w-full px-4 py-4 md:px-6 md:py-5 text-sm md:text-base font-medium shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                >
                  <Mic className="mr-2 h-4 w-4 md:h-5 md:w-5" />
                  Spela in live-möte
                </Button>
                <p className="text-[10px] md:text-xs text-muted-foreground text-center mt-1.5">
                  <span className="font-semibold text-primary">Bäst för fysiska möten</span>
                </p>
              </div>
              
              <div className="w-full sm:flex-1 sm:max-w-xs">
                <Button
                  onClick={handleOpenDigitalMeeting}
                  variant="outline"
                  size="lg"
                  className="w-full px-4 py-4 md:px-6 md:py-5 text-sm md:text-base font-medium shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
                >
                  <Upload className="mr-2 h-4 w-4 md:h-5 md:w-5" />
                  Ladda upp inspelning
                </Button>
                <p className="text-[10px] md:text-xs text-muted-foreground text-center mt-1.5">
                  {hasProAccess ? (
                    <span className="font-semibold text-accent">För alla möten</span>
                  ) : (
                    <span className="font-semibold text-muted-foreground">Pro/Enterprise</span>
                  )}
                </p>
              </div>
            </div>
            
            {/* Clear explanation banner - Hidden on small screens */}
            <Alert className="hidden sm:flex max-w-2xl mx-auto border-primary/20 bg-primary/5">
              <AlertCircle className="h-4 w-4 text-primary" />
              <AlertDescription className="text-sm">
                <span className="font-semibold">Tips:</span> Inspelaren är optimerad för fysiska möten. Vid digitala möten fungerar det bättre att spela in ljudet och ladda upp filen.
              </AlertDescription>
            </Alert>
          </div>
          {/* Features grid - Compact 2-column on mobile */}
          <div className="grid grid-cols-2 md:grid-cols-2 gap-2 md:gap-4 max-w-3xl mx-auto">
            <div className="bg-card rounded-lg p-3 md:p-5 border border-border shadow-sm">
              <div className="flex flex-col md:flex-row items-center md:items-start gap-2 md:gap-3 text-center md:text-left">
                <div className="flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <svg className="w-4 h-4 md:w-5 md:h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-sm md:text-base text-foreground">Realtid</h3>
                  <p className="text-xs md:text-sm text-muted-foreground leading-relaxed hidden md:block">
                    Transkribering på svenska direkt medan du pratar
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-lg p-3 md:p-5 border border-border shadow-sm">
              <div className="flex flex-col md:flex-row items-center md:items-start gap-2 md:gap-3 text-center md:text-left">
                <div className="flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <svg className="w-4 h-4 md:w-5 md:h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-sm md:text-base text-foreground">Visualisering</h3>
                  <p className="text-xs md:text-sm text-muted-foreground leading-relaxed hidden md:block">
                    Se din röst med animerad ljudvisualisering
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-lg p-3 md:p-5 border border-border shadow-sm">
              <div className="flex flex-col md:flex-row items-center md:items-start gap-2 md:gap-3 text-center md:text-left">
                <div className="flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileText className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-sm md:text-base text-foreground">Protokoll</h3>
                  <p className="text-xs md:text-sm text-muted-foreground leading-relaxed hidden md:block">
                    Generera och ladda ner Word-dokument enkelt
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-lg p-3 md:p-5 border border-border shadow-sm">
              <div className="flex flex-col md:flex-row items-center md:items-start gap-2 md:gap-3 text-center md:text-left">
                <div className="flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <svg className="w-4 h-4 md:w-5 md:h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-sm md:text-base text-foreground">Bibliotek</h3>
                  <p className="text-xs md:text-sm text-muted-foreground leading-relaxed hidden md:block">
                    Organisera möten i mappar och kategorier
                  </p>
                </div>
              </div>
            </div>
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
