import { useState, useRef, useEffect } from "react";
import { Square, Pause, Play, Edit2, Check, Clock, ArrowLeft, AlertTriangle } from "lucide-react";
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
import { startBackgroundUpload } from "@/lib/backgroundUploader";
import { apiClient } from "@/lib/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRealtimeASR } from "@/hooks/useRealtimeASR";

interface RecordingViewNewProps {
  onBack: () => void;
  continuedMeeting?: any;
  isFreeTrialMode?: boolean;
  selectedLanguage?: 'sv-SE' | 'en-US';
}

type ViewState = 'recording';

// Check if user has ASR access for LIVE recording (Enterprise or Admin)
// Free and Pro use browser-based transcription for live recording
// Pro gets ASR only via file upload
const hasAsrAccess = (plan: string | undefined, isAdmin: boolean): boolean => {
  if (isAdmin) return true;
  if (!plan) return false;
  return plan.toLowerCase() === 'enterprise';
};

// Check if user has library access (Pro, Enterprise, or Admin)
const hasLibraryAccess = (plan: string | undefined, isAdmin: boolean): boolean => {
  if (isAdmin) return true;
  if (!plan) return false;
  return ['pro', 'enterprise'].includes(plan.toLowerCase());
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
  
  // Real-time transcript for all plans
  const [liveTranscript, setLiveTranscript] = useState<string>(continuedMeeting?.transcript || "");
  const [interimText, setInterimText] = useState<string>("");
  
  // Determine transcription mode based on plan
  const useAsrMode = hasAsrAccess(userPlan?.plan, isAdmin);
  
  // Realtime ASR for Enterprise users
  const realtimeASR = useRealtimeASR({
    onPartial: (text) => setInterimText(text),
    onFinal: (text) => {
      setLiveTranscript(prev => prev + (prev ? ' ' : '') + text);
      setInterimText('');
    },
    onDone: (transcript) => {
      console.log('✅ Realtime ASR done:', transcript.substring(0, 100) + '...');
    },
    onError: (message) => {
      console.error('❌ Realtime ASR error:', message);
      toast({
        title: 'Transkribering misslyckades',
        description: message,
        variant: 'destructive',
      });
    },
  });
  
  // Test access for admins and specific user - NEVER on iOS domain
  const allowedTestEmail = 'charlie.wretling@icloud.com';
  const isIOSDomain = typeof window !== 'undefined' && window.location.hostname === 'io.tivly.se';
  const hasTestAccess = !isIOSDomain && (isAdmin || user?.email?.toLowerCase() === allowedTestEmail.toLowerCase());
  
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
        // Start recording for continued meeting - pass meetingId directly
        startRecording(continuedMeeting.id);
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
      
      // Start recording - pass meetingId directly so ASR can connect immediately
      startRecording(tempId);
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

  const startRecording = async (meetingId?: string) => {
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

      // Determine best supported mimeType with codecs for reliable recording
      let mimeType = 'audio/webm; codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = ''; // Let browser choose
          }
        }
      }
      
      console.log('🎤 MediaRecorder mimeType:', mimeType || 'browser default');

      const recorderOptions: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const mediaRecorder = new MediaRecorder(stream, recorderOptions);
      
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          console.log(`📦 Audio chunk received: ${event.data.size} bytes (total chunks: ${audioChunksRef.current.length})`);
        }
      };

      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      
      setIsRecording(true);
      await requestWakeLock();
      
      // Use the passed meetingId directly (not from state which might not be set yet)
      const currentMeetingId = meetingId || sessionId;
      
      // For ASR mode (Enterprise): connect realtime ASR websocket
      if (useAsrMode && currentMeetingId) {
        console.log('🎤 Connecting realtime ASR for session:', currentMeetingId);
        realtimeASR.connect(currentMeetingId, stream);
      } else if (!useAsrMode) {
        // Start browser speech recognition for Free/Pro plans
        startSpeechRecognition();
      }
      
      console.log('✅ Recording started', useAsrMode ? '(Realtime ASR mode)' : '(Browser mode)', '| mimeType:', mediaRecorder.mimeType);
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
      // Resume transcription
      if (useAsrMode && streamRef.current) {
        realtimeASR.resume(streamRef.current);
      } else if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch { /* ignore */ }
      }
    } else {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      releaseWakeLock();
      // Pause transcription
      if (useAsrMode) {
        realtimeASR.pause();
      } else if (recognitionRef.current) {
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
      
      navigate('/library', { state: { fromRecording: true, pendingMeetingId: testMeetingId } });
      
      // Use background uploader for ASR (same as file upload)
      const audioFile = new File([audioBlob], `test-meeting-${testMeetingId}.webm`, { type: audioBlob.type });
      startBackgroundUpload(audioFile, testMeetingId, 'sv');
      
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
    const browserTranscript = liveTranscript.trim() || interimText.trim();
    const asrTranscript = realtimeASR.fullTranscript.trim();
    
    if (!useAsrMode && !browserTranscript) {
      toast({
        title: 'Ingen text transkriberad',
        description: 'Försäkra dig om att mikrofonen fungerar och tala tydligt.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    setIsRecording(false);
    
    // Stop transcription
    if (useAsrMode) {
      await realtimeASR.stop();
    } else {
      stopSpeechRecognition();
    }
    
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
      
      // Get transcript from appropriate source
      // For Enterprise with realtime ASR: use the realtime transcript
      // For Free/Pro: use browser transcript
      const browserTranscript = (liveTranscript + ' ' + interimText).trim();
      const asrRealtimeTranscript = realtimeASR.fullTranscript.trim();
      const finalTranscript = useAsrMode ? asrRealtimeTranscript : browserTranscript;
      
      // Get mimeType from MediaRecorder if available, fallback to detection
      const recorderMimeType = mediaRecorderRef.current?.mimeType;
      let blobMimeType = recorderMimeType || 'audio/webm';
      if (!recorderMimeType) {
        // Fallback detection
        if (MediaRecorder.isTypeSupported('audio/webm; codecs=opus')) {
          blobMimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          blobMimeType = 'audio/webm';
        } else {
          blobMimeType = 'audio/mp4';
        }
      }
      
      // For ASR mode, we need the audio blob for backup upload
      const blob = new Blob(audioChunksRef.current, { type: blobMimeType });
      
      // Detailed logging for debugging
      console.log('🎤 Recording complete:');
      console.log('  - Total chunks:', audioChunksRef.current.length);
      console.log('  - Blob size:', blob.size, 'bytes');
      console.log('  - Blob type:', blob.type);
      console.log('  - Final transcript length:', finalTranscript.length);
      
      if (blob.size < 100) {
        console.error('❌ CRITICAL: Blob is essentially empty! Recording failed.');
      } else if (blob.size < 50000) {
        console.warn('⚠️ WARNING: Blob is very small, may not contain real audio.');
      }

      const isContinuedMeeting = continuedMeeting && sessionId && !sessionId.startsWith('temp-');
      
      const now = new Date().toISOString();
      
      // For Enterprise with realtime ASR: transcript is already on backend, we save it locally too
      // For Free/Pro: save browser transcript directly
      const meetingData = {
        ...(isContinuedMeeting ? { id: sessionId } : {}),
        title: meetingName,
        folder: selectedFolder,
        transcript: finalTranscript, // Save transcript from realtime ASR or browser
        protocol: continuedMeeting?.protocol || '',
        createdAt: createdAtRef.current,
        updatedAt: now,
        userId: user.uid,
        isCompleted: true,
        source: 'live' as const,
        // Realtime ASR already persisted, so mark as done if we have transcript
        transcriptionStatus: (useAsrMode && finalTranscript) ? 'done' as const : (!useAsrMode ? 'done' as const : 'processing' as const),
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
      const canAccessLibrary = hasLibraryAccess(userPlan?.plan, isAdmin);
      
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
          description: finalTranscript ? 'Transkribering klar!' : 'Transkribering pågår i bakgrunden.',
        });
        
        // Redirect to library (not specific meeting URL)
        navigate('/library', { state: { fromRecording: true, pendingMeetingId: meetingId } });

        // Dispatch completion event
        window.dispatchEvent(new CustomEvent('transcriptionComplete', { 
          detail: { meetingId, transcript: finalTranscript } 
        }));
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
            <section className="relative rounded-3xl border border-border/50 bg-card/40 backdrop-blur-sm shadow-xl p-8 md:p-12">
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

              <div className="flex flex-col items-center text-center gap-4">
                <div className="font-mono text-4xl md:text-5xl tracking-tight">
                  {Math.floor(durationSec / 60)}:{(durationSec % 60).toString().padStart(2, '0')}
                </div>

                {/* Recording indicator */}
                <div className={`w-4 h-4 rounded-full transition-all ${
                  !isPaused ? 'bg-red-500 animate-pulse shadow-lg shadow-red-500/50' : 'bg-muted-foreground/40'
                }`} />

                <div className="space-y-1">
                  <h2 className="text-base md:text-lg font-medium">
                    {isTestMode ? 'Testläge' : isPaused ? 'Pausad' : 'Spelar in'}
                  </h2>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    {isPaused
                      ? 'Tryck "Återuppta" för att fortsätta'
                      : 'Tala tydligt – texten visas i realtid.'}
                  </p>
                </div>
              </div>
            </section>

            {/* Live Transcript Display - Always shown */}
            <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
              <div className="px-4 py-2 border-b bg-muted/30 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Transkribering</span>
                {useAsrMode && realtimeASR.isConnecting && (
                  <span className="text-xs text-muted-foreground animate-pulse">Ansluter...</span>
                )}
                {useAsrMode && realtimeASR.isConnected && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Live
                  </span>
                )}
              </div>
              <ScrollArea className="h-[200px] md:h-[240px]">
                <div ref={transcriptScrollRef} className="p-4 text-sm leading-relaxed">
                  {useAsrMode ? (
                    // Enterprise: realtime ASR transcript
                    realtimeASR.fullTranscript || liveTranscript || interimText ? (
                      <>
                        <span className="text-foreground">{realtimeASR.finalText || liveTranscript}</span>
                        {(realtimeASR.partialText || interimText) && (
                          <span className="text-muted-foreground/60 italic"> {realtimeASR.partialText || interimText}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground italic">
                        Börja tala för att se transkriberingen...
                      </span>
                    )
                  ) : (
                    // Free/Pro: browser speech recognition
                    liveTranscript || interimText ? (
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
                    )
                  )}
                </div>
              </ScrollArea>
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
