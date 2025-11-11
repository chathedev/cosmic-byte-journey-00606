import { useState, useRef, useEffect } from "react";
import { Square, FileText, Pause, Play, Edit2, Check, MicOff, Mic, Clock, Loader2, Radio, ArrowLeft } from "lucide-react";
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
import { AgendaSelectionDialog } from "./AgendaSelectionDialog";
import { generateMeetingTitle } from "@/lib/titleGenerator";
import { RecordingInstructions } from "./RecordingInstructions";

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

interface RecordingViewProps {
  onFinish?: (data: { transcript: string; aiProtocol: AIProtocol | null }) => void;
  onBack: () => void;
  continuedMeeting?: any;
  isFreeTrialMode?: boolean;
  prefetchedMicStream?: MediaStream;
  selectedLanguage?: 'sv-SE' | 'en-US';
}

export const RecordingView = ({ onFinish, onBack, continuedMeeting, isFreeTrialMode = false, prefetchedMicStream, selectedLanguage: initialLanguage = 'sv-SE' }: RecordingViewProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { userPlan, canCreateMeeting, incrementMeetingCount, refreshPlan } = useSubscription();
  const isAtLimit = !!userPlan && userPlan.meetingsLimit !== null && userPlan.meetingsUsed >= userPlan.meetingsLimit;
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(!!continuedMeeting);
  const [transcript, setTranscript] = useState(continuedMeeting?.transcript || "");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isGeneratingProtocol, setIsGeneratingProtocol] = useState(false);
  const [sessionId, setSessionId] = useState<string>(continuedMeeting?.id || "");
  const [meetingName, setMeetingName] = useState(continuedMeeting?.title || "Namnlöst möte");
  const [selectedFolder, setSelectedFolder] = useState(continuedMeeting?.folder || "Allmänt");
  const [selectedAgendaId, setSelectedAgendaId] = useState<string | undefined>(continuedMeeting?.agendaId);
  const [isEditingName, setIsEditingName] = useState(false);
  const [hasSpoken, setHasSpoken] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [showShortTranscriptDialog, setShowShortTranscriptDialog] = useState(false);
  const [showMaxDurationDialog, setShowMaxDurationDialog] = useState(false);
  const [showExitWarning, setShowExitWarning] = useState(false);
  const MAX_DURATION_SECONDS = 28800; // 8 hours instead of 2
  const MIN_DURATION_SECONDS = 5;
  const MIN_WORD_COUNT = 5;
  const recognitionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isRecognitionActiveRef = useRef(false);
  const lastSavedDataRef = useRef<string>('');
  const isSavingRef = useRef(false);
  const createdOnceRef = useRef(false);
  const transcriptViewRef = useRef<HTMLDivElement>(null);
  const createdAtRef = useRef<string>(continuedMeeting?.createdAt || new Date().toISOString());
  const recordingStartTimeRef = useRef<number>(Date.now());
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState('');
  const hasIncrementedCountRef = useRef(false);
  const [showAgendaDialog, setShowAgendaDialog] = useState(false);
  const [pendingMeetingData, setPendingMeetingData] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isFinalizingRef = useRef(false);
  const [selectedLanguage, setSelectedLanguage] = useState<'sv-SE' | 'en-US'>(initialLanguage);
  const wakeLockRef = useRef<any>(null);
  const [showInstructions, setShowInstructions] = useState(false);

  // Check if user has seen instructions before
  useEffect(() => {
    const hasSeenInstructions = localStorage.getItem('hasSeenRecordingInstructions');
    if (!hasSeenInstructions && !continuedMeeting) {
      setShowInstructions(true);
    }
  }, [continuedMeeting]);

  // Removed automatic upgrade dialog - only show when trying to create NEW meeting

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      toast({
        title: "Inte stödd",
        description: "Din webbläsare stöder inte rösttranskribering. Använd Google Chrome.",
        variant: "destructive",
      });
      return;
    }

    const recognition = new SpeechRecognition();
    // Use selected language
    recognition.lang = selectedLanguage;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    
    // Enhanced recognition settings for better precision
    if ('webkitSpeechRecognition' in window) {
      (recognition as any).serviceURI = undefined; // Use default service
    }

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptText = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcriptText + ' ';
        } else {
          interim += transcriptText;
        }
      }

      if (final) {
        console.log('Final transcript:', final);
        setTranscript(prev => prev + final);
        setInterimTranscript('');
        setHasSpoken(true);
      }
      
      if (interim) {
        console.log('Interim transcript:', interim);
        setInterimTranscript(interim);
      }
    };

    recognition.onend = () => {
      console.log('Recognition ended - auto-restart enabled');
      isRecognitionActiveRef.current = false;
      
      // Always attempt to restart if recording is active (more aggressive restart)
      if (isRecording && !isPaused && !isMuted && recognitionRef.current) {
        const restartAttempt = () => {
          if (!isRecording || isPaused || isMuted || !recognitionRef.current) return;
          
          if (!isRecognitionActiveRef.current) {
            try {
              recognitionRef.current.start();
              isRecognitionActiveRef.current = true;
              console.log('✅ Recognition auto-restarted');
            } catch (error: any) {
              console.error('❌ Restart failed:', error);
              if (error.message?.includes('already started')) {
                isRecognitionActiveRef.current = true;
                console.log('✅ Recognition already active');
              } else {
                // Retry after a short delay if failed
                setTimeout(restartAttempt, 300);
              }
            }
          }
        };
        
        setTimeout(restartAttempt, 100);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Taligenkänningsfel:', event.error);
      isRecognitionActiveRef.current = false;
      
      if (event.error === 'aborted') {
        console.log('Recognition aborted - will restart if needed');
        return;
      }
      
      if (event.error === 'no-speech') {
        // Don't show toast for no-speech, it's too noisy - just continue listening
        console.log('No speech detected, continuing...');
      } else if (event.error === 'audio-capture') {
        toast({
          title: "Mikrofonfel",
          description: "Kunde inte komma åt mikrofonen. Kontrollera dina inställningar.",
          variant: "destructive",
        });
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [toast, isPaused, isMuted, selectedLanguage]);

  // Wake Lock functions with auto-reacquire
  const requestWakeLock = async () => {
    if (!('wakeLock' in navigator)) {
      console.log('Wake Lock API not supported');
      return;
    }
    
    try {
      const wakeLock = await (navigator as any).wakeLock.request('screen');
      wakeLockRef.current = wakeLock;
      
      wakeLock.addEventListener('release', async () => {
        console.log('⚠️ Wake lock released - attempting to reacquire');
        wakeLockRef.current = null;
        
        // Auto-reacquire if still recording
        if (isRecording && !isPaused) {
          setTimeout(async () => {
            if (isRecording && !isPaused && !wakeLockRef.current) {
              await requestWakeLock();
            }
          }, 500);
        }
      });
      
      console.log('✅ Wake lock acquired');
    } catch (err) {
      console.error('❌ Failed to acquire wake lock:', err);
      // Retry after delay
      if (isRecording && !isPaused) {
        setTimeout(() => requestWakeLock(), 2000);
      }
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log('Wake lock manually released');
      } catch (err) {
        console.error('Failed to release wake lock:', err);
      }
    }
  };

  const [folders, setFolders] = useState<string[]>([]);
  
  useEffect(() => {
    const loadFolders = async () => {
      if (!user) return;
      const list = await meetingStorage.getFolders(user.uid);
      const names = list.map(f => f.name);
      setFolders(names.length ? names : ["Allmänt"]);
    };
    loadFolders();
  }, [user]);

  // Initialize recording start time when recording actually starts
  useEffect(() => {
    if (isRecording && !isPaused && !isMuted && !continuedMeeting) {
      // Only set the start time once when actual recording begins
      if (!createdAtRef.current || createdAtRef.current === new Date().toISOString()) {
        const actualStartTime = new Date().toISOString();
        createdAtRef.current = actualStartTime;
        recordingStartTimeRef.current = Date.now();
        console.log('🎤 Recording started at:', actualStartTime);
      }
    }
  }, [isRecording, isPaused, isMuted, continuedMeeting]);

  useEffect(() => {
    if (!sessionId || !user || !transcript.trim()) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      const dataHash = JSON.stringify({
        transcript,
        title: meetingName,
        folder: selectedFolder,
        agendaId: selectedAgendaId,
      });
      
      if (dataHash === lastSavedDataRef.current || isSavingRef.current) {
        return;
      }
      
      isSavingRef.current = true;
      lastSavedDataRef.current = dataHash;
      
      const now = new Date().toISOString();
      const meeting = {
        id: sessionId,
        title: meetingName,
        folder: selectedFolder,
        transcript,
        protocol: '',
        createdAt: createdAtRef.current,
        updatedAt: now,
        userId: user.uid,
        agendaId: selectedAgendaId,
      };
      
      try {
        const newId = await meetingStorage.saveMeeting(meeting as any);
        if (newId !== sessionId) {
          setSessionId(newId);
        }
      } catch (e) {
        console.warn('Auto-save failed:', e);
        lastSavedDataRef.current = '';
      } finally {
        isSavingRef.current = false;
      }
    }, 1500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [transcript, meetingName, selectedFolder, sessionId, user]);

  useEffect(() => {
    const el = transcriptViewRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript, interimTranscript]);

  // Mark meeting as used as soon as speech recognition yields final text
  useEffect(() => {
    const run = async () => {
      if (hasIncrementedCountRef.current) return;
      if (!hasSpoken) return;
      if (!user || !sessionId) return;

      try {
        // Lock early to prevent race conditions on rapid final transcripts
        hasIncrementedCountRef.current = true;
        const now = new Date().toISOString();
        const fullTranscript = `${transcript} ${interimTranscript}`.trim();
        const meeting = {
          id: sessionId,
          title: meetingName,
          folder: selectedFolder,
          transcript: fullTranscript,
          protocol: '',
          createdAt: createdAtRef.current,
          updatedAt: now,
          userId: user.uid,
        };
        const newId = await meetingStorage.saveMeeting(meeting as any);
        const finalId = newId && newId !== sessionId ? newId : sessionId;
        if (newId && newId !== sessionId) {
          setSessionId(newId);
        }

        // ALWAYS count meeting exactly once per session
        console.log('📊 Incrementing meeting count (first speech) - ONCE');
        await incrementMeetingCount(finalId);
        await refreshPlan();
      } catch (err) {
        // Allow a retry on failure
        hasIncrementedCountRef.current = false;
        console.warn('Failed to mark meeting used on start:', err);
      }
    };
    run();
  }, [hasSpoken, user, sessionId, transcript, interimTranscript, meetingName, selectedFolder, incrementMeetingCount, refreshPlan]);

  useEffect(() => {
    const initSession = async () => {
      if (!user) return;
      
      if (continuedMeeting) {
        setSessionId(continuedMeeting.id);
        setSelectedFolder(continuedMeeting.folder);
        return;
      }

      if (createdOnceRef.current || sessionId) return;
      
      const { allowed, reason } = await canCreateMeeting();
      if (!allowed) {
        setUpgradeReason(reason || 'Du har nått din gräns för möten');
        setShowUpgradeDialog(true);
        return;
      }

      const tempId = 'temp-' + Date.now();
      
      createdOnceRef.current = true;
      const now = new Date().toISOString();
      createdAtRef.current = now;
      const meeting = {
        id: tempId,
        title: 'Namnlöst möte',
        folder: 'Allmänt',
        transcript: '',
        protocol: '',
        createdAt: now,
        updatedAt: now,
        userId: user.uid,
      };
      setSessionId(tempId);
      setSelectedFolder('Allmänt');
      
      if (!isSavingRef.current) {
        isSavingRef.current = true;
        meetingStorage.saveMeeting(meeting as any)
          .then(async (newId) => { 
            if (newId && newId !== tempId) {
              setSessionId(newId);
            }
            lastSavedDataRef.current = JSON.stringify({
              transcript: meeting.transcript,
              title: meeting.title,
              folder: meeting.folder,
            });
          })
          .catch((err) => {
            console.warn('Could not save initial meeting:', err);
          })
          .finally(() => {
            isSavingRef.current = false;
          });
      }
    };

    initSession();
  }, [user, continuedMeeting]);


  useEffect(() => {
    if (!sessionId) return;

    const startRecording = async () => {
      try {
        // In-person: request microphone only (or use prefetched)
        console.log('Starting in-person meeting recording...');
        const stream = prefetchedMicStream ?? await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000,
            channelCount: 1,
            // Enhanced mic precision
            latency: 0,
            volume: 1.0,
          } as MediaTrackConstraints,
        });
        streamRef.current = stream;
        console.log('In-person meeting stream initialized successfully');

        // Start speech recognition
        if (recognitionRef.current && !isPaused && !isMuted && !isRecognitionActiveRef.current) {
          try {
            recognitionRef.current.start();
            isRecognitionActiveRef.current = true;
            setIsRecording(true);
            console.log('Speech recognition started successfully');
          } catch (error: any) {
            console.error('Error starting speech recognition:', error);
            if (error.message?.includes('already started')) {
              isRecognitionActiveRef.current = true;
            }
            setIsRecording(true);
          }
        } else {
          setIsRecording(true);
        }

        // Request wake lock to keep screen on
        await requestWakeLock();
      } catch (error) {
        console.error('Error starting recording:', error);
        const name = (error as any)?.name || '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          toast({
            title: 'Behörighet nekad',
            description: 'Tivly behöver tillstånd till mikrofon. Kontrollera webbläsarens inställningar och försök igen.',
            variant: 'destructive',
          });
          onBack();
          return;
        }
        toast({
          title: 'Ett oväntat fel uppstod',
          description: (error as any)?.message || 'Kunde inte starta inspelningen.',
          variant: 'destructive',
        });
      }
    };
    
    startRecording();

    return () => {
      console.log('Cleaning up recording streams...');
      
      // Release wake lock on cleanup
      releaseWakeLock();
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
      
      toast({
        title: 'Inspelningen avslutad',
        description: 'Bearbetar text...',
      });
    };
  }, [sessionId, isPaused, isMuted, toast, prefetchedMicStream, selectedLanguage]);
  

  useEffect(() => {
    if (isRecording && !isPaused) {
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = setInterval(() => {
        setDurationSec((s) => {
          const newDuration = s + 1;
          if (newDuration >= MAX_DURATION_SECONDS) {
            setShowMaxDurationDialog(true);
            stopRecording();
          }
          return newDuration;
        });
      }, 1000);
    } else {
      if (durationIntervalRef.current) { clearInterval(durationIntervalRef.current); durationIntervalRef.current = null; }
    }
    return () => {
      if (durationIntervalRef.current) { clearInterval(durationIntervalRef.current); durationIntervalRef.current = null; }
    };
  }, [isRecording, isPaused]);

  const addTestTranscript = () => {
    const testText = "Detta är en testtranskription på sjuttio ord för att testa protokollgenerering utan att behöva spela in ett riktigt möte vilket sparar tid och gör det enkelt att demonstrera funktionaliteten snabbt och effektivt för användare som vill se hur systemet fungerar direkt utan att vänta eller prata in text manuellt.";
    setTranscript(prev => prev + (prev ? ' ' : '') + testText);
    setHasSpoken(true);
    toast({
      title: "Testtext tillagd",
      description: "70 ord har lagts till i transkriptionen",
    });
  };

  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      if (recognitionRef.current && !isRecognitionActiveRef.current) {
        setTimeout(() => {
          if (recognitionRef.current && !isRecognitionActiveRef.current && !isMuted) {
            try {
              recognitionRef.current.start();
              isRecognitionActiveRef.current = true;
            } catch (error: any) {
              if (error.message?.includes('already started')) {
                isRecognitionActiveRef.current = true;
              }
            }
          }
        }, 100);
      }
    } else {
      if (recognitionRef.current && isRecognitionActiveRef.current) {
        recognitionRef.current.stop();
        isRecognitionActiveRef.current = false;
      }
      setIsMuted(true);
    }
  };

  const togglePause = () => {
    if (isPaused) {
      setIsPaused(false);
      if (recognitionRef.current && !isMuted && !isRecognitionActiveRef.current) {
        setTimeout(() => {
          if (recognitionRef.current && !isMuted && !isRecognitionActiveRef.current && !isPaused) {
            try {
              recognitionRef.current.start();
              isRecognitionActiveRef.current = true;
            } catch (error: any) {
              if (error.message?.includes('already started')) {
                isRecognitionActiveRef.current = true;
              }
            }
          }
        }, 100);
      }
      if (streamRef.current) {
        streamRef.current.getAudioTracks().forEach(track => {
          track.enabled = true;
        });
      }
      // Re-acquire wake lock when resuming
      requestWakeLock();
    } else {
      if (recognitionRef.current && isRecognitionActiveRef.current) {
        recognitionRef.current.stop();
        isRecognitionActiveRef.current = false;
      }
      if (streamRef.current) {
        streamRef.current.getAudioTracks().forEach(track => {
          track.enabled = false;
        });
      }
      setIsPaused(true);
      // Release wake lock when paused to save battery
      releaseWakeLock();
    }
  };

  const saveToLibrary = async () => {
    if (isFinalizingRef.current) return;
    isFinalizingRef.current = true;
    setIsSaving(true);

    // Stop recording first
    setIsRecording(false);
    setIsPaused(false);
    await releaseWakeLock();
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      isRecognitionActiveRef.current = false;
    }
    if (streamRef.current) {
      try { streamRef.current.getTracks().forEach(track => track.stop()); } catch {}
      streamRef.current = null;
    }

    const fullTranscript = (transcript + interimTranscript).trim();
    
    if (!fullTranscript.trim() || !user || !sessionId) {
      toast({
        title: 'Ingen text',
        description: 'Ingen transkription inspelad än.',
        variant: 'destructive',
      });
      setIsSaving(false);
      isFinalizingRef.current = false;
      return;
    }
    
    const now = new Date().toISOString();
    const meeting = {
      id: sessionId,
      title: meetingName,
      folder: selectedFolder,
      transcript: fullTranscript,
      protocol: '',
      createdAt: createdAtRef.current,
      updatedAt: now,
      userId: user.uid,
      isCompleted: true,
      agendaId: selectedAgendaId,
    };

    try {
      const newId = await meetingStorage.saveMeeting(meeting as any);
      const finalId = newId && newId !== sessionId ? newId : sessionId;
      if (newId && newId !== sessionId) {
        setSessionId(newId);
      }
      toast({
        title: 'Sparat!',
        description: `"${meetingName}" har sparats i biblioteket under ${selectedFolder}.`,
      });
      handleBackClick();
    } catch (error) {
      console.error('Error saving to library:', error);
      toast({
        title: 'Fel vid sparning',
        description: 'Kunde inte spara till biblioteket. Försök igen.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
      isFinalizingRef.current = false;
    }
  };

  const handleBackClick = () => {
    // Allow exit anytime - no blocking
    if (userPlan?.plan === 'free' && transcript && !isFinalizingRef.current) {
      setShowExitWarning(true);
      return;
    }
    onBack();
  };

  const stopRecording = async () => {
    if (isFinalizingRef.current) return;
    isFinalizingRef.current = true;

    let finalTranscript = (transcript + interimTranscript).trim();

    // Stop recognition
    setIsRecording(false);
    // Release wake lock when stopping
    await releaseWakeLock();
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      isRecognitionActiveRef.current = false;
    }

    // Stop stream
    if (streamRef.current) {
      try { streamRef.current.getTracks().forEach((t) => t.stop()); } catch {}
      streamRef.current = null;
    }

    // Validate transcript length
    if (!finalTranscript) {
      toast({ title: 'Ingen text', description: 'Ingen transkription inspelad.', variant: 'destructive' });
      handleBackClick();
      isFinalizingRef.current = false;
      return;
    }
    const wordCount = finalTranscript.split(/\s+/).length;
    if (wordCount < 30) {
      setShowShortTranscriptDialog(true);
      isFinalizingRef.current = false;
      return;
    }

    // Generate AI title
    let aiTitle = meetingName;
    try {
      aiTitle = await generateMeetingTitle(finalTranscript);
    } catch (e) {
      console.warn('Failed to generate AI title, using manual name:', e);
      aiTitle = meetingName || `Möte ${new Date().toLocaleDateString('sv-SE')}`;
    }

    // Save meeting
    const now = new Date().toISOString();
    let savedId = sessionId;
    try {
      const newId = await meetingStorage.saveMeeting({
        id: sessionId,
        title: aiTitle,
        folder: selectedFolder,
        transcript: finalTranscript,
        protocol: '',
        createdAt: createdAtRef.current,
        updatedAt: now,
        userId: user?.uid || '',
        isCompleted: true,
        agendaId: selectedAgendaId,
      } as any);
      if (newId && newId !== sessionId) {
        setSessionId(newId);
        savedId = newId;
      }
    } catch (e) {
      console.warn('Final save failed:', e);
    }
    // Navigate
    if (userPlan?.plan === 'free') {
      navigate(`/generate-protocol?meetingId=${savedId}&title=${encodeURIComponent(aiTitle || `Möte ${new Date().toLocaleDateString('sv-SE')}`)}`);
      isFinalizingRef.current = false;
      return;
    }

    setPendingMeetingData({
      id: savedId,
      transcript: finalTranscript,
      title: aiTitle || `Möte ${new Date().toLocaleDateString('sv-SE')}`,
      createdAt: createdAtRef.current,
    });
    setShowAgendaDialog(true);
    isFinalizingRef.current = false;
  };

  const proceedWithShortTranscript = async () => {
    setShowShortTranscriptDialog(false);
    
    setIsRecording(false);
    // Release wake lock
    await releaseWakeLock();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      isRecognitionActiveRef.current = false;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    const combined = `${transcript} ${interimTranscript}`.trim();
    const wordCount = combined ? combined.split(/\s+/).length : 0;
    
    if (wordCount < MIN_WORD_COUNT) {
      setShowShortTranscriptDialog(true);
      return;
    }

    const fullTranscript = transcript + interimTranscript;
    
    // Generate AI-powered title
    let aiTitle = meetingName;
    try {
      aiTitle = await generateMeetingTitle(fullTranscript);
    } catch (e) {
      console.warn('Failed to generate AI title, using manual name:', e);
      aiTitle = meetingName || `Möte ${new Date().toLocaleDateString('sv-SE')}`;
    }

    const now = new Date().toISOString();
    let savedId: string | undefined;
    try {
      const createdId = await meetingStorage.saveMeeting({
        id: sessionId,
        title: aiTitle,
        folder: selectedFolder,
        transcript: fullTranscript,
        protocol: '',
        createdAt: createdAtRef.current,
        updatedAt: now,
        userId: user?.uid || '',
        isCompleted: true,
      } as any);

      if (createdId && createdId !== sessionId) {
        setSessionId(createdId);
        savedId = createdId;
      } else {
        savedId = sessionId;
      }
    } catch (e) {
      console.warn('Failed to save meeting:', e);
      savedId = sessionId;
    }
    
    // Check protocol count BEFORE navigating
    try {
      const meeting = await meetingStorage.getMeeting(savedId || sessionId);
      const currentProtocolCount = meeting?.protocolCount || 0;
      
      if (currentProtocolCount >= 1) {
        toast({
          title: "Protokoll redan genererat",
          description: "Du har redan genererat ett protokoll för detta möte.",
          variant: "destructive"
        });
        return;
      }
    } catch (error) {
      console.error('Error checking protocol count:', error);
      // Continue anyway if check fails
    }
    
    // For free users, skip agenda selection and go directly to protocol generation
    if (userPlan?.plan === 'free') {
      navigate(`/generate-protocol?meetingId=${savedId}&title=${encodeURIComponent(meetingName || `Möte ${new Date().toLocaleDateString('sv-SE')}`)}`);
      return;
    }

    // Show agenda selection dialog for paid users
    setPendingMeetingData({
      id: savedId,
      transcript: fullTranscript,
      title: meetingName || `Möte ${new Date().toLocaleDateString('sv-SE')}`,
      createdAt: createdAtRef.current,
    });
    setShowAgendaDialog(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
      {/* Minimalistic Header */}
      <div className="border-b bg-background/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className={`w-2 h-2 rounded-full transition-all ${
                !isPaused && !isMuted ? 'bg-red-500 animate-pulse' : 'bg-muted-foreground/40'
              }`} />
              {isEditingName ? (
                <div className="flex gap-2 items-center flex-1 min-w-0">
                  <Input
                    value={meetingName}
                    onChange={(e) => setMeetingName(e.target.value)}
                    onBlur={() => setIsEditingName(false)}
                    onKeyDown={(e) => e.key === "Enter" && setIsEditingName(false)}
                    autoFocus
                    className="h-8 text-sm"
                  />
                  <Button onClick={() => setIsEditingName(false)} size="sm" variant="ghost" className="h-8 w-8 p-0">
                    <Check className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group cursor-pointer flex-1 min-w-0" onClick={() => setIsEditingName(true)}>
                  <h1 className="text-sm font-medium truncate">{meetingName}</h1>
                  <Edit2 className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="font-mono text-xs">
                  {Math.floor(durationSec / 60)}:{(durationSec % 60).toString().padStart(2, '0')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full p-4 gap-4">
        
        
        {/* Centered Recording Interface */}
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-3xl space-y-6">
            
            {/* Recording Status Card */}
            <div className="bg-card rounded-xl p-8 border shadow-sm">
              <div className="flex flex-col items-center text-center space-y-5">
                {/* Microphone Icon with Animation */}
                <div className="relative">
                  {!isPaused && !isMuted && (
                    <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-20" />
                  )}
                  <div className={`w-24 h-24 rounded-full flex items-center justify-center transition-all ${
                    !isPaused && !isMuted 
                      ? 'bg-red-500 shadow-lg shadow-red-500/30' 
                      : 'bg-muted'
                  }`}>
                    <Mic className={`w-12 h-12 transition-all ${
                      !isPaused && !isMuted ? 'text-white' : 'text-muted-foreground'
                    }`} />
                  </div>
                </div>

                {/* Status Text */}
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold">
                    {isMuted ? 'Mikrofon avstängd' : isPaused ? 'Pausad' : 'Inspelning pågår'}
                  </h2>
                  <p className="text-sm text-muted-foreground max-w-md">
                    {isMuted 
                      ? 'Klicka på "Slå på" nedan för att aktivera mikrofonen och börja spela in ditt möte' 
                      : isPaused 
                        ? 'Inspelningen är pausad. Tryck "Återuppta" för att fortsätta spela in'
                        : 'Tala tydligt in ditt möte. Texten transkriberas i realtid nedan'}
                  </p>
                </div>
              </div>
            </div>

            {/* Live Transcript View */}
            <div className="bg-card rounded-xl p-5 border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Transkription
                </h3>
                <Select value={selectedFolder} onValueChange={setSelectedFolder}>
                  <SelectTrigger className="h-8 w-[140px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {folders.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div 
                ref={transcriptViewRef}
                className="h-56 overflow-y-auto bg-muted/30 rounded-lg p-4 text-sm leading-relaxed"
              >
                {transcript || interimTranscript ? (
                  <div className="space-y-2">
                    <p className="whitespace-pre-wrap">{transcript}</p>
                    {interimTranscript && (
                      <p className="text-muted-foreground/60 italic whitespace-pre-wrap">{interimTranscript}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground/40 text-center py-16 text-xs">
                    Börja tala så visas texten här...
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Simplified Bottom Controls */}
      <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t shadow-lg">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Back Button */}
            <Button
              onClick={handleBackClick}
              variant="ghost"
              size="lg"
              className="h-12"
              title="Gå tillbaka till startsidan"
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Tillbaka
            </Button>

            {/* Recording Controls */}
            <div className="flex items-center gap-3">
              {/* Pause/Resume Button */}
              {!isMuted && (
                <Button
                  onClick={togglePause}
                  variant="outline"
                  size="lg"
                  disabled={isGeneratingProtocol || isSaving}
                  className="h-12 min-w-[140px]"
                  title={isPaused ? "Återuppta inspelningen" : "Pausa inspelningen"}
                >
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
              )}

              <Button
                onClick={stopRecording}
                variant="default"
                size="lg"
                disabled={isGeneratingProtocol || isSaving}
                className="h-12 min-w-[180px] bg-red-500 hover:bg-red-600"
                title="Avsluta inspelningen och generera mötesprotokoll automatiskt"
              >
                {isGeneratingProtocol ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Genererar...
                  </>
                ) : (
                  <>
                    <Square className="w-5 h-5 mr-2" />
                    Avsluta & Generera
                  </>
                )}
              </Button>

              {userPlan?.plan !== 'free' && (
                <Button
                  onClick={saveToLibrary}
                  variant="outline"
                  size="lg"
                  disabled={isSaving || isGeneratingProtocol}
                  className="h-12 min-w-[160px]"
                  title="Spara endast transkriptionen till biblioteket utan att generera protokoll"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Sparar...
                    </>
                  ) : (
                    <>
                      <FileText className="w-5 h-5 mr-2" />
                      Spara
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Agenda Selection Dialog */}
      {pendingMeetingData && (
        <AgendaSelectionDialog
          open={showAgendaDialog}
          onOpenChange={setShowAgendaDialog}
          meetingData={pendingMeetingData}
        />
      )}

      {/* Upgrade Dialog */}
      <SubscribeDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog} />

      {/* Short Transcript Warning */}
      <AlertDialog open={showShortTranscriptDialog} onOpenChange={setShowShortTranscriptDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kort transkription</AlertDialogTitle>
            <AlertDialogDescription>
              Din transkription är väldigt kort (under 30 ord). AI-protokollet fungerar bäst med 50+ ord - ju längre desto bättre resultat. 
              Du kan fortsätta spela in för bättre resultat, eller generera protokoll nu ändå.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowShortTranscriptDialog(false)}>
              Fortsätt spela in
            </AlertDialogCancel>
            <AlertDialogAction onClick={proceedWithShortTranscript}>
              Generera protokoll nu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Exit Warning for Free Users */}
      <AlertDialog open={showExitWarning} onOpenChange={setShowExitWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Varning - Mötet sparas inte</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                <strong>Om du lämnar nu kommer ditt möte inte att sparas.</strong>
              </p>
              <p>
                För att spara mötet måste du antingen:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Skapa ett protokoll (tryck "Slutför")</li>
                <li>Uppgradera till Standard eller Plus för att spara utan att generera protokoll</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowExitWarning(false)}>
              Fortsätt spela in
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setShowExitWarning(false);
              onBack();
            }} className="bg-destructive hover:bg-destructive/90">
              Lämna utan att spara
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Max Duration Warning */}
      <AlertDialog open={showMaxDurationDialog} onOpenChange={setShowMaxDurationDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Maximal inspelningstid nådd</AlertDialogTitle>
            <AlertDialogDescription>
              Du har nått maximal inspelningstid på 2 timmar. Mötet har stoppats automatiskt och sparats.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => {
              setShowMaxDurationDialog(false);
              handleBackClick();
            }}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RecordingInstructions 
        isOpen={showInstructions} 
        onClose={() => setShowInstructions(false)} 
      />
    </div>
  );
};
