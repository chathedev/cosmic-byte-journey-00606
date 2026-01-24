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

    setIsStartingRecording(true);

    try {
      // Meeting-First Flow: Create meeting on backend FIRST
      const now = new Date().toISOString();
      const result = await apiClient.createMeeting({
        title: 'Namnlöst möte',
        createdAt: now,
        meetingStartedAt: now,
        transcript: '',
        transcriptionStatus: 'recording',
      });

      const meetingId = result.meeting?.id;
      if (!meetingId) {
        throw new Error('Inget mötesid returnerades');
      }

      console.log('✅ Meeting created for recording:', meetingId);

      // Store pending meeting in sessionStorage for immediate display
      const pendingMeeting = {
        id: meetingId,
        title: 'Namnlöst möte',
        createdAt: now,
        transcript: '',
        transcriptionStatus: 'recording',
        userId: user?.uid || '',
      };
      sessionStorage.setItem('pendingMeeting', JSON.stringify(pendingMeeting));

      // Navigate to meeting page with recording=true flag
      navigate(`/meetings/${meetingId}`, {
        state: { 
          startRecording: true,
          isFreeTrialMode,
          selectedLanguage,
        },
      });
    } catch (error: any) {
      console.error('Failed to create meeting for recording:', error);
      toast({
        title: 'Kunde inte starta inspelning',
        description: error.message || 'Försök igen',
        variant: 'destructive',
      });
    } finally {
      setIsStartingRecording(false);
    }
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
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8">
        <div className="max-w-lg w-full space-y-10">
          
          {/* Greeting & Hero */}
          <div className="text-center space-y-3">
            {displayName && (
              <p className="text-muted-foreground">
                {getGreeting()}, <span className="text-foreground font-medium">{displayName}</span>
              </p>
            )}
            <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">
              Mötesprotokoll på minuter
            </h1>
            <p className="text-base text-muted-foreground max-w-sm mx-auto">
              Spela in eller ladda upp dina möten. Vi transkriberar och genererar professionella protokoll med AI.
            </p>
          </div>

          {/* Action buttons */}
          <div className="space-y-3">
            <Button 
              onClick={handleStartRecording}
              size="lg"
              disabled={isStartingRecording}
              className="w-full h-14 text-base gap-3 shadow-lg shadow-primary/20"
            >
              {isStartingRecording ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
              {isStartingRecording ? 'Startar...' : 'Spela in live'}
            </Button>

            <Button 
              onClick={handleOpenDigitalMeeting}
              variant="outline"
              size="lg"
              className="w-full h-14 text-base gap-3"
            >
              <Upload className="w-5 h-5" />
              Ladda upp fil
            </Button>
          </div>

          {/* Features */}
          <div className="grid grid-cols-3 gap-4 pt-2">
            <div className="text-center space-y-2">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
                <Mic className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Realtid</p>
                <p className="text-xs text-muted-foreground">Live-transkribering</p>
              </div>
            </div>
            <div className="text-center space-y-2">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">AI-protokoll</p>
                <p className="text-xs text-muted-foreground">Automatiskt genererat</p>
              </div>
            </div>
            <div className="text-center space-y-2">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
                <span className="text-xs font-bold text-primary">SV/EN</span>
              </div>
              <div>
                <p className="text-sm font-medium">Flerspråkig</p>
                <p className="text-xs text-muted-foreground">Svenska & engelska</p>
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
