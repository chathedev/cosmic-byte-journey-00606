import { useState, useRef, useEffect } from "react";
import { Square, Pause, Play, Edit2, Check, Clock, ArrowLeft, AlertTriangle, Mic } from "lucide-react";
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
import { RecordingInstructions } from "./RecordingInstructions";
import { isNativeApp } from "@/utils/capacitorDetection";
import { AudioVisualizationBars } from "./AudioVisualizationBars";
import { transcribeAndSave } from "@/lib/asrService";
import { apiClient } from "@/lib/api";
import { ScrollArea } from "@/components/ui/scroll-area";

interface RecordingViewNewProps {
  onBack: () => void;
  continuedMeeting?: any;
  isFreeTrialMode?: boolean;
  selectedLanguage?: 'sv-SE' | 'en-US';
}

type ViewState = 'recording';

// Check if user has ASR access (enterprise/plus/unlimited)
const hasAsrAccess = (plan: string | undefined): boolean => {
  if (!plan) return false;
  return ['enterprise', 'plus', 'unlimited'].includes(plan.toLowerCase());
};

// Check if user has library access (pro and above)
const hasLibraryAccess = (plan: string | undefined): boolean => {
  if (!plan) return false;
  return ['pro', 'enterprise', 'plus', 'unlimited'].includes(plan.toLowerCase());
};

