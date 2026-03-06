import { useState, useEffect, useCallback, useRef } from "react";
import { Mic, Loader2, Upload, ClipboardPaste, Sparkles, Shield, FileText, Monitor, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TranscriptPreview } from "./TranscriptPreview";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { SubscribeDialog } from "./SubscribeDialog";
import { DigitalMeetingDialog } from "./DigitalMeetingDialog";
import { TextPasteDialog } from "./TextPasteDialog";
import { TeamSelectDialog } from "./TeamSelectDialog";
import { MeetingModeDialog, type MeetingMode, type DigitalProvider } from "./MeetingModeDialog";
import { DigitalImportView } from "./DigitalImportView";
import { ZoomImportView } from "./ZoomImportView";
import { GoogleMeetImportView } from "./GoogleMeetImportView";
import { ParticipantsInputDialog } from "./ParticipantsInputDialog";
import { EnterpriseHomeDashboard } from "./EnterpriseHomeDashboard";
import { useDigitalImport } from "@/hooks/useDigitalImport";
import { useZoomImport } from "@/hooks/useZoomImport";
import { useGoogleMeetImport } from "@/hooks/useGoogleMeetImport";
import { useIsMobile } from "@/hooks/use-mobile";

import { useSearchParams, useNavigate } from "react-router-dom";
import { meetingStorage } from "@/utils/meetingStorage";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { debugLog, debugError } from "@/lib/debugLogger";
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
  const { canCreateMeeting, userPlan, incrementMeetingCount, refreshPlan, enterpriseMembership, isAdmin, isViewer } = useSubscription();
  const { user } = useAuth();
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState('');
  const [searchParams] = useSearchParams();
  const [isStartingRecording, setIsStartingRecording] = useState(false);
  const { toast } = useToast();
  const [selectedLanguage, setSelectedLanguage] = useState<'sv-SE' | 'en-US'>('sv-SE');
  const navigate = useNavigate();
  const [showDigitalMeetingDialog, setShowDigitalMeetingDialog] = useState(false);
  const [showTextPasteDialog, setShowTextPasteDialog] = useState(false);
  const isMobile = useIsMobile();
  const [showTeamSelect, setShowTeamSelect] = useState(false);
  const [pendingAction, setPendingAction] = useState<'record' | 'upload' | null>(null);
  const [pendingMeetingMode, setPendingMeetingMode] = useState<MeetingMode | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [showModeDialog, setShowModeDialog] = useState(false);
  const [showDigitalImport, setShowDigitalImport] = useState(false);
  const [showZoomImport, setShowZoomImport] = useState(false);
  const [showGoogleMeetImport, setShowGoogleMeetImport] = useState(false);
  const [showParticipantsDialog, setShowParticipantsDialog] = useState(false);
  const [pendingParticipants, setPendingParticipants] = useState<string[]>([]);

  const digitalImport = useDigitalImport();
  const zoomImport = useZoomImport();
  const googleMeetImport = useGoogleMeetImport();

  const isEnterprise = enterpriseMembership?.isMember && !!enterpriseMembership?.company?.id;

  useEffect(() => {
    debugLog('[🏠 Home] Dialog state snapshot:', {
      showModeDialog,
      showTeamSelect,
      showDigitalMeetingDialog,
      showDigitalImport,
      showUpgradeDialog,
      pendingAction,
    });
  }, [
    showModeDialog,
    showTeamSelect,
    showDigitalMeetingDialog,
    showDigitalImport,
    showUpgradeDialog,
    pendingAction,
  ]);

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

   // Handle "Spela in" button click - show mode selection
  const handleRecordClick = async () => {
    debugLog('[🏠 Home] Record button clicked');
    const { allowed, reason } = await canCreateMeeting();
    debugLog('[🏠 Home] canCreateMeeting result:', { allowed, reason });
    if (!allowed) {
      debugLog('[🏠 Home] Blocked — showing upgrade dialog, reason:', reason);
      setUpgradeReason(reason || 'Du har nått din gräns för möten');
      setShowUpgradeDialog(true);
      return;
    }
    debugLog('[🏠 Home] Opening MeetingModeDialog');
    setShowModeDialog(true);
  };

  const handleModeSelect = async (mode: MeetingMode, provider?: DigitalProvider) => {
    debugLog('[🏠 Home] handleModeSelect called with mode:', mode, 'provider:', provider);
    setShowModeDialog(false);

    if (mode === 'digital') {
      if (provider === 'zoom') {
        setShowZoomImport(true);
      } else if (provider === 'google_meet') {
        setShowGoogleMeetImport(true);
      } else {
        setShowDigitalImport(true);
      }
      return;
    }

    // For in-person / phone-call, show participants dialog first
    setPendingMeetingMode(mode);
    setShowParticipantsDialog(true);
  };

  const handleParticipantsConfirm = async (participants: string[]) => {
    setPendingParticipants(participants);
    setShowParticipantsDialog(false);

    const mode = pendingMeetingMode;

    if (isEnterprise) {
      debugLog('[🏠 Home] Enterprise user — showing team select with pending mode:', mode);
      setPendingAction('record');
      setShowTeamSelect(true);
      return;
    }

    debugLog('[🏠 Home] Starting in-person recording, mode:', mode);
    await startInPersonRecording(null, mode ?? undefined, participants);
  };

  const handleUploadClick = async () => {
    // Enterprise users: show team selection first
    if (isEnterprise) {
      setPendingMeetingMode(null);
      setPendingAction('upload');
      setShowTeamSelect(true);
      return;
    }
    setShowDigitalMeetingDialog(true);
  };

  const handleTeamSelected = async (teamId: string | null) => {
    debugLog('[🏠 Home] Team selected:', teamId, 'pendingAction:', pendingAction, 'pendingMeetingMode:', pendingMeetingMode);
    setSelectedTeamId(teamId);
    const action = pendingAction;
    const selectedMode = pendingMeetingMode;
    setPendingAction(null);
    setPendingMeetingMode(null);

    if (action === 'record') {
      await startInPersonRecording(teamId, selectedMode ?? undefined, pendingParticipants);
    } else if (action === 'upload') {
      setShowDigitalMeetingDialog(true);
    }
  };

  // Start in-person recording (current behavior)
  const startInPersonRecording = async (teamId?: string | null, mode?: MeetingMode, participants?: string[]) => {
    debugLog('[🏠 Home] startInPersonRecording called, teamId:', teamId, 'mode:', mode);
    setIsStartingRecording(true);

    try {
      const now = new Date().toISOString();
      debugLog('[🏠 Home] Creating meeting via API...');
      const result = await apiClient.createMeeting({
        title: 'Namnlöst möte',
        createdAt: now,
        meetingStartedAt: now,
        transcript: '',
        transcriptionStatus: 'recording',
        ...(participants && participants.length > 0 ? { participants } : {}),
        ...(teamId ? { teamId, enterpriseTeamId: teamId, accessScope: 'team' } : {}),
      });

      const meetingId = result.meeting?.id;
      if (!meetingId) {
        throw new Error('Inget mötesid returnerades');
      }

      debugLog('[🏠 Home] Meeting created:', meetingId, '— navigating to recording page');

      const pendingMeeting = {
        id: meetingId,
        title: 'Namnlöst möte',
        createdAt: now,
        transcript: '',
        transcriptionStatus: 'recording',
        userId: user?.uid || '',
      };
      sessionStorage.setItem('pendingMeeting', JSON.stringify(pendingMeeting));

      navigate(`/meetings/${meetingId}`, {
        state: { 
          startRecording: true,
          isFreeTrialMode,
          selectedLanguage,
          meetingMode: mode,
        },
      });
    } catch (error: any) {
      debugError('[🏠 Home] Failed to create meeting:', error);
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
    setTranscript(transcript);
    setCurrentView("transcript-preview");
  };

  const handleOpenDigitalMeeting = async () => {
    setShowDigitalMeetingDialog(true);
  };

  const handleTextPaste = async (text: string) => {
    const token = `protocol-${Date.now()}`;
    const payload = {
      transcript: text,
      meetingName: 'Inklistrad text',
      meetingId: '',
      token,
    };
    sessionStorage.setItem('protocol_generation_token', token);
    sessionStorage.setItem('pending_protocol_payload', JSON.stringify(payload));
    navigate('/generate-protocol', { state: payload });
  };

  const hasProAccess = userPlan && (userPlan.plan === 'pro' || userPlan.plan === 'enterprise');


  const handleFileUpload = async (file: File) => {
    if (!file) return;

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

    const { allowed, reason } = await canCreateMeeting();
    if (!allowed) {
      setUpgradeReason(reason || 'Du har nått din gräns för möten');
      setShowUpgradeDialog(true);
      return;
    }

    setCurrentView("analyzing");

    try {
      const token = localStorage.getItem('authToken');

      if (!token) {
        throw new Error("Ingen autentiseringstoken hittades");
      }

      const formData = new FormData();
      formData.append('audioFile', file);
    formData.append('modelSize', 'base');
    formData.append('language', 'sv');

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

  // Show Digital Import view
  if (showDigitalImport) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col">
        <div className="flex items-center gap-3 p-4 border-b border-border/50">
          <Button variant="ghost" size="icon" onClick={() => setShowDigitalImport(false)} className="shrink-0 -ml-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
          </Button>
          <p className="text-sm font-medium text-foreground">Importera från Teams</p>
        </div>
        <div className="flex-1">
          <DigitalImportView
            importStatus={digitalImport.importStatus}
            meetings={digitalImport.meetings}
            warnings={digitalImport.warnings}
            state={digitalImport.state}
            error={digitalImport.error}
            errorCode={digitalImport.errorCode}
            onConnect={digitalImport.connect}
            onDisconnect={digitalImport.disconnect}
            onLoadMeetings={digitalImport.loadMeetings}
            onImport={digitalImport.importMeeting}
            onReset={digitalImport.reset}
            onClose={() => setShowDigitalImport(false)}
            isFullyConnected={digitalImport.isFullyConnected}
            needsReconnect={digitalImport.needsReconnect}
          />
        </div>
      </div>
    );
  }

  // Show Zoom Import view
  if (showZoomImport) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col">
        <div className="flex items-center gap-3 p-4 border-b border-border/50">
          <Button variant="ghost" size="icon" onClick={() => setShowZoomImport(false)} className="shrink-0 -ml-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
          </Button>
          <p className="text-sm font-medium text-foreground">Importera från Zoom</p>
        </div>
        <div className="flex-1">
          <ZoomImportView
            importStatus={zoomImport.importStatus}
            recordings={zoomImport.recordings}
            warnings={zoomImport.warnings}
            state={zoomImport.state}
            error={zoomImport.error}
            errorCode={zoomImport.errorCode}
            onConnect={zoomImport.connect}
            onDisconnect={zoomImport.disconnect}
            onLoadRecordings={zoomImport.loadRecordings}
            onImport={zoomImport.importRecording}
            onToggleAutoImport={zoomImport.toggleAutoImport}
            onReset={zoomImport.reset}
            onClose={() => setShowZoomImport(false)}
            isFullyConnected={zoomImport.isFullyConnected}
            needsReconnect={zoomImport.needsReconnect}
          />
        </div>
      </div>
    );
  }

  // Show Google Meet Import view
  if (showGoogleMeetImport) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col">
        <div className="flex items-center gap-3 p-4 border-b border-border/50">
          <Button variant="ghost" size="icon" onClick={() => setShowGoogleMeetImport(false)} className="shrink-0 -ml-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
          </Button>
          <p className="text-sm font-medium text-foreground">Importera från Google Meet</p>
        </div>
        <div className="flex-1">
          <GoogleMeetImportView
            importStatus={googleMeetImport.importStatus}
            meetings={googleMeetImport.meetings}
            warnings={googleMeetImport.warnings}
            state={googleMeetImport.state}
            error={googleMeetImport.error}
            errorCode={googleMeetImport.errorCode}
            onConnect={googleMeetImport.connect}
            onDisconnect={googleMeetImport.disconnect}
            onLoadMeetings={googleMeetImport.loadMeetings}
            onImport={googleMeetImport.importMeeting}
            onToggleAutoImport={googleMeetImport.toggleAutoImport}
            onReset={googleMeetImport.reset}
            onClose={() => setShowGoogleMeetImport(false)}
            isFullyConnected={googleMeetImport.isFullyConnected}
            needsReconnect={googleMeetImport.needsReconnect}
          />
        </div>
      </div>
    );
  }
  if (currentView === "analyzing") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-6 max-w-sm">
          <div className="relative mx-auto w-20 h-20">
            <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
            <div className="relative w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-foreground">
              Analyserar möte...
            </h2>
            <p className="text-muted-foreground">
              Transkriberar och bearbetar din fil
            </p>
          </div>
          <div className="pt-4 space-y-2">
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span>Upp till 10 minuter beroende på längd</span>
            </div>
            <p className="text-xs text-muted-foreground/70">
              Vi levererar bästa möjliga transkriptionskvalitet
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

  // Enterprise users get the enhanced dashboard
  if (isEnterprise && !isViewer) {
    return (
      <>
        <EnterpriseHomeDashboard
          onRecord={handleRecordClick}
          onUpload={handleUploadClick}
          onTextPaste={() => setShowTextPasteDialog(true)}
          onOpenTeamsImport={() => setShowDigitalImport(true)}
          onOpenZoomImport={() => setShowZoomImport(true)}
          onOpenGoogleMeetImport={() => setShowGoogleMeetImport(true)}
          isStartingRecording={isStartingRecording}
        />

        {/* Dialogs */}
        <SubscribeDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog} />
        <DigitalMeetingDialog
          open={showDigitalMeetingDialog}
          onOpenChange={setShowDigitalMeetingDialog}
          onTranscriptReady={handleDigitalMeetingUpload}
          selectedLanguage={selectedLanguage}
          teamId={selectedTeamId}
        />
        <TextPasteDialog open={showTextPasteDialog} onOpenChange={setShowTextPasteDialog} onTextReady={handleTextPaste} />
        <TeamSelectDialog
          open={showTeamSelect}
          onOpenChange={(open) => { setShowTeamSelect(open); }}
          onSelect={handleTeamSelected}
        />
        <MeetingModeDialog
          open={showModeDialog}
          onOpenChange={(open) => { setShowModeDialog(open); }}
          onSelect={handleModeSelect}
          showDigitalOption={true}
          digitalComingSoon={false}
          digitalLocked={false}
          teamsLocked={enterpriseMembership?.company?.planType === 'team'}
        />
        <ParticipantsInputDialog
          open={showParticipantsDialog}
          onOpenChange={setShowParticipantsDialog}
          onConfirm={handleParticipantsConfirm}
          confirmLabel="Starta inspelning"
        />
      </>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8">
        <div className="max-w-md w-full space-y-8">
          
          {/* Hero - simplified */}
          <div className="text-center space-y-3">
            {displayName && (
              <p className="text-muted-foreground text-sm">
                {getGreeting()}, <span className="text-foreground font-medium">{displayName}</span>
              </p>
            )}
            <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
              Skapa protokoll
            </h1>
            <p className="text-sm text-muted-foreground">
              {isViewer ? 'Du har läsbehörighet i organisationen' : 'Spela in, ladda upp eller klistra in text'}
            </p>
          </div>

          {/* Viewer read-only notice */}
          {isViewer && (
            <div className="border border-border rounded-lg p-4 bg-muted/30 text-center space-y-1">
              <Eye className="w-5 h-5 mx-auto text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Läsläge</p>
              <p className="text-xs text-muted-foreground">
                Du kan se delade protokoll men inte skapa nya möten eller redigera innehåll.
              </p>
            </div>
          )}

          {/* Action buttons - hidden for viewers */}
          {!isViewer && (
          <div className="space-y-3">
            <Button 
              onClick={handleRecordClick}
              size="lg"
              disabled={isStartingRecording}
              className="w-full h-14 text-base gap-3 rounded-none"
            >
              {isStartingRecording ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
              {isStartingRecording ? 'Startar...' : 'Spela in möte'}
            </Button>

            <Button 
              onClick={handleUploadClick}
              variant="outline"
              size="lg"
              className="w-full h-14 text-base gap-3 rounded-none"
            >
              <Upload className="w-5 h-5" />
              Ladda upp fil
            </Button>

            <Button 
              onClick={() => setShowTextPasteDialog(true)}
              variant="outline"
              size="lg"
              className="w-full h-14 text-base gap-3 rounded-none"
            >
              <ClipboardPaste className="w-5 h-5" />
              Klistra in text
            </Button>
          </div>
          )}


          {/* Minimal trust indicators */}
          <div className="flex items-center justify-center gap-4 pt-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              <span>GDPR</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI-driven</span>
            </div>
            <div className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              <span>SV / EN</span>
            </div>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <SubscribeDialog
        open={showUpgradeDialog}
        onOpenChange={setShowUpgradeDialog}
      />
      
      <DigitalMeetingDialog
        open={showDigitalMeetingDialog}
        onOpenChange={setShowDigitalMeetingDialog}
        onTranscriptReady={handleDigitalMeetingUpload}
        selectedLanguage={selectedLanguage}
        teamId={selectedTeamId}
      />

      <TextPasteDialog
        open={showTextPasteDialog}
        onOpenChange={setShowTextPasteDialog}
        onTextReady={handleTextPaste}
      />

      <TeamSelectDialog
        open={showTeamSelect}
        onOpenChange={(open) => {
          debugLog('[🏠 Home] TeamSelectDialog onOpenChange:', open, 'pendingAction:', pendingAction);
          setShowTeamSelect(open);
        }}
        onSelect={handleTeamSelected}
      />

      <MeetingModeDialog
        open={showModeDialog}
        onOpenChange={(open) => {
          debugLog('[🏠 Home] MeetingModeDialog onOpenChange:', open);
          setShowModeDialog(open);
        }}
        onSelect={handleModeSelect}
        showDigitalOption={isEnterprise || isAdmin}
        digitalComingSoon={false}
        digitalLocked={false}
        teamsLocked={enterpriseMembership?.company?.planType === 'team'}
      />

      <ParticipantsInputDialog
        open={showParticipantsDialog}
        onOpenChange={setShowParticipantsDialog}
        onConfirm={handleParticipantsConfirm}
        confirmLabel="Starta inspelning"
      />
    </div>
  );
};
