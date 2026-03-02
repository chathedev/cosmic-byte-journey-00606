import { useState, useRef, useEffect, useCallback } from "react";
import { Square, Pause, Play, Edit2, Check, Clock, ArrowLeft, AlertTriangle, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { meetingStorage } from "@/utils/meetingStorage";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { SubscribeDialog } from "./SubscribeDialog";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { RecordingInstructions } from "./RecordingInstructions";
import { VoiceNamePrompt } from "./VoiceNamePrompt";
import { MeetingModeDialog, type MeetingMode } from "./MeetingModeDialog";
import { CallInterruptionDialog } from "./CallInterruptionDialog";
import { isNativeApp } from "@/utils/capacitorDetection";
import { useCallInterruptionDetector } from "@/hooks/useCallInterruptionDetector";
import { MinimalAudioAnalyzer } from "./MinimalAudioAnalyzer";
import { startBackgroundUpload } from "@/lib/backgroundUploader";
import { noSleep } from "@/lib/noSleep";
import { apiClient } from "@/lib/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRecordingBackup } from "@/hooks/useRecordingBackup";

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
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [isTestMode, setIsTestMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [meetingMode, setMeetingMode] = useState<MeetingMode | null>(null);
  const [showModeDialog, setShowModeDialog] = useState(true);
  
  // Real-time transcript for Free/Pro plans (browser speech recognition)
  const [liveTranscript, setLiveTranscript] = useState<string>(continuedMeeting?.transcript || "");
  const [interimText, setInterimText] = useState<string>("");
  
  // Determine transcription mode based on plan
  const useAsrMode = hasAsrAccess(userPlan?.plan, isAdmin);
  
  // Test access for admins and specific user - NEVER on iOS domain
  const allowedTestEmail = 'charlie.wretling@icloud.com';
  const isIOSDomain = typeof window !== 'undefined' && window.location.hostname === 'io.tivly.se';
  const hasTestAccess = !isIOSDomain && (isAdmin || user?.email?.toLowerCase() === allowedTestEmail.toLowerCase());
  
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordingStartedAtMsRef = useRef<number | null>(null);
  const totalPausedMsRef = useRef(0);
  const pauseStartedAtMsRef = useRef<number | null>(null);
  const createdAtRef = useRef<string>(continuedMeeting?.createdAt || new Date().toISOString());
  const wakeLockRef = useRef<any>(null);
  const hasIncrementedCountRef = useRef(!!continuedMeeting);
  const isSavingRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  
  const MAX_DURATION_SECONDS = 28800; // 8 hours
  const isNative = isNativeApp();

  // Recording backup for reliability - auto-saves chunks to IndexedDB
  const tempMeetingId = useRef(`temp-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`);
  const {
    addChunk,
    saveBackup,
    clearBackup,
    startAutoSave,
    stopAutoSave,
    chunksSaved,
    isBackupEnabled,
  } = useRecordingBackup({
    meetingId: sessionId || tempMeetingId.current,
    enabled: true,
    saveInterval: 15000, // Save every 15 seconds for safety
    onBackupSaved: (count, bytes) => {
      console.log(`🛡️ Auto-backup saved: ${count} chunks, ${bytes} bytes`);
    },
  });

  // Call interruption detection for in-person meetings
  const handleCallInterruption = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      releaseWakeLock();
      saveBackup();
      if (!useAsrMode && recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ignore */ }
      }
      console.log('📞 Recording auto-paused due to call interruption');
    }
  };

  const { showResumeDialog, dismissResumeDialog } = useCallInterruptionDetector({
    enabled: meetingMode === 'in-person',
    isRecording,
    isPaused,
    stream: streamRef.current,
    onInterrupted: handleCallInterruption,
  });

  const handleResumeAfterCall = () => {
    dismissResumeDialog();
    togglePause(); // Resume
  };

  const handleStopAfterCall = () => {
    dismissResumeDialog();
    handleStopRecording();
  };

  const handleModeSelect = (mode: MeetingMode) => {
    setMeetingMode(mode);
    setShowModeDialog(false);
  };

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

  // Wake lock management - enhanced for background recording
  const requestWakeLock = async () => {
    if (!('wakeLock' in navigator)) {
      console.log('⚠️ Wake Lock API not supported');
      return;
    }
    try {
      // Release any existing lock first
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
        } catch { /* ignore */ }
      }
      wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      console.log('✅ Wake lock acquired');
      
      // Re-acquire wake lock when page becomes visible again (important for mobile)
      wakeLockRef.current.addEventListener('release', () => {
        console.log('⚠️ Wake lock was released');
        // Try to re-acquire if still recording
        if (isRecording && !isPaused && document.visibilityState === 'visible') {
          requestWakeLock();
        }
      });
    } catch (err: any) {
      // Don't log as error if just not visible - this is expected
      if (err.name === 'NotAllowedError') {
        console.log('⚠️ Wake lock not allowed (page not visible or permission denied)');
      } else {
        console.error('❌ Failed to acquire wake lock:', err);
      }
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log('✅ Wake lock released');
      } catch (err) {
        console.error('Failed to release wake lock:', err);
      }
    }
  };

  // Handle visibility changes - crucial for background recording on mobile
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('📱 App became visible');
        // Re-acquire wake lock when coming back to foreground
        if (isRecording && !isPaused) {
          requestWakeLock();
        }
      } else {
        console.log('📱 App went to background - recording continues');
        // Recording continues in background, wake lock may be released by system
        // but MediaRecorder should keep running
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isRecording, isPaused]);

  // Prevent page from being suspended on iOS Safari
  useEffect(() => {
    if (!isRecording || isPaused) return;

    // Keep-alive ping to prevent iOS Safari from suspending the page
    const keepAliveInterval = setInterval(() => {
      // Access a DOM property to keep the page active
      const _ = document.hidden;
      // Also touch the audio context if we have one
      if (streamRef.current && streamRef.current.active) {
        console.log('🔄 Keep-alive: stream active');
      }
    }, 10000); // Every 10 seconds

    return () => clearInterval(keepAliveInterval);
  }, [isRecording, isPaused]);

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

  // Initialize session and start recording (only after mode is selected)
  useEffect(() => {
    if (!meetingMode) return; // Wait for mode selection

    const initSession = async () => {
      if (!user) return;
      
      if (continuedMeeting) {
        setSessionId(continuedMeeting.id);
        setSelectedFolder(continuedMeeting.folder);
        hasIncrementedCountRef.current = true;
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
      
      startRecording();
    };

    initSession();
    
    return () => {
      stopMediaRecorder();
      stopSpeechRecognition();
      releaseWakeLock();
      noSleep.disable();
    };
  }, [user, meetingMode]);

  // Duration timer (clock-based for reliable mobile behavior)
  useEffect(() => {
    if (!isRecording) {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      return;
    }

    const syncDurationFromClock = () => {
      const startedAt = recordingStartedAtMsRef.current;
      if (!startedAt) return;

      const now = Date.now();
      const pausedMs = totalPausedMsRef.current + (pauseStartedAtMsRef.current ? now - pauseStartedAtMsRef.current : 0);
      const elapsedSec = Math.max(0, Math.floor((now - startedAt - pausedMs) / 1000));

      if (elapsedSec >= MAX_DURATION_SECONDS) {
        setDurationSec(MAX_DURATION_SECONDS);
        handleStopRecording();
        return;
      }

      setDurationSec(elapsedSec);
    };

    // Sync immediately on this tick
    syncDurationFromClock();
    // Then poll every 250ms
    durationIntervalRef.current = setInterval(syncDurationFromClock, 250);

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    };
  }, [isRecording, isPaused]);

  const startRecording = async () => {
    try {
      // Request microphone with settings optimized for continuous background recording
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

      // Keep audio track enabled even when page is backgrounded
      stream.getAudioTracks().forEach(track => {
        track.enabled = true;
        // Some browsers support contentHint for optimization
        if ('contentHint' in track) {
          (track as any).contentHint = 'speech';
        }
      });

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
          // Add to backup system for recovery
          addChunk(event.data, mediaRecorder.mimeType);
          console.log(`📦 Audio chunk received: ${event.data.size} bytes (total chunks: ${audioChunksRef.current.length})`);
        }
      };

      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      
      // Start auto-save backup for reliability
      startAutoSave();

      // Start browser speech recognition for Free/Pro plans
      if (!useAsrMode) {
        startSpeechRecognition();
      }

      // Set recording state BEFORE async wake lock so timer starts immediately
      recordingStartedAtMsRef.current = Date.now();
      totalPausedMsRef.current = 0;
      pauseStartedAtMsRef.current = null;
      setDurationSec(0);
      setIsRecording(true);

      // Fire-and-forget: don't block recording start on wake lock
      requestWakeLock().catch(() => {});
      noSleep.enable();
      
      console.log('✅ Recording started', useAsrMode ? '(ASR mode)' : '(Browser mode)', '| mimeType:', mediaRecorder.mimeType);
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
    stopAutoSave(); // Stop backup timer
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    recordingStartedAtMsRef.current = null;
    pauseStartedAtMsRef.current = null;
    totalPausedMsRef.current = 0;
  };

  const togglePause = () => {
    if (!mediaRecorderRef.current) return;
    
    if (isPaused) {
      mediaRecorderRef.current.resume();
      if (pauseStartedAtMsRef.current) {
        totalPausedMsRef.current += Date.now() - pauseStartedAtMsRef.current;
        pauseStartedAtMsRef.current = null;
      }
      setIsPaused(false);
      requestWakeLock();
      // Resume speech recognition for Free/Pro
      if (!useAsrMode && recognitionRef.current) {
        try { recognitionRef.current.start(); } catch { /* ignore */ }
      }
    } else {
      mediaRecorderRef.current.pause();
      pauseStartedAtMsRef.current = Date.now();
      setIsPaused(true);
      releaseWakeLock();
      // Save backup when pausing for extra safety
      saveBackup();
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
      
      navigate(`/meetings/${testMeetingId}`);
      
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
    const currentTranscript = (liveTranscript + ' ' + interimText).trim();
    if (!useAsrMode && !currentTranscript) {
      toast({
        title: 'Ingen text transkriberad',
        description: 'Försäkra dig om att mikrofonen fungerar och tala tydligt.',
        variant: 'destructive',
      });
      return;
    }

    // Check minimum word count (20 words) for browser mode
    if (!useAsrMode) {
      const wordCount = currentTranscript.split(/\s+/).filter(w => w).length;
      if (wordCount < 20) {
        toast({
          title: 'För kort transkription',
          description: `Minst 20 ord krävs för att generera protokoll. Du har ${wordCount} ord.`,
          variant: 'destructive',
        });
        return;
      }
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
      
      // For ASR mode, we need the audio blob
      const blob = new Blob(audioChunksRef.current, { type: blobMimeType });
      
      // Detailed logging for debugging
      console.log('🎤 Recording complete:');
      console.log('  - Total chunks:', audioChunksRef.current.length);
      console.log('  - Blob size:', blob.size, 'bytes');
      console.log('  - Blob type:', blob.type);
      console.log('  - Expected min size for real recording: 50000+ bytes');
      
      if (blob.size < 100) {
        console.error('❌ CRITICAL: Blob is essentially empty! Recording failed.');
      } else if (blob.size < 50000) {
        console.warn('⚠️ WARNING: Blob is very small, may not contain real audio.');
      }

      // Only check blob size for ASR mode - require at least 50KB for real meeting
      if (useAsrMode && blob.size < 50000) {
        console.error('❌ Audio blob too small for ASR:', blob.size, 'bytes');
        toast({
          title: 'Ljudfilen är för liten',
          description: 'Inspelningen verkar vara tom. Kontrollera mikrofonen och försök igen.',
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
        // Team assignment for enterprise meetings (only include if set, to avoid clearing existing team)
        ...(selectedTeamId ? { teamId: selectedTeamId, enterpriseTeamId: selectedTeamId, accessScope: 'team' as const } : {}),
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
          description: useAsrMode ? 'Transkribering pågår i bakgrunden.' : 'Transkribering klar!',
        });
        
        // Redirect to meeting detail page
        navigate(`/meetings/${meetingId}`);

        // For Enterprise: use background uploader (same as file upload flow)
        if (useAsrMode) {
          console.log('🎤 Enterprise: Starting background upload for ASR...');
          const audioFile = new File([blob], `meeting-${meetingId}.webm`, { type: blob.type });
          startBackgroundUpload(audioFile, meetingId, 'sv');
        } else {
          // For browser mode (Pro), dispatch completion event immediately
          window.dispatchEvent(new CustomEvent('transcriptionComplete', { 
            detail: { meetingId, transcript: finalTranscript } 
          }));
        }
      } else {
        // Free plan - go directly to protocol generation
        console.log('📋 Free user: Direct to protocol generation');
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        // ALWAYS count meeting for free users - skip cache check to ensure it's counted
        if (!hasIncrementedCountRef.current) {
          hasIncrementedCountRef.current = true;
          try {
            console.log('📊 Free user: Counting meeting:', meetingId);
            // Call incrementMeetingCount directly without markCountedIfNeeded to ensure counting
            await incrementMeetingCount(meetingId);
            // Mark as counted in backend
            try {
              await apiClient.updateMeeting(meetingId, { counted: true });
            } catch (e) {
              console.warn('Could not mark meeting as counted:', e);
            }
            await refreshPlan();
            console.log('✅ Free user: Meeting counted successfully');
          } catch (e) {
            console.error('Failed to count meeting:', e);
          }
        }
        
        // Navigate directly to protocol page - no delays, no messages
        navigate('/protocol', { 
          state: { 
            transcript: finalTranscript, 
            aiProtocol: null,
            meetingId
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


  // Loading overlay while saving - only for users with library access
  const canAccessLibraryForOverlay = hasLibraryAccess(userPlan?.plan, isAdmin);
  if (isSaving && canAccessLibraryForOverlay) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <h2 className="text-lg font-medium">Sparar möte...</h2>
        </div>
      </div>
    );
  }

  // Recording View
  if (viewState === 'recording') {
    return (
      <div className="h-[100dvh] bg-background flex flex-col">
        {/* Header */}
        <div className={`border-b border-border/50 bg-background sticky top-0 z-10 flex-shrink-0 ${isNative ? 'pt-safe' : ''}`}>
          <div className="max-w-5xl mx-auto px-4 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div className="relative flex-shrink-0">
                  <div className={`w-2 h-2 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-destructive'}`} />
                  {!isPaused && isRecording && (
                    <div className="absolute inset-0 w-2 h-2 rounded-full bg-destructive animate-ping opacity-60" />
                  )}
                </div>
                {isEditingName ? (
                  <div className="flex gap-1 items-center flex-1 min-w-0">
                    <Input
                      value={meetingName}
                      onChange={(e) => setMeetingName(e.target.value)}
                      onBlur={() => setIsEditingName(false)}
                      onKeyDown={(e) => e.key === "Enter" && setIsEditingName(false)}
                      autoFocus
                      className="h-7 text-sm flex-1"
                    />
                    <Button onClick={() => setIsEditingName(false)} size="sm" variant="ghost" className="h-7 w-7 p-0 flex-shrink-0">
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 group cursor-pointer flex-1 min-w-0" onClick={() => setIsEditingName(true)}>
                    <h1 className="text-sm font-medium truncate text-foreground">{meetingName}</h1>
                    <Edit2 className="w-3 h-3 flex-shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {isBackupEnabled && chunksSaved > 0 && (
                  <Shield className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                )}
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {Math.floor(durationSec / 60)}:{(durationSec % 60).toString().padStart(2, '0')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 min-h-0 overflow-hidden">
          {/* Visualization + Timer group */}
          <div className="flex flex-col items-center gap-4">
            <MinimalAudioAnalyzer
              stream={streamRef.current}
              isActive={isRecording && !isPaused}
              size={160}
            />

            <div className="text-center">
              <div className="font-mono text-4xl font-extralight tracking-tight text-foreground tabular-nums">
                {Math.floor(durationSec / 60)}:{(durationSec % 60).toString().padStart(2, '0')}
              </div>
              <p className={`mt-1.5 text-xs font-medium tracking-wide uppercase ${
                isPaused ? 'text-amber-500' : isTestMode ? 'text-muted-foreground' : 'text-destructive/70'
              }`}>
                {isTestMode ? 'Testläge' : isPaused ? 'Pausad' : 'Spelar in'}
              </p>
            </div>
          </div>

          {/* Name prompt */}
          <div className="mt-6 w-full max-w-sm">
            <VoiceNamePrompt durationSec={durationSec} />
          </div>

          {/* Live Transcript (Free/Pro only) */}
          {!useAsrMode && (liveTranscript || interimText) && (
            <div className="mt-4 w-full max-w-md flex-shrink min-h-0 overflow-hidden" style={{ maxHeight: 'clamp(60px, 12vh, 100px)' }}>
              <div ref={transcriptScrollRef} className="h-full overflow-y-auto rounded-lg bg-muted/20 border border-border/20 px-3 py-2.5 text-sm leading-relaxed">
                <span className="text-foreground/80">{liveTranscript}</span>
                {interimText && (
                  <span className="text-muted-foreground/40 italic">{interimText}</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Controls */}
        <div className="flex-shrink-0 border-t border-border/50 bg-background"
          style={{ paddingBottom: isNative ? 'max(env(safe-area-inset-bottom, 12px), 12px)' : '12px' }}
        >
          <div className="max-w-lg mx-auto px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Button onClick={handleBackClick} variant="ghost" size="sm" className="h-10 px-3 text-muted-foreground text-xs">
                Avbryt
              </Button>
              
              <Button onClick={togglePause} variant="outline" className="flex-1 h-10 rounded-xl text-sm gap-1.5">
                {isPaused ? (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    Återuppta
                  </>
                ) : (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    Pausa
                  </>
                )}
              </Button>

              <Button 
                onClick={handleStopRecording} 
                className="flex-1 h-10 rounded-xl text-sm font-semibold gap-1.5"
              >
                <Square className="w-3.5 h-3.5" />
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

        {/* Meeting Mode Selection Dialog */}
        <MeetingModeDialog
          open={showModeDialog}
          onOpenChange={(open) => {
            if (!open && !meetingMode) {
              onBack();
            }
            setShowModeDialog(open);
          }}
          onSelect={handleModeSelect}
        />

        {/* Call Interruption Resume Dialog */}
        <CallInterruptionDialog
          open={showResumeDialog}
          onContinue={handleResumeAfterCall}
          onStop={handleStopAfterCall}
          durationSec={durationSec}
        />
      </div>
    );
  }

  return null;
};