export const RecordingViewNew = ({ onBack, continuedMeeting, isFreeTrialMode = false, selectedLanguage: initialLanguage = 'sv-SE' }: RecordingViewNewProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { userPlan, canCreateMeeting, incrementMeetingCount, refreshPlan, isAdmin } = useSubscription();
  
  const [viewState, setViewState] = useState<ViewState>('recording');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [sessionId, setSessionId] = useState<string>(continuedMeeting?.id || "");
  const [meetingName, setMeetingName] = useState(continuedMeeting?.title || "Namnlöst möte");
  const [selectedFolder, setSelectedFolder] = useState(continuedMeeting?.folder || "Allmänt");
  const [isEditingName, setIsEditingName] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [folders, setFolders] = useState<string[]>([]);
  const [isTestMode, setIsTestMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Real-time transcript for Free/Pro plans (browser speech recognition)
  const [liveTranscript, setLiveTranscript] = useState<string>(continuedMeeting?.transcript || "");
  const [interimText, setInterimText] = useState<string>("");
  
  // Determine transcription mode based on plan
  const useAsrMode = hasAsrAccess(userPlan?.plan);
  
  // Test access for admins and specific user
  const allowedTestEmail = 'charlie.wretling@icloud.com';
  const hasTestAccess = isAdmin || user?.email?.toLowerCase() === allowedTestEmail.toLowerCase();
  
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const createdAtRef = useRef<string>(continuedMeeting?.createdAt || new Date().toISOString());
  const wakeLockRef = useRef<any>(null);
  const hasIncrementedCountRef = useRef(!!continuedMeeting);
  const isSavingRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  
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

  // Auto-scroll transcript to bottom
  useEffect(() => {
    if (transcriptScrollRef.current) {
      transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight;
    }
  }, [liveTranscript, interimText]);

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

  // Initialize browser speech recognition for Free/Pro plans
  const startSpeechRecognition = () => {
    if (useAsrMode) return; // Don't use browser recognition for ASR plans
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Browser speech recognition not supported');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = initialLanguage;

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript + ' ';
        } else {
          interim += transcript;
        }
      }
      
      if (final) {
        setLiveTranscript(prev => prev + final);
        setInterimText('');
      } else {
        setInterimText(interim);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      // Auto-restart on recoverable errors
      if (event.error === 'no-speech' || event.error === 'aborted') {
        if (isRecording && !isPaused && recognitionRef.current) {
          setTimeout(() => {
            try {
              recognitionRef.current?.start();
            } catch { /* ignore */ }
          }, 100);
        }
      }
    };

    recognition.onend = () => {
      // Auto-restart if still recording
      if (isRecording && !isPaused && recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch { /* ignore */ }
      }
    };

    recognitionRef.current = recognition;
    
    try {
      recognition.start();
      console.log('✅ Browser speech recognition started');
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
    }
  };

  const stopSpeechRecognition = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      } catch { /* ignore */ }
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
        // Start recording for continued meeting too
        startRecording();
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
      stopSpeechRecognition();
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

      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      
      setIsRecording(true);
      await requestWakeLock();
      
      // Start browser speech recognition for Free/Pro plans
      if (!useAsrMode) {
        startSpeechRecognition();
      }
      
      console.log('✅ Recording started', useAsrMode ? '(ASR mode)' : '(Browser mode)');
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
      // Resume speech recognition for Free/Pro
      if (!useAsrMode && recognitionRef.current) {
        try { recognitionRef.current.start(); } catch { /* ignore */ }
      }
    } else {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      releaseWakeLock();
      // Pause speech recognition for Free/Pro
      if (!useAsrMode && recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ignore */ }
      }
    }
  };

  // Test transcript text about Tivly
  const testTranscriptText = `Välkomna till dagens möte om Tivly. Jag heter Anna Lindqvist och är produktchef. Med mig har jag Erik Johansson från utvecklingsteamet och Maria Svensson som är vår kundansvarig.

Dagens agenda handlar om vår nya transkriberingsfunktion. Erik, kan du berätta lite om den tekniska lösningen?

Absolut Anna. Vi har byggt en helt ny realtidstranskribering som fungerar direkt i webbläsaren. Det betyder att användarna kan se texten medan de pratar, vilket är perfekt för möten och intervjuer.

Det låter fantastiskt Erik. Maria, hur har kunderna reagerat på beta-versionen?

Responsen har varit överväldigande positiv. Många uppskattar att protokollen genereras automatiskt med AI. Det sparar dem timmar varje vecka. Särskilt företagskunder har visat stort intresse.

Bra jobbat allihop. Nästa steg blir att rulla ut detta till alla användare nästa månad. Vi ses igen på fredag för uppföljning.`;

  // Test mode - simulates typing for Free/Pro, uses audio file for Enterprise
  const startTestMode = async () => {
    if (isTestMode || isSavingRef.current) return;
    
    setIsTestMode(true);
    
    // For Free/Pro: Simulate typing text into transcript
    if (!useAsrMode) {
      console.log('📝 Test mode: Simulating real-time transcription...');
      stopSpeechRecognition();
      
      // Animate typing effect
      const words = testTranscriptText.split(' ');
      let currentText = '';
      
      for (let i = 0; i < words.length; i++) {
        currentText += (i === 0 ? '' : ' ') + words[i];
        setLiveTranscript(currentText);
        // Random delay between words (50-150ms) for realistic effect
        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
      }
      
      setInterimText('');
      setIsTestMode(false);
      
      toast({
        title: 'Testtext klar',
        description: 'Klicka "Färdig" för att spara mötet.',
      });
      return;
    }
    
    // For Enterprise: Use audio file with ASR
    isSavingRef.current = true;
    setIsSaving(true);
    setIsRecording(false);
    stopSpeechRecognition();
    
    try {
      console.log('📥 Test mode: Fetching test audio file...');
      const response = await fetch('/test-audio.wav');
      if (!response.ok) {
        throw new Error(`Failed to fetch test audio: ${response.status}`);
      }
      const audioBlob = await response.blob();
      
      console.log('📤 Test mode: Saving and redirecting...');
      
      const now = new Date().toISOString();
      const meetingData = {
        title: 'Testmöte',
        folder: selectedFolder,
        transcript: '',
        protocol: '',
        createdAt: now,
        updatedAt: now,
        userId: user?.uid || '',
        isCompleted: true,
        source: 'live' as const,
        transcriptionStatus: 'processing' as const,
        forceCreate: true,
      };

      const testMeetingId = await meetingStorage.saveMeeting(meetingData as any);
      console.log('✅ Test meeting created with ID:', testMeetingId);
      
      const meeting = { ...meetingData, id: testMeetingId };
      sessionStorage.setItem('pendingMeeting', JSON.stringify(meeting));
      
      toast({
        title: 'Testmöte sparat',
        description: 'Transkribering pågår i bakgrunden.',
      });
      
      navigate(`/library/${testMeetingId}`, { state: { fromRecording: true } });
      
      transcribeAndSave(audioBlob, testMeetingId, {
        language: 'sv',
        meetingTitle: 'Testmöte',
        userEmail: user?.email,
        userName: user?.displayName,
        authToken: apiClient.getAuthToken() || undefined,
        onProgress: (stage, percent) => {
          console.log(`🎤 Test ASR: ${stage} ${percent}%`);
        },
        onTranscriptReady: (transcript) => {
          let cleanTranscript = transcript;
          try {
            const parsed = JSON.parse(transcript);
            if (parsed.text) cleanTranscript = parsed.text;
          } catch { /* not JSON */ }
          
          window.dispatchEvent(new CustomEvent('transcriptionComplete', { 
            detail: { meetingId: testMeetingId, transcript: cleanTranscript } 
          }));
        }
      }).then(result => {
        if (!result.success) {
          console.error('❌ Test ASR failed:', result.error);
        }
      });
      
    } catch (error: any) {
      console.error('❌ Test mode error:', error?.message || error);
      isSavingRef.current = false;
      setIsSaving(false);
      toast({
        title: 'Testläge misslyckades',
        description: error?.message || 'Kunde inte starta testläge',
        variant: 'destructive',
      });
    } finally {
      setIsTestMode(false);
    }
  };

  // Library-first flow: save meeting, redirect instantly
  const handleStopRecording = async () => {
    if (isTestMode || isSaving) return;

    if (durationSec < 5) {
      toast({
        title: 'För kort inspelning',
        description: 'Spela in minst 5 sekunder.',
        variant: 'destructive',
      });
      return;
    }

    // For browser mode (Free/Pro), check if we have any transcript
    if (!useAsrMode && !liveTranscript.trim() && !interimText.trim()) {
      toast({
        title: 'Ingen text transkriberad',
        description: 'Försäkra dig om att mikrofonen fungerar och tala tydligt.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    setIsRecording(false);
    stopSpeechRecognition();
    await releaseWakeLock();

    // Stop media recorder and get final audio data
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = () => {
        saveAndRedirectInstantly();
      };
      mediaRecorderRef.current.stop();
    } else {
      saveAndRedirectInstantly();
    }
  };

  // Save meeting, redirect instantly
  const saveAndRedirectInstantly = async () => {
    if (isSavingRef.current) {
      console.log('⚠️ Save already in progress, ignoring duplicate call');
      return;
    }
    if (!user) return;
    
    isSavingRef.current = true;
    
    try {
      console.log('📤 Saving meeting and redirecting instantly...');
      
      // Combine live transcript with any interim text
      const finalTranscript = (liveTranscript + ' ' + interimText).trim();
      
      // For ASR mode, we need the audio blob
      const blob = new Blob(audioChunksRef.current, { 
        type: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4' 
      });
      
      console.log('Audio blob size:', blob.size, 'bytes');

      // Only check blob size for ASR mode
      if (useAsrMode && blob.size < 1000) {
        toast({
          title: 'Ljudfilen är för liten',
          description: 'Försök spela in igen.',
          variant: 'destructive',
        });
        isSavingRef.current = false;
        setIsSaving(false);
        setViewState('recording');
        startRecording();
        return;
      }

      const isContinuedMeeting = continuedMeeting && sessionId && !sessionId.startsWith('temp-');
      
      const now = new Date().toISOString();
      const meetingData = {
        ...(isContinuedMeeting ? { id: sessionId } : {}),
        title: meetingName,
        folder: selectedFolder,
        // For browser mode: save transcript directly. For ASR mode: empty (filled by backend)
        transcript: useAsrMode ? '' : finalTranscript,
        protocol: continuedMeeting?.protocol || '',
        createdAt: createdAtRef.current,
        updatedAt: now,
        userId: user.uid,
        isCompleted: true,
        source: 'live' as const,
        // For browser mode: done immediately. For ASR mode: processing
        transcriptionStatus: useAsrMode ? 'processing' as const : 'done' as const,
        forceCreate: !isContinuedMeeting,
      };

      const meetingId = isContinuedMeeting 
        ? sessionId 
        : await meetingStorage.saveMeeting(meetingData as any);
      
      if (isContinuedMeeting) {
        await meetingStorage.saveMeeting({ ...meetingData, id: meetingId } as any);
      }
      console.log(`✅ Meeting ${isContinuedMeeting ? 'updated' : 'created'} with ID:`, meetingId);
      
      const meeting = { ...meetingData, id: meetingId };
      
      // Determine user flow based on plan
      const canAccessLibrary = hasLibraryAccess(userPlan?.plan);
      
      if (canAccessLibrary) {
        // Pro/Enterprise/Plus/Unlimited - redirect to library
        sessionStorage.setItem('pendingMeeting', JSON.stringify(meeting));
        
        if (!hasIncrementedCountRef.current) {
          const wasCounted = await meetingStorage.markCountedIfNeeded(meetingId);
          if (wasCounted) {
            await incrementMeetingCount(meetingId);
            await refreshPlan();
          }
          hasIncrementedCountRef.current = true;
        }

        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        toast({
          title: 'Möte sparat',
          description: useAsrMode ? 'Transkribering pågår i bakgrunden.' : 'Transkribering klar!',
        });
        
        navigate(`/library/${meetingId}`, { state: { fromRecording: true } });

        // Only use ASR for enterprise/plus/unlimited plans
        if (useAsrMode) {
          transcribeAndSave(blob, meetingId, {
            language: 'sv',
            meetingTitle: meetingName,
            userEmail: user.email,
            userName: user.displayName,
            authToken: apiClient.getAuthToken() || undefined,
            onProgress: (stage, percent) => {
              console.log(`🎤 ASR: ${stage} ${percent}%`);
            },
            onTranscriptReady: (transcript) => {
              let cleanTranscript = transcript;
              try {
                const parsed = JSON.parse(transcript);
                if (parsed.text) cleanTranscript = parsed.text;
              } catch { /* not JSON */ }
              
              window.dispatchEvent(new CustomEvent('transcriptionComplete', { 
                detail: { meetingId, transcript: cleanTranscript } 
              }));
            }
          }).then(result => {
            if (!result.success) {
              console.error('❌ Client ASR failed:', result.error);
            }
          });
        } else {
          // For browser mode (Pro), dispatch completion event immediately
          window.dispatchEvent(new CustomEvent('transcriptionComplete', { 
            detail: { meetingId, transcript: finalTranscript } 
          }));
        }
      } else {
        // Free plan - show protocol page directly, secretly save in background
        console.log('📋 Free user: Redirecting to protocol page');
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        // Count meeting silently
        if (!hasIncrementedCountRef.current) {
          const wasCounted = await meetingStorage.markCountedIfNeeded(meetingId);
          if (wasCounted) {
            await incrementMeetingCount(meetingId);
            await refreshPlan();
          }
          hasIncrementedCountRef.current = true;
        }
        
        // Navigate to protocol page with transcript (don't mention saving)
        navigate('/protocol', { 
          state: { 
            transcript: finalTranscript, 
            aiProtocol: null,
            meetingId // Pass meetingId so protocol page knows it's saved
          },
          replace: true 
        });
      }
      
    } catch (error: any) {
      console.error('❌ Save error:', error);
      isSavingRef.current = false;
      setIsSaving(false);
      toast({
        title: 'Fel vid sparning',
        description: error.message || 'Kunde inte spara mötet',
        variant: 'destructive',
      });
    }
  };

  const handleBackClick = () => {
    if (viewState === 'recording' && durationSec > 5) {
      setShowExitWarning(true);
      return;
    }
    stopMediaRecorder();
    stopSpeechRecognition();
    onBack();
  };

  // Loading overlay while saving
  if (isSaving) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <h2 className="text-lg font-medium">Sparar möte...</h2>
          <p className="text-sm text-muted-foreground">Omdirigerar till biblioteket</p>
        </div>
      </div>
    );
  }

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
          <div className="w-full max-w-lg space-y-6">
            {/* Recording Status */}
            <div className="bg-card rounded-xl p-6 md:p-8 border shadow-sm relative">
              <div className="flex flex-col items-center text-center space-y-4">
                {/* Test button for allowed user */}
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
                  <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center transition-all ${
                    !isPaused ? 'bg-red-500 shadow-lg shadow-red-500/30' : 'bg-muted'
                  }`}>
                    <Mic className={`w-8 h-8 md:w-10 md:h-10 ${!isPaused ? 'text-white' : 'text-muted-foreground'}`} />
                  </div>
                </div>

                {/* Audio Visualization (for ASR mode) or Status */}
                {useAsrMode ? (
                  <AudioVisualizationBars stream={streamRef.current} isActive={isRecording && !isPaused} />
                ) : null}

                {/* Status Text */}
                <div className="space-y-1">
                  <h2 className="text-base md:text-lg font-semibold">
                    {isTestMode ? 'Testläge' : isPaused ? 'Pausad' : 'Inspelning pågår'}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {isPaused 
                      ? 'Tryck "Återuppta" för att fortsätta'
                      : useAsrMode 
                        ? 'Ljudet spelas in för transkribering.'
                        : 'Tala tydligt – texten visas direkt.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Live Transcript Display (Free/Pro only) */}
            {!useAsrMode && (
              <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
                <div className="px-4 py-2 border-b bg-muted/30">
                  <span className="text-xs font-medium text-muted-foreground">Transkribering</span>
                </div>
                <ScrollArea className="h-[200px] md:h-[240px]">
                  <div ref={transcriptScrollRef} className="p-4 text-sm leading-relaxed">
                    {liveTranscript || interimText ? (
                      <>
                        <span className="text-foreground">{liveTranscript}</span>
                        {interimText && (
                          <span className="text-muted-foreground/60 italic">{interimText}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground italic">
                        Börja tala för att se transkriberingen...
                      </span>
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}

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
                Färdig
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
              <AlertDialogAction onClick={() => { stopMediaRecorder(); stopSpeechRecognition(); onBack(); }} className="bg-destructive">
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

  return null;
};
