import { useState, useRef, useEffect } from "react";
import { Square, Pause, Play, Edit2, Check, Clock, Loader2, ArrowLeft, AlertTriangle, Save, FileText, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { meetingStorage } from "@/utils/meetingStorage";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { SubscribeDialog } from "./SubscribeDialog";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateMeetingTitle } from "@/lib/titleGenerator";
import { RecordingInstructions } from "./RecordingInstructions";
import { isNativeApp } from "@/utils/capacitorDetection";
import { AudioVisualizationBars } from "./AudioVisualizationBars";

interface RecordingViewNewProps {
  onBack: () => void;
  continuedMeeting?: any;
  isFreeTrialMode?: boolean;
  selectedLanguage?: 'sv-SE' | 'en-US';
}

type ViewState = 'recording' | 'processing' | 'result';

export const RecordingViewNew = ({ onBack, continuedMeeting, isFreeTrialMode = false, selectedLanguage: initialLanguage = 'sv-SE' }: RecordingViewNewProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { userPlan, canCreateMeeting, incrementMeetingCount, refreshPlan } = useSubscription();
  
  const [viewState, setViewState] = useState<ViewState>('recording');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [sessionId, setSessionId] = useState<string>(continuedMeeting?.id || "");
  const [meetingName, setMeetingName] = useState(continuedMeeting?.title || "Namnlöst möte");
  const [selectedFolder, setSelectedFolder] = useState(continuedMeeting?.folder || "Allmänt");
  const [isEditingName, setIsEditingName] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [folders, setFolders] = useState<string[]>([]);
  const [isTestMode, setIsTestMode] = useState(false);
  
  // Test access for specific user
  const allowedTestEmail = 'charlie.wretling@icloud.com';
  const hasTestAccess = user?.email?.toLowerCase() === allowedTestEmail.toLowerCase();
  
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const createdAtRef = useRef<string>(continuedMeeting?.createdAt || new Date().toISOString());
  const wakeLockRef = useRef<any>(null);
  const hasIncrementedCountRef = useRef(!!continuedMeeting);
  
  const MAX_DURATION_SECONDS = 28800; // 8 hours
  const isNative = isNativeApp();

  // Load folders
  useEffect(() => {
    const loadFolders = async () => {
      if (!user) return;
      const list = await meetingStorage.getFolders(user.uid);
      const names = list.map(f => f.name);
      setFolders(names.length ? names : ["Allmänt"]);
    };
    loadFolders();
  }, [user]);

  // Check instructions
  useEffect(() => {
    const hasSeenInstructions = localStorage.getItem('hasSeenRecordingInstructions');
    if (!hasSeenInstructions && !continuedMeeting) {
      setShowInstructions(true);
    }
  }, [continuedMeeting]);

  // Wake lock management
  const requestWakeLock = async () => {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      console.log('✅ Wake lock acquired');
    } catch (err) {
      console.error('❌ Failed to acquire wake lock:', err);
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      } catch (err) {
        console.error('Failed to release wake lock:', err);
      }
    }
  };

  // Initialize session and start recording
  useEffect(() => {
    const initSession = async () => {
      if (!user) return;
      
      if (continuedMeeting) {
        setSessionId(continuedMeeting.id);
        setSelectedFolder(continuedMeeting.folder);
        hasIncrementedCountRef.current = true;
        return;
      }

      const { allowed, reason } = await canCreateMeeting();
      if (!allowed) {
        setShowUpgradeDialog(true);
        return;
      }

      const tempId = `temp-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      createdAtRef.current = new Date().toISOString();
      setSessionId(tempId);
      
      // Start recording
      startRecording();
    };

    initSession();
    
    return () => {
      stopMediaRecorder();
      releaseWakeLock();
    };
  }, [user]);

  // Duration timer
  useEffect(() => {
    if (isRecording && !isPaused) {
      durationIntervalRef.current = setInterval(() => {
        setDurationSec(s => {
          if (s + 1 >= MAX_DURATION_SECONDS) {
            handleStopRecording();
          }
          return s + 1;
        });
      }, 1000);
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    }
    return () => {
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    };
  }, [isRecording, isPaused]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4',
      });
      
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(1000); // Collect data every second
      mediaRecorderRef.current = mediaRecorder;
      
      setIsRecording(true);
      await requestWakeLock();
      
      console.log('✅ Recording started');
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: 'Behörighet nekad',
        description: 'Tivly behöver tillstånd till mikrofon.',
        variant: 'destructive',
      });
      onBack();
    }
  };

  const stopMediaRecorder = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const togglePause = () => {
    if (!mediaRecorderRef.current) return;
    
    if (isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      requestWakeLock();
    } else {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      releaseWakeLock();
    }
  };

  // Test mode - uses pre-recorded audio file with real transcription API
  const startTestMode = async () => {
    if (isTestMode) return;
    
    setIsTestMode(true);
    setIsRecording(false);
    setViewState('processing');
    setDurationSec(0);
    
    try {
      // Fetch the test audio file
      console.log('📥 Test mode: Fetching test audio file...');
      const response = await fetch('/test-audio.wav');
      if (!response.ok) {
        throw new Error(`Failed to fetch test audio: ${response.status}`);
      }
      const audioBlob = await response.blob();
      
      console.log('📤 Test mode: Uploading test audio for transcription...', audioBlob.size, 'bytes');
      
      // Send to transcription API
      const formData = new FormData();
      formData.append('file', audioBlob, 'test-audio.wav');
      
      const transcriptionResponse = await fetch('https://transcribe.api.tivly.se/transcribe', {
        method: 'POST',
        body: formData,
      });
      
      console.log('📡 Test mode: API response status:', transcriptionResponse.status);
      
      if (!transcriptionResponse.ok) {
        const errorText = await transcriptionResponse.text();
        console.error('❌ Test mode API error:', transcriptionResponse.status, errorText);
        throw new Error(`Transcription failed: ${transcriptionResponse.status}`);
      }
      
      const result = await transcriptionResponse.json();
      console.log('✅ Test transcription result:', result);
      
      if (result.status === 'done' && result.text) {
        setTranscript(result.text);
        setViewState('result');
        
        // Generate title
        try {
          const aiTitle = await generateMeetingTitle(result.text);
          setMeetingName(aiTitle);
        } catch (e) {
          setMeetingName("Testmöte");
        }
        
        toast({
          title: "Testläge klart",
          description: "Transkribering av testljud klar.",
        });
      } else {
        throw new Error('No transcription text received');
      }
    } catch (error: any) {
      console.error('❌ Test mode error:', error?.message || error);
      toast({
        title: 'Testfel',
        description: error?.message || 'Kunde inte transkribera testljudet.',
        variant: 'destructive',
      });
      setViewState('recording');
      startRecording();
    } finally {
      setIsTestMode(false);
    }
  };

  const handleStopRecording = async () => {
    // In test mode, the test handles everything - just wait
    if (isTestMode) {
      return;
    }

    if (durationSec < 5) {
      toast({
        title: 'För kort inspelning',
        description: 'Spela in minst 5 sekunder.',
        variant: 'destructive',
      });
      return;
    }

    setViewState('processing');
    setIsRecording(false);
    await releaseWakeLock();

    // Stop media recorder and wait for final data
    return new Promise<void>((resolve) => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.onstop = async () => {
          await uploadAndTranscribe();
          resolve();
        };
        mediaRecorderRef.current.stop();
      } else {
        uploadAndTranscribe().then(resolve);
      }
    });
  };

  const uploadAndTranscribe = async () => {
    try {
      console.log('📤 Uploading audio for transcription...');
      
      const audioBlob = new Blob(audioChunksRef.current, { 
        type: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4' 
      });
      
      console.log('Audio blob size:', audioBlob.size, 'bytes');

      if (audioBlob.size < 1000) {
        throw new Error('Audio file too small');
      }

      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.wav');

      // Use the transcription API
      const response = await fetch('http://transcribe.api.tivly.se/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Transcription API error:', response.status, errorText);
        throw new Error('Transcription failed');
      }

      const result = await response.json();
      console.log('✅ Transcription result:', result);

      if (result.status === 'done' && result.text) {
        setTranscript(result.text);
        setViewState('result');
        
        // Auto-generate title
        try {
          const aiTitle = await generateMeetingTitle(result.text);
          setMeetingName(aiTitle);
        } catch (e) {
          console.warn('Failed to generate title:', e);
        }
      } else {
        throw new Error('No transcription text received');
      }
    } catch (error) {
      console.error('❌ Transcription error:', error);
      toast({
        title: 'Transkribering misslyckades',
        description: 'Kunde inte bearbeta ljudet. Försök igen.',
        variant: 'destructive',
      });
      setViewState('recording');
      // Restart recording
      startRecording();
    } finally {
      // Clean up stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    }
  };

  const saveToLibrary = async () => {
    if (!user || !transcript.trim()) return;
    setIsSaving(true);

    try {
      const now = new Date().toISOString();
      const meeting = {
        id: sessionId,
        title: meetingName,
        folder: selectedFolder,
        transcript: transcript,
        protocol: '',
        createdAt: createdAtRef.current,
        updatedAt: now,
        userId: user.uid,
        isCompleted: true,
        source: 'live',
      };

      const newId = await meetingStorage.saveMeeting(meeting as any);
      const finalId = newId || sessionId;

      // Count meeting
      if (!hasIncrementedCountRef.current) {
        const wasCounted = await meetingStorage.markCountedIfNeeded(finalId);
        if (wasCounted) {
          await incrementMeetingCount(finalId);
          await refreshPlan();
        }
        hasIncrementedCountRef.current = true;
      }

      toast({
        title: 'Sparat!',
        description: `"${meetingName}" har sparats i biblioteket.`,
      });
      
      navigate('/library');
    } catch (error) {
      console.error('Error saving:', error);
      toast({
        title: 'Fel vid sparning',
        description: 'Kunde inte spara. Försök igen.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const saveAndGenerateProtocol = async () => {
    if (!user || !transcript.trim()) return;
    setIsSaving(true);

    try {
      const now = new Date().toISOString();
      const meeting = {
        id: sessionId,
        title: meetingName,
        folder: selectedFolder,
        transcript: transcript,
        protocol: '',
        createdAt: createdAtRef.current,
        updatedAt: now,
        userId: user.uid,
        isCompleted: true,
        source: 'live',
      };

      const newId = await meetingStorage.saveMeeting(meeting as any);
      const finalId = newId || sessionId;

      // Count meeting
      if (!hasIncrementedCountRef.current) {
        const wasCounted = await meetingStorage.markCountedIfNeeded(finalId);
        if (wasCounted) {
          await incrementMeetingCount(finalId);
          await refreshPlan();
        }
        hasIncrementedCountRef.current = true;
      }

      // Navigate to protocol generation
      navigate(`/generate-protocol?meetingId=${finalId}&title=${encodeURIComponent(meetingName)}`);
    } catch (error) {
      console.error('Error saving:', error);
      toast({
        title: 'Fel vid sparning',
        description: 'Kunde inte spara. Försök igen.',
        variant: 'destructive',
      });
      setIsSaving(false);
    }
  };

  const handleBackClick = () => {
    if (viewState === 'recording' && durationSec > 5) {
      setShowExitWarning(true);
      return;
    }
    stopMediaRecorder();
    onBack();
  };

  // Recording View
  if (viewState === 'recording') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
        {/* Header */}
        <div className={`border-b bg-background/95 backdrop-blur-sm sticky top-0 z-10 ${isNative ? 'pt-safe' : ''}`}>
          <div className="max-w-5xl mx-auto px-3 md:px-4 py-2 md:py-3">
            <div className="flex items-center justify-between gap-2 md:gap-4">
              <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                <div className={`w-2 h-2 rounded-full transition-all ${
                  !isPaused ? 'bg-red-500 animate-pulse' : 'bg-muted-foreground/40'
                }`} />
                {isEditingName ? (
                  <div className="flex gap-2 items-center flex-1 min-w-0">
                    <Input
                      value={meetingName}
                      onChange={(e) => setMeetingName(e.target.value)}
                      onBlur={() => setIsEditingName(false)}
                      onKeyDown={(e) => e.key === "Enter" && setIsEditingName(false)}
                      autoFocus
                      className="h-7 md:h-8 text-xs md:text-sm"
                    />
                    <Button onClick={() => setIsEditingName(false)} size="sm" variant="ghost" className="h-7 w-7 p-0">
                      <Check className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group cursor-pointer flex-1 min-w-0" onClick={() => setIsEditingName(true)}>
                    <h1 className="text-xs md:text-sm font-medium truncate">{meetingName}</h1>
                    <Edit2 className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 md:gap-1.5">
                <Clock className="w-3 md:w-3.5 h-3 md:h-3.5 text-muted-foreground" />
                <span className="font-mono text-[10px] md:text-xs">
                  {Math.floor(durationSec / 60)}:{(durationSec % 60).toString().padStart(2, '0')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-lg space-y-8">
            {/* Recording Status */}
            <div className="bg-card rounded-xl p-6 md:p-8 border shadow-sm relative">
              <div className="flex flex-col items-center text-center space-y-6">
                {/* Mic Icon */}
                
                {/* Test button for allowed user - positioned in card corner */}
                {hasTestAccess && !isTestMode && (
                  <button
                    onClick={startTestMode}
                    className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-muted/80 hover:bg-muted text-[10px] font-mono text-muted-foreground hover:text-foreground transition-all shadow-sm border border-border/50 z-10"
                    title="Simulera Tivly-möte"
                  >
                    Test
                  </button>
                )}
                <div className="relative">
                  {!isPaused && (
                    <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-20" />
                  )}
                  <div className={`w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center transition-all ${
                    !isPaused ? 'bg-red-500 shadow-lg shadow-red-500/30' : 'bg-muted'
                  }`}>
                    <Mic className={`w-10 h-10 md:w-12 md:h-12 ${!isPaused ? 'text-white' : 'text-muted-foreground'}`} />
                  </div>
                </div>

                {/* Audio Visualization */}
                <AudioVisualizationBars stream={streamRef.current} isActive={isRecording && !isPaused} />

                {/* Status Text */}
                <div className="space-y-2">
                  <h2 className="text-lg md:text-xl font-semibold">
                    {isTestMode ? 'Testläge' : isPaused ? 'Pausad' : 'Inspelning pågår'}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {isPaused 
                      ? 'Tryck "Återuppta" för att fortsätta'
                      : 'Tala tydligt. Ljudet spelas in för transkribering.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Folder Selection */}
            <div className="flex items-center justify-center gap-3">
              <span className="text-sm text-muted-foreground">Spara i:</span>
              <Select value={selectedFolder} onValueChange={setSelectedFolder}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {folders.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Bottom Controls */}
        <div className={`sticky bottom-0 bg-background/95 backdrop-blur-sm border-t shadow-lg ${isNative ? 'pb-safe' : ''}`}>
          <div className="max-w-5xl mx-auto px-4 py-4">
            <div className="flex items-center justify-center gap-3">
              <Button onClick={handleBackClick} variant="ghost" size="lg">
                <ArrowLeft className="w-5 h-5 mr-2" />
                Tillbaka
              </Button>
              
              <Button onClick={togglePause} variant="outline" size="lg">
                {isPaused ? (
                  <>
                    <Play className="w-5 h-5 mr-2" />
                    Återuppta
                  </>
                ) : (
                  <>
                    <Pause className="w-5 h-5 mr-2" />
                    Pausa
                  </>
                )}
              </Button>

              <Button 
                onClick={handleStopRecording} 
                size="lg" 
                className="bg-primary hover:bg-primary/90 font-semibold min-w-[140px]"
              >
                <Square className="w-5 h-5 mr-2" />
                Nästa
              </Button>
            </div>
          </div>
        </div>

        {/* Exit Warning Dialog */}
        <AlertDialog open={showExitWarning} onOpenChange={setShowExitWarning}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                Lämna inspelningen?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Din inspelning ({Math.floor(durationSec / 60)} min {durationSec % 60} sek) kommer att förloras.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Fortsätt spela in</AlertDialogCancel>
              <AlertDialogAction onClick={() => { stopMediaRecorder(); onBack(); }} className="bg-destructive">
                Lämna utan att spara
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <SubscribeDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog} />
        <RecordingInstructions isOpen={showInstructions} onClose={() => setShowInstructions(false)} />
      </div>
    );
  }

  // Processing View
  if (viewState === 'processing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
        <div className="text-center space-y-6">
          <div className="relative inline-flex">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Transkriberar...</h2>
            <p className="text-muted-foreground">
              Bearbetar {Math.floor(durationSec / 60)} min {durationSec % 60} sek ljud
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Result View
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
      {/* Header */}
      <div className={`border-b bg-background/95 backdrop-blur-sm sticky top-0 z-10 ${isNative ? 'pt-safe' : ''}`}>
        <div className="max-w-5xl mx-auto px-3 md:px-4 py-3">
          <div className="flex items-center justify-between">
            <Button onClick={() => navigate('/')} variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Hem
            </Button>
            <h1 className="text-sm font-medium">Transkription klar</h1>
            <div className="w-20" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-3xl mx-auto w-full p-4 space-y-4">
        {/* Meeting Name */}
        <div className="bg-card rounded-xl p-4 border">
          <div className="flex items-center gap-3">
            {isEditingName ? (
              <div className="flex gap-2 items-center flex-1">
                <Input
                  value={meetingName}
                  onChange={(e) => setMeetingName(e.target.value)}
                  onBlur={() => setIsEditingName(false)}
                  onKeyDown={(e) => e.key === "Enter" && setIsEditingName(false)}
                  autoFocus
                  className="text-lg font-semibold"
                />
                <Button onClick={() => setIsEditingName(false)} size="sm" variant="ghost">
                  <Check className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-1 cursor-pointer group" onClick={() => setIsEditingName(true)}>
                <h2 className="text-lg font-semibold">{meetingName}</h2>
                <Edit2 className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
            <Select value={selectedFolder} onValueChange={setSelectedFolder}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {folders.map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Transcript Preview */}
        <div className="bg-card rounded-xl p-4 border flex-1">
          <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Transkription ({transcript.split(/\s+/).length} ord)
          </h3>
          <div className="h-[300px] md:h-[400px] overflow-y-auto bg-muted/30 rounded-lg p-4 text-sm leading-relaxed">
            <p className="whitespace-pre-wrap">{transcript}</p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className={`sticky bottom-0 bg-background/95 backdrop-blur-sm border-t shadow-lg ${isNative ? 'pb-safe' : ''}`}>
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={saveToLibrary}
              variant="outline"
              size="lg"
              disabled={isSaving}
              className="flex-1"
            >
              {isSaving ? (
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              ) : (
                <Save className="w-5 h-5 mr-2" />
              )}
              Spara till bibliotek
            </Button>
            
            <Button
              onClick={saveAndGenerateProtocol}
              size="lg"
              disabled={isSaving}
              className="flex-1 bg-primary hover:bg-primary/90 font-semibold"
            >
              {isSaving ? (
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              ) : (
                <FileText className="w-5 h-5 mr-2" />
              )}
              Spara & Generera protokoll
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
