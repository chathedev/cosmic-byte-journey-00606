import { useState, useEffect, useCallback, useRef } from "react";
import { Mic, Loader2, Upload, ClipboardPaste, Sparkles, Shield, FileText, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TranscriptPreview } from "./TranscriptPreview";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { SubscribeDialog } from "./SubscribeDialog";
import { DigitalMeetingDialog } from "./DigitalMeetingDialog";
import { TextPasteDialog } from "./TextPasteDialog";
import { TeamSelectDialog } from "./TeamSelectDialog";
import { MeetingModeDialog, type MeetingMode } from "./MeetingModeDialog";
import { DigitalSessionStartDialog } from "./DigitalSessionStartDialog";
import { DigitalSessionView } from "./DigitalSessionView";
import { ParticipantsInputDialog } from "./ParticipantsInputDialog";
import { useDigitalSession } from "@/hooks/useDigitalSession";
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
  const { canCreateMeeting, userPlan, incrementMeetingCount, refreshPlan, enterpriseMembership, isAdmin } = useSubscription();
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
  const [showDigitalStartDialog, setShowDigitalStartDialog] = useState(false);
  const [showDigitalSession, setShowDigitalSession] = useState(false);
  const [showParticipantsDialog, setShowParticipantsDialog] = useState(false);
  const [pendingParticipants, setPendingParticipants] = useState<string[]>([]);

  const digitalSession = useDigitalSession();

  const isEnterprise = enterpriseMembership?.isMember && !!enterpriseMembership?.company?.id;

  useEffect(() => {
    debugLog('[🏠 Home] Dialog state snapshot:', {
      showModeDialog,
      showTeamSelect,
      showDigitalMeetingDialog,
      showDigitalStartDialog,
      showDigitalSession,
      showUpgradeDialog,
      pendingAction,
    });
  }, [
    showModeDialog,
    showTeamSelect,
    showDigitalMeetingDialog,
    showDigitalStartDialog,
    showDigitalSession,
    showUpgradeDialog,
    pendingAction,
  ]);

  // Auto-show Digital Session view for active/in-progress states
  // and clear only stale terminal sessions on initial hydration.
  const hasHydratedDigitalSessionRef = useRef(false);
  const redirectedCompletedSessionRef = useRef<string | null>(null);
  // Guard: once we reset a stale session on mount, never auto-open again in this page lifecycle
  const suppressAutoOpenRef = useRef(false);

  useEffect(() => {
    // On first hydration, check if the session from backend is stale and reset it
    if (!hasHydratedDigitalSessionRef.current && digitalSession.session) {
      hasHydratedDigitalSessionRef.current = true;
      const staleStatuses = ['completed', 'failed', 'timed_out', 'cancelled', 'interrupted', 'processing', 'stopping'];
      if (staleStatuses.includes(digitalSession.status)) {
        suppressAutoOpenRef.current = true;
        digitalSession.reset();
        setShowDigitalSession(false);
        return;
      }
    }

    // Never auto-open if we already suppressed a stale session
    if (suppressAutoOpenRef.current) return;

    const activeStatuses = [
      'pending',
      'starting',
      'joining',
      'listening',
      'paused',
    ];

    // Auto-open Digital Session only for real-time meeting states
    if (activeStatuses.includes(digitalSession.status) && digitalSession.session) {
      setShowDigitalSession(true);
    }
  }, [digitalSession.status, digitalSession.session, digitalSession.reset]);

  // Redirect to Meeting Detail page when monitored Digital Session transitions to
  // stopping/processing/completed. The MeetingDetail page handles ASR polling and
  // SSE streaming via the same shared pipeline as uploads and recordings.
  // Backend automatically submits the recorded WAV — no manual file upload needed.
  useEffect(() => {
    const redirectStatuses = ['stopping', 'processing', 'completed'];
    if (!redirectStatuses.includes(digitalSession.status)) return;
    if (!showDigitalSession) return;

    // Capture session data BEFORE any state mutations
    const sess = digitalSession.session;
    const sessionId = sess?.id;
    if (!sessionId) return;

    if (redirectedCompletedSessionRef.current === sessionId) return;
    redirectedCompletedSessionRef.current = sessionId;

    // Snapshot everything we need from the session before reset clears it
    const meetingId = sess.meetingId;
    const meetingTitle = sess.meetingTitle || 'Digitalt möte';
    const createdAt = sess.createdAt || new Date().toISOString();
    const updatedAt = sess.updatedAt || new Date().toISOString();

    // Reset digital session UI state
    setShowDigitalSession(false);
    digitalSession.reset();

    if (!meetingId) return;

    // Store a minimal pending meeting in sessionStorage so MeetingDetail can
    // display it immediately and begin ASR polling via the shared pipeline.
    // No manual upload is needed — backend auto-submits the WAV file.
    const pendingMeeting = {
      id: meetingId,
      title: meetingTitle,
      createdAt,
      updatedAt,
      transcript: '',
      transcriptionStatus: 'processing',
      userId: '',
      folder: '',
    };
    sessionStorage.setItem('pendingMeeting', JSON.stringify(pendingMeeting));

    // Navigate to Meeting Detail — same page used by uploads and recordings.
    // MeetingDetail will pick up the pendingMeeting from sessionStorage,
    // start ASR polling via /asr/status, and stream via /asr/stream.
    navigate(`/meetings/${meetingId}`, {
      replace: true,
      state: {
        source: 'digital-session',
      },
    });
  }, [digitalSession.status, digitalSession.session, showDigitalSession, navigate, digitalSession.reset]);
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

  const handleModeSelect = async (mode: MeetingMode) => {
    debugLog('[🏠 Home] handleModeSelect called with mode:', mode);
    setShowModeDialog(false);

    if (mode === 'digital') {
      setPendingMeetingMode(null);
      debugLog('[🏠 Home] Digital mode selected, isActive:', digitalSession.isActive);
      if (digitalSession.isActive) {
        setShowDigitalSession(true);
        return;
      }
      setShowDigitalStartDialog(true);
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

  const handleDigitalStart = async (joinUrl: string, title: string, participants?: string[]): Promise<boolean> => {
    const success = await digitalSession.startSession({ joinUrl, title, participants });
    if (success) {
      setShowDigitalSession(true);
    }
    return success;
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
    // Just show the transcript preview - don't save yet
    // User will save when they click "Spara till bibliotek" or "Generera protokoll"
    setTranscript(transcript);
    setCurrentView("transcript-preview");
  };

  const handleOpenDigitalMeeting = async () => {
    // Dialog handles plan restrictions and shows upgrade prompt for free users
    setShowDigitalMeetingDialog(true);
  };

  const handleTextPaste = async (text: string) => {
    // Navigate directly to protocol generation with the pasted text
    const token = `protocol-${Date.now()}`;
    const payload = {
      transcript: text,
      meetingName: 'Inklistrad text',
      meetingId: '', // No meeting ID for pasted text
      token,
    };
    sessionStorage.setItem('protocol_generation_token', token);
    sessionStorage.setItem('pending_protocol_payload', JSON.stringify(payload));
    navigate('/generate-protocol', { state: payload });
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

  // Show digital session monitoring view
  if (showDigitalSession && digitalSession.isActive) {
    return (
      <DigitalSessionView
        session={digitalSession.session}
        status={digitalSession.status}
        error={digitalSession.error}
        errorCode={digitalSession.errorCode}
        onPause={digitalSession.pauseSession}
        onResume={digitalSession.resumeSession}
        onStop={digitalSession.stopSession}
        onRetry={digitalSession.retrySession}
        onReset={() => { digitalSession.reset(); setShowDigitalSession(false); }}
        onBack={() => setShowDigitalSession(false)}
      />
    );
  }

  // Show digital session completed/failed view
  if (showDigitalSession && digitalSession.session && !digitalSession.isActive) {
    return (
      <DigitalSessionView
        session={digitalSession.session}
        status={digitalSession.status}
        error={digitalSession.error}
        errorCode={digitalSession.errorCode}
        onPause={digitalSession.pauseSession}
        onResume={digitalSession.resumeSession}
        onStop={digitalSession.stopSession}
        onRetry={digitalSession.retrySession}
        onReset={() => { digitalSession.reset(); setShowDigitalSession(false); }}
        onBack={() => setShowDigitalSession(false)}
      />
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
              Spela in, ladda upp eller klistra in text
            </p>
          </div>

          {/* Active digital session banner */}
          {digitalSession.isActive && (
            <button
              onClick={() => setShowDigitalSession(true)}
              className="w-full p-4 rounded-xl border-2 border-primary bg-primary/5 text-left flex items-center gap-3 transition-all hover:shadow-md"
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Monitor className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Digital session aktiv</p>
                <p className="text-xs text-muted-foreground truncate">
                  {digitalSession.session?.meetingTitle || 'Teams-möte pågår'}
                </p>
              </div>
              <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shrink-0" />
            </button>
          )}

          {/* Action buttons - clean and simple */}
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
        digitalComingSoon={isEnterprise && !isAdmin}
        digitalLocked={digitalSession.isLocked}
        lockedSessionInfo={digitalSession.lockedSessionInfo}
      />

      <DigitalSessionStartDialog
        open={showDigitalStartDialog}
        onOpenChange={setShowDigitalStartDialog}
        onStart={handleDigitalStart}
        isLocked={digitalSession.isLocked}
        error={digitalSession.error}
        onClearError={digitalSession.clearError}
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
