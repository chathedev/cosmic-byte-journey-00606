import { useState, useEffect } from "react";
import { Mic, AlertCircle, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TranscriptPreview } from "./TranscriptPreview";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { SubscribeDialog } from "./SubscribeDialog";
import { TrustpilotDialog } from "./TrustpilotDialog";

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

    // Navigate directly to recording page - it will handle mic permissions
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

      // Save the uploaded meeting and count it
      if (user) {
        try {
          const now = new Date().toISOString();
          const meeting = {
            id: 'temp-' + Date.now(),
            title: file.name.replace(/\.[^/.]+$/, ""),
            folder: 'Allmänt',
            transcript: transcriptText,
            protocol: '',
            createdAt: now,
            updatedAt: now,
            userId: user.uid,
          };
          
          const savedId = await meetingStorage.saveMeeting(meeting as any);
          
          // Count the uploaded meeting
          const wasCounted = await meetingStorage.markCountedIfNeeded(savedId);
          if (wasCounted) {
            console.log('📊 Incrementing meeting count for uploaded file');
            await incrementMeetingCount(savedId);
            await refreshPlan();
          }
        } catch (error) {
          console.error('Error saving uploaded meeting:', error);
        }
      }

      // Go to transcript preview instead of protocol
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

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col mobile-compact">
      {/* Enhanced animated background layers */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-primary/5 to-secondary/10" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/15 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-secondary/15 via-transparent to-transparent" />
      
      {/* Animated orbs */}
      <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-gradient-to-br from-primary/20 to-transparent rounded-full blur-3xl animate-pulse opacity-60" />
      <div className="absolute bottom-1/4 left-1/4 w-[600px] h-[600px] bg-gradient-to-br from-secondary/20 to-transparent rounded-full blur-3xl animate-pulse delay-1000 opacity-60" />
      
      {/* Main content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-4 pt-8 md:p-8 md:pt-12 lg:p-12 lg:pt-16 xl:p-16 xl:pt-20">
        <div className="max-w-4xl lg:max-w-6xl xl:max-w-7xl w-full space-y-10 lg:space-y-14 xl:space-y-16">
          {/* Hero section with premium design */}
          <div className="text-center space-y-6 lg:space-y-8 xl:space-y-10 animate-fade-in">
            {/* Icon with glow effect */}
            <div className="relative inline-block animate-slide-in-from-top">
              <div className="absolute inset-0 bg-gradient-to-br from-primary to-secondary rounded-[2rem] lg:rounded-[3rem] blur-3xl opacity-40 animate-pulse" />
              <div className="relative inline-flex items-center justify-center w-24 h-24 lg:w-36 lg:h-36 xl:w-44 xl:h-44 rounded-[2rem] lg:rounded-[3rem] bg-gradient-to-br from-primary/30 to-secondary/30 border-2 border-primary/40 shadow-2xl backdrop-blur-sm transform hover:scale-105 transition-all duration-300 group">
                <Mic className="w-12 h-12 lg:w-18 lg:h-18 xl:w-22 xl:h-22 text-primary drop-shadow-2xl group-hover:scale-110 transition-transform" />
              </div>
            </div>
            
            {/* Headline with gradient */}
            <div className="space-y-4 lg:space-y-6 xl:space-y-7 animate-slide-in-from-bottom">
              <h1 className="text-4xl md:text-5xl lg:text-7xl xl:text-8xl 2xl:text-9xl font-bold tracking-tight">
                <span className="bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">
                  Mötestranskribering
                </span>
              </h1>
              <p className="text-base md:text-lg lg:text-2xl xl:text-3xl text-muted-foreground max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto leading-relaxed font-medium">
                Transkribera dina möten i realtid med AI eller ladda upp inspelade möten
                <span className="block mt-2">och skapa professionella protokoll automatiskt</span>
              </p>
            </div>
          </div>

          {/* CTA Button with premium styling */}
          <div className="flex justify-center animate-slide-in-from-bottom delay-200">
            <Button
              onClick={handleStartRecording}
              size="lg"
              className="group relative px-12 py-7 lg:px-20 lg:py-10 xl:px-24 xl:py-12 text-lg lg:text-2xl xl:text-3xl font-semibold rounded-2xl lg:rounded-3xl shadow-2xl hover:shadow-primary/30 transform hover:scale-105 active:scale-95 transition-all duration-300 overflow-hidden"
            >
              {/* Button glow effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-primary via-primary to-secondary opacity-90 group-hover:opacity-100 transition-opacity" />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transform -skew-x-12 group-hover:translate-x-full transition-all duration-700" />
              
              <span className="relative flex items-center gap-3 lg:gap-4">
                <Mic className="w-6 h-6 lg:w-8 lg:h-8 xl:w-10 xl:h-10 group-hover:scale-110 transition-transform" />
                Spela in möte
              </span>
            </Button>
          </div>
          {/* Features grid */}
          <div className="grid md:grid-cols-2 gap-6 lg:gap-8 xl:gap-10 max-w-3xl lg:max-w-4xl xl:max-w-6xl mx-auto">
            <div className="bg-card rounded-lg p-6 lg:p-8 xl:p-10 border border-border shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4 lg:gap-6">
                <div className="flex-shrink-0 w-10 h-10 lg:w-14 lg:h-14 xl:w-16 xl:h-16 rounded-lg lg:rounded-xl bg-primary/10 flex items-center justify-center">
                  <svg className="w-5 h-5 lg:w-7 lg:h-7 xl:w-8 xl:h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="flex-1 text-left">
                  <h3 className="font-semibold lg:text-xl xl:text-2xl text-foreground mb-1 lg:mb-2">Realtid</h3>
                  <p className="text-sm lg:text-base xl:text-lg text-muted-foreground leading-relaxed">
                    Transkribering på svenska direkt medan du pratar
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-lg p-6 lg:p-8 xl:p-10 border border-border shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4 lg:gap-6">
                <div className="flex-shrink-0 w-10 h-10 lg:w-14 lg:h-14 xl:w-16 xl:h-16 rounded-lg lg:rounded-xl bg-accent/10 flex items-center justify-center">
                  <svg className="w-5 h-5 lg:w-7 lg:h-7 xl:w-8 xl:h-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                </div>
                <div className="flex-1 text-left">
                  <h3 className="font-semibold lg:text-xl xl:text-2xl text-foreground mb-1 lg:mb-2">Visualisering</h3>
                  <p className="text-sm lg:text-base xl:text-lg text-muted-foreground leading-relaxed">
                    Se din röst med animerad ljudvisualisering
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-lg p-6 lg:p-8 xl:p-10 border border-border shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4 lg:gap-6">
                <div className="flex-shrink-0 w-10 h-10 lg:w-14 lg:h-14 xl:w-16 xl:h-16 rounded-lg lg:rounded-xl bg-primary/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 lg:w-7 lg:h-7 xl:w-8 xl:h-8 text-primary" />
                </div>
                <div className="flex-1 text-left">
                  <h3 className="font-semibold lg:text-xl xl:text-2xl text-foreground mb-1 lg:mb-2">Protokoll</h3>
                  <p className="text-sm lg:text-base xl:text-lg text-muted-foreground leading-relaxed">
                    Generera och ladda ner Word-dokument enkelt
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-lg p-6 lg:p-8 xl:p-10 border border-border shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4 lg:gap-6">
                <div className="flex-shrink-0 w-10 h-10 lg:w-14 lg:h-14 xl:w-16 xl:h-16 rounded-lg lg:rounded-xl bg-accent/10 flex items-center justify-center">
                  <svg className="w-5 h-5 lg:w-7 lg:h-7 xl:w-8 xl:h-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1 text-left">
                  <h3 className="font-semibold lg:text-xl xl:text-2xl text-foreground mb-1 lg:mb-2">Bibliotek</h3>
                  <p className="text-sm lg:text-base xl:text-lg text-muted-foreground leading-relaxed">
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
    </div>
  );
};
