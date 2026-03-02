// MeetingRecorder - Embedded recorder component for the Meeting-First flow
// Records audio directly on the meeting page, then uploads to /asr/recording-upload

import { useState, useRef, useEffect } from "react";
import { Square, Pause, Play, Edit2, Check, AlertTriangle, Shield, Monitor, Users, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

import { MinimalAudioAnalyzer } from "./MinimalAudioAnalyzer";
import { RecordingInstructions } from "./RecordingInstructions";
import { VoiceNamePrompt } from "./VoiceNamePrompt";
import { MeetingModeDialog, type MeetingMode } from "./MeetingModeDialog";
import { CallInterruptionDialog } from "./CallInterruptionDialog";
import { isNativeApp } from "@/utils/capacitorDetection";
import { uploadRecordingToAsr } from "@/lib/asrRecordingUpload";
import { apiClient } from "@/lib/api";
import { debugLog, debugError } from "@/lib/debugLogger";
import { useRecordingBackup } from "@/hooks/useRecordingBackup";
import { useCallInterruptionDetector } from "@/hooks/useCallInterruptionDetector";
import { digitalRecordingStreams } from "@/lib/digitalRecordingStreams";
import { noSleep } from "@/lib/noSleep";

interface MeetingRecorderProps {
  meetingId: string;
  meetingTitle: string;
  onTitleChange: (title: string) => void;
  onRecordingComplete: () => void;
  onCancel: () => void;
  useAsrMode: boolean;
  language?: string;
  isDigitalRecording?: boolean;
  initialMeetingMode?: MeetingMode | null;
  showArrivalStartDialog?: boolean;
}

export const MeetingRecorder = ({
  meetingId,
  meetingTitle,
  onTitleChange,
  onRecordingComplete,
  onCancel,
  useAsrMode,
  language = 'sv',
  isDigitalRecording = false,
  initialMeetingMode = null,
  showArrivalStartDialog = false,
}: MeetingRecorderProps) => {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [localTitle, setLocalTitle] = useState(meetingTitle);
  const [meetingMode, setMeetingMode] = useState<MeetingMode | null>(initialMeetingMode ?? (isDigitalRecording ? 'phone-call' : null));
  const [showModeDialog, setShowModeDialog] = useState(!isDigitalRecording && !initialMeetingMode);
  const [showStartMeetingDialog, setShowStartMeetingDialog] = useState(
    showArrivalStartDialog && !!initialMeetingMode && !isDigitalRecording
  );

  const meetingModeLabel = meetingMode === 'in-person'
    ? 'Fysiskt möte'
    : meetingMode === 'phone-call'
      ? 'Telefonmöte'
      : meetingMode === 'digital'
        ? 'Teams-möte (bot)'
        : '';

  const MeetingModeIcon = meetingMode === 'in-person'
    ? Users
    : meetingMode === 'phone-call'
      ? Phone
      : Monitor;

  const shouldShowStartOverlay = showStartMeetingDialog && !!meetingMode && !isRecording && !showModeDialog;

  debugLog('[🎬 MeetingRecorder] render — isRecording:', isRecording, 'isPaused:', isPaused, 'showModeDialog:', showModeDialog, 'showStartMeetingDialog:', showStartMeetingDialog, 'meetingMode:', meetingMode);
  // Real-time transcript for Free/Pro plans (browser speech recognition)
  const [liveTranscript, setLiveTranscript] = useState<string>("");
  const [interimText, setInterimText] = useState<string>("");

  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const durationRafRef = useRef<number | null>(null);
  const recordingStartedAtMsRef = useRef<number | null>(null);
  const totalPausedMsRef = useRef(0);
  const pauseStartedAtMsRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const isSavingRef = useRef(false);
  const hasStartedRecordingRef = useRef(false);
  const hasAutoStoppedRef = useRef(false);

  const MAX_DURATION_SECONDS = 28800; // 8 hours
  const isNative = isNativeApp();

  // Recording backup for reliability
  const {
    addChunk,
    saveBackup,
    startAutoSave,
    stopAutoSave,
    chunksSaved,
    isBackupEnabled,
  } = useRecordingBackup({
    meetingId: meetingId,
    enabled: true,
    saveInterval: 15000,
    onBackupSaved: (count, bytes) => {
      console.log(`🛡️ MeetingRecorder auto-backup: ${count} chunks, ${bytes} bytes`);
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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      requestWakeLock();
      if (!useAsrMode && recognitionRef.current) {
        try { recognitionRef.current.start(); } catch { /* ignore */ }
      }
    }
  };

  const handleStopAfterCall = () => {
    dismissResumeDialog();
    handleStopRecording();
  };

  useEffect(() => {
    debugLog('[🎬 MeetingRecorder] popup state:', {
      showModeDialog,
      showStartMeetingDialog,
      meetingMode,
      showArrivalStartDialog,
      initialMeetingMode,
    });
  }, [showModeDialog, showStartMeetingDialog, meetingMode, showArrivalStartDialog, initialMeetingMode]);

  // Check instructions
  useEffect(() => {
    const hasSeenInstructions = localStorage.getItem('hasSeenRecordingInstructions');
    if (!hasSeenInstructions && !showArrivalStartDialog) {
      setShowInstructions(true);
    }
  }, [showArrivalStartDialog]);

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
      if (wakeLockRef.current) {
        try { await wakeLockRef.current.release(); } catch { /* ignore */ }
      }
      wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      console.log('✅ Wake lock acquired');
      
      wakeLockRef.current.addEventListener('release', () => {
        if (isRecording && !isPaused && document.visibilityState === 'visible') {
          requestWakeLock();
        }
      });
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        console.error('❌ Failed to acquire wake lock:', err);
      }
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      } catch { /* ignore */ }
    }
  };

  // Handle visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isRecording && !isPaused) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isRecording, isPaused]);

  // Keep-alive ping for iOS Safari
  useEffect(() => {
    if (!isRecording || isPaused) return;
    const keepAliveInterval = setInterval(() => {
      if (streamRef.current && streamRef.current.active) {
        console.log('🔄 Keep-alive: stream active');
      }
    }, 10000);
    return () => clearInterval(keepAliveInterval);
  }, [isRecording, isPaused]);

  // Initialize browser speech recognition for Free/Pro plans
  const startSpeechRecognition = () => {
    if (useAsrMode) return; // Enterprise uses backend ASR
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = language === 'en' ? 'en-US' : 'sv-SE';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        setLiveTranscript(prev => prev + finalTranscript);
      }
      setInterimText(interimTranscript);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'no-speech' || event.error === 'aborted') {
        // Restart recognition
        try { recognition.start(); } catch { /* ignore */ }
      }
    };

    recognition.onend = () => {
      if (isRecording && !isPaused && recognitionRef.current) {
        try { recognition.start(); } catch { /* ignore */ }
      }
    };

    recognitionRef.current = recognition;
    try { recognition.start(); } catch { /* ignore */ }
  };

  const stopSpeechRecognition = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
  };

  // Auto-start only for preconfigured digital recording flow
  useEffect(() => {
    if (!isDigitalRecording || !meetingMode || hasStartedRecordingRef.current) return;
    void startRecording();
  }, [isDigitalRecording, meetingMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMediaRecorder();
      stopSpeechRecognition();
      releaseWakeLock();
      noSleep.disable();
    };
  }, []);

  const handleModeSelect = (mode: MeetingMode) => {
    debugLog('[🎬 MeetingRecorder] handleModeSelect:', mode);
    setMeetingMode(mode);
    setShowModeDialog(false);
    setShowInstructions(false);
    setShowStartMeetingDialog(true);
  };

  // Duration timer (clock-based + RAF fallback for Safari/UI freeze edge cases)
  useEffect(() => {
    if (!isRecording) {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      if (durationRafRef.current !== null) {
        window.cancelAnimationFrame(durationRafRef.current);
        durationRafRef.current = null;
      }
      hasAutoStoppedRef.current = false;
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
        if (!hasAutoStoppedRef.current) {
          hasAutoStoppedRef.current = true;
          void handleStopRecording();
        }
        return;
      }

      setDurationSec((prev) => (prev === elapsedSec ? prev : elapsedSec));
    };

    // Sync immediately, then run both interval + RAF fallback for smoother reliability
    syncDurationFromClock();
    durationIntervalRef.current = setInterval(syncDurationFromClock, 1000);

    const rafLoop = () => {
      syncDurationFromClock();
      durationRafRef.current = window.requestAnimationFrame(rafLoop);
    };
    durationRafRef.current = window.requestAnimationFrame(rafLoop);

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      if (durationRafRef.current !== null) {
        window.cancelAnimationFrame(durationRafRef.current);
        durationRafRef.current = null;
      }
    };
  }, [isRecording, isPaused]);

  const startRecording = async () => {
    debugLog('[🎬 MeetingRecorder] startRecording called, hasStarted:', hasStartedRecordingRef.current);
    if (hasStartedRecordingRef.current) return;
    hasStartedRecordingRef.current = true;

    // Set recording state IMMEDIATELY (synchronously in user gesture) so timer starts right away
    recordingStartedAtMsRef.current = Date.now();
    totalPausedMsRef.current = 0;
    pauseStartedAtMsRef.current = null;
    hasAutoStoppedRef.current = false;
    setDurationSec(0);
    setIsRecording(true);
    debugLog('[🎬 MeetingRecorder] isRecording set to true, clock started at', recordingStartedAtMsRef.current);

    try {
      let combinedStream: MediaStream;

      // If digital recording mode, use the pre-captured streams
      if (isDigitalRecording) {
        const { systemStream, micStream, combinedStream: storedCombinedStream } = digitalRecordingStreams.get();
        
        if (storedCombinedStream) {
          combinedStream = storedCombinedStream;
          console.log('✅ Using pre-mixed digital audio stream');
        } else if (!systemStream && !micStream) {
          throw new Error('Inga ljudkällor hittades för digitalt möte');
        } else {
          // Fallback: mix here (less reliable due to user-gesture restrictions)
          const audioContext = new AudioContext();
          try {
            if (audioContext.state === 'suspended') {
              await audioContext.resume();
            }
          } catch (e) {
            console.warn('AudioContext resume failed (digital fallback mix):', e);
          }
          const destination = audioContext.createMediaStreamDestination();

          if (systemStream) {
            const systemSource = audioContext.createMediaStreamSource(systemStream);
            systemSource.connect(destination);
            console.log('🔊 System audio connected');
          }

          if (micStream) {
            const micSource = audioContext.createMediaStreamSource(micStream);
            micSource.connect(destination);
            console.log('🎤 Microphone audio connected');
          }

          combinedStream = destination.stream;
          console.log('✅ Combined digital audio streams (fallback)');
        }
      } else {
        // Standard microphone recording
        combinedStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000,
            channelCount: 1,
          },
        });
      }

      streamRef.current = combinedStream;

      combinedStream.getAudioTracks().forEach(track => {
        track.enabled = true;
        if ('contentHint' in track) {
          (track as any).contentHint = 'speech';
        }
      });

      let mimeType = 'audio/webm; codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mp4';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = '';
          }
        }
      }

      console.log('🎤 MediaRecorder mimeType:', mimeType || 'browser default');

      const recorderOptions: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const mediaRecorder = new MediaRecorder(combinedStream, recorderOptions);

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          // Add to backup system for recovery
          addChunk(event.data, mediaRecorder.mimeType);

          // Also sync UI timer on media ticks (extra reliability on mobile/Safari)
          const startedAt = recordingStartedAtMsRef.current;
          if (startedAt) {
            const now = Date.now();
            const pausedMs = totalPausedMsRef.current + (pauseStartedAtMsRef.current ? now - pauseStartedAtMsRef.current : 0);
            const elapsedSec = Math.max(0, Math.floor((now - startedAt - pausedMs) / 1000));
            setDurationSec((prev) => (prev === elapsedSec ? prev : elapsedSec));
          }
        }
      };

      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;

      if (!useAsrMode) {
        startSpeechRecognition();
      }

      // Start auto-save backup for reliability
      startAutoSave();

      // Fire-and-forget: don't block recording start on wake lock
      requestWakeLock().catch(() => {});
      noSleep.enable();
      debugLog('[🎬 MeetingRecorder] MediaRecorder started, mimeType:', mediaRecorder.mimeType);

      console.log('✅ Recording started', useAsrMode ? '(ASR mode)' : '(Browser mode)', isDigitalRecording ? '(Digital)' : '(In-person)');
    } catch (error) {
      debugError('[🎬 MeetingRecorder] startRecording FAILED:', error);
      // Reset recording state since we set it optimistically
      setIsRecording(false);
      recordingStartedAtMsRef.current = null;
      setDurationSec(0);
      // Clean up digital streams on error
      if (isDigitalRecording) {
        digitalRecordingStreams.clear();
      }
      toast({
        title: 'Behörighet nekad',
        description: isDigitalRecording ? 'Kunde inte starta digital inspelning.' : 'Tivly behöver tillstånd till mikrofon.',
        variant: 'destructive',
      });
      hasStartedRecordingRef.current = false;
      onCancel();
    }
  };

  const stopMediaRecorder = () => {
    debugLog('[🎬 MeetingRecorder] stopMediaRecorder called');
    stopAutoSave(); // Stop backup timer
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    if (durationRafRef.current !== null) {
      window.cancelAnimationFrame(durationRafRef.current);
      durationRafRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      debugLog('[🎬 MeetingRecorder] stopping MediaRecorder, state was:', mediaRecorderRef.current.state);
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    // Clean up digital recording streams
    if (isDigitalRecording) {
      digitalRecordingStreams.clear();
    }
    recordingStartedAtMsRef.current = null;
    pauseStartedAtMsRef.current = null;
    totalPausedMsRef.current = 0;
    hasAutoStoppedRef.current = false;
    hasStartedRecordingRef.current = false;
  };

  const togglePause = () => {
    if (!mediaRecorderRef.current) return;
    debugLog('[🎬 MeetingRecorder] togglePause, currently isPaused:', isPaused);

    if (isPaused) {
      mediaRecorderRef.current.resume();
      if (pauseStartedAtMsRef.current) {
        totalPausedMsRef.current += Date.now() - pauseStartedAtMsRef.current;
        pauseStartedAtMsRef.current = null;
      }
      setIsPaused(false);
      debugLog('[🎬 MeetingRecorder] Resumed recording');
      requestWakeLock();
      if (!useAsrMode && recognitionRef.current) {
        try { recognitionRef.current.start(); } catch { /* ignore */ }
      }
    } else {
      mediaRecorderRef.current.pause();
      pauseStartedAtMsRef.current = Date.now();
      setIsPaused(true);
      debugLog('[🎬 MeetingRecorder] Paused recording');
      releaseWakeLock();
      saveBackup();
      if (!useAsrMode && recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ignore */ }
      }
    }
  };

  const handleStopRecording = async () => {
    debugLog('[🎬 MeetingRecorder] handleStopRecording called, isSaving:', isSaving, 'durationSec:', durationSec);
    if (isSaving) return;

    const currentTranscript = (liveTranscript + ' ' + interimText).trim();
    const wordCount = currentTranscript.split(/\s+/).filter(w => w).length;
    const isEmpty = durationSec < 5 || (!useAsrMode && (!currentTranscript || wordCount < 20));

    if (isEmpty) {
      debugLog('[🎬 MeetingRecorder] Recording too short/empty — auto-restarting', { durationSec, wordCount, useAsrMode });
      toast({
        title: 'Inspelningen var tom',
        description: 'Startar om automatiskt. Tala tydligt i mikrofonen.',
      });
      // Reset state and restart
      setDurationSec(0);
      setLiveTranscript('');
      setInterimText('');
      audioChunksRef.current = [];
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      // Small delay then restart recording
      setTimeout(() => {
        void startRecording();
      }, 500);
      return;
    }

    setIsSaving(true);
    setIsRecording(false);
    stopSpeechRecognition();
    await releaseWakeLock();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = () => {
        finishRecording();
      };
      mediaRecorderRef.current.stop();
    } else {
      finishRecording();
    }
  };

  const finishRecording = async () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;

    try {
      const finalTranscript = (liveTranscript + ' ' + interimText).trim();

      const recorderMimeType = mediaRecorderRef.current?.mimeType;
      let blobMimeType = recorderMimeType || 'audio/webm';
      if (!recorderMimeType) {
        if (MediaRecorder.isTypeSupported('audio/webm; codecs=opus')) {
          blobMimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          blobMimeType = 'audio/webm';
        } else {
          blobMimeType = 'audio/mp4';
        }
      }

      const blob = new Blob(audioChunksRef.current, { type: blobMimeType });
      console.log('🎤 Recording complete:', {
        chunks: audioChunksRef.current.length,
        blobSize: blob.size,
        blobType: blob.type,
      });

      if (useAsrMode && blob.size < 50000) {
        toast({
          title: 'Ljudfilen är för liten',
          description: isDigitalRecording
            ? 'Inspelningen verkar vara tom. Kontrollera att du valde en flik och aktiverade “Dela flikljud/systemljud”, samt att mötet faktiskt spelar upp ljud.'
            : 'Inspelningen verkar vara tom. Kontrollera mikrofonen.',
          variant: 'destructive',
        });
        isSavingRef.current = false;
        setIsSaving(false);
        startRecording();
        return;
      }

      // Update meeting title if changed
      if (localTitle !== meetingTitle) {
        try {
          await apiClient.updateMeeting(meetingId, { title: localTitle });
          onTitleChange(localTitle);
        } catch (e) {
          console.warn('Could not update meeting title:', e);
        }
      }

      if (useAsrMode) {
        // Upload to /asr/recording-upload for Enterprise users
        console.log('🎤 Enterprise: Uploading recording to ASR...', { meetingId });
        
        const audioFile = new File([blob], `meeting-${meetingId}.webm`, { type: blob.type });
        
        toast({
          title: 'Laddar upp inspelning',
          description: 'Transkribering startar snart...',
        });

        // Start upload in background and notify completion
        uploadRecordingToAsr({
          file: audioFile,
          meetingId,
          language,
          onProgress: (percent) => {
            console.log(`📤 Upload progress: ${percent}%`);
          },
        }).then(result => {
          if (result.success) {
            console.log('✅ Recording upload complete');
          } else {
            console.error('❌ Recording upload failed:', result.error);
            toast({
              title: 'Uppladdning misslyckades',
              description: result.error || 'Försök igen',
              variant: 'destructive',
            });
          }
        });

        // Update meeting status to processing
        try {
          await apiClient.updateMeeting(meetingId, { 
            transcriptionStatus: 'processing',
            isCompleted: true,
          });
        } catch (e) {
          console.warn('Could not update meeting status:', e);
        }
      } else {
        // Browser mode - save transcript directly
        try {
          await apiClient.updateMeeting(meetingId, {
            transcript: finalTranscript,
            transcriptionStatus: 'done',
            isCompleted: true,
          });
        } catch (e) {
          console.warn('Could not save transcript:', e);
        }
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      toast({
        title: 'Inspelning klar',
        description: useAsrMode ? 'Transkribering pågår...' : 'Transkribering klar!',
      });

      onRecordingComplete();
    } catch (error: any) {
      console.error('❌ Save error:', error);
      isSavingRef.current = false;
      setIsSaving(false);
      toast({
        title: 'Fel vid sparning',
        description: error.message || 'Kunde inte spara',
        variant: 'destructive',
      });
    }
  };

  const handleBackClick = () => {
    if (durationSec > 5) {
      setShowExitWarning(true);
      return;
    }
    stopMediaRecorder();
    stopSpeechRecognition();
    onCancel();
  };

  const handleTitleSave = () => {
    setIsEditingName(false);
    onTitleChange(localTitle);
  };

  // Loading overlay while saving
  if (isSaving) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <h2 className="text-lg font-medium">Sparar inspelning...</h2>
        </div>
      </div>
    );
  }

  const analyzerSize = 140;

  return (
    <div className="relative flex-1 flex flex-col h-full min-h-0 overflow-hidden">
      {/* Unified compact header bar */}
      <div
        className="bg-background border-b border-border/50 flex-shrink-0"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="max-w-5xl mx-auto px-3 py-1">
          <div className="flex items-center justify-between gap-2 h-9">
            {/* Left: recording dot + title */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="relative flex-shrink-0">
                <div className={`w-2 h-2 rounded-full ${!isPaused ? 'bg-destructive' : 'bg-muted-foreground/40'}`} />
                {!isPaused && (
                  <div className="absolute inset-0 w-2 h-2 rounded-full bg-destructive animate-ping" />
                )}
              </div>
              {isEditingName ? (
                <div className="flex gap-1 items-center flex-1 min-w-0">
                  <Input
                    value={localTitle}
                    onChange={(e) => setLocalTitle(e.target.value)}
                    onBlur={handleTitleSave}
                    onKeyDown={(e) => e.key === "Enter" && handleTitleSave()}
                    autoFocus
                    className="h-6 text-xs flex-1"
                  />
                  <Button onClick={handleTitleSave} size="sm" variant="ghost" className="h-6 w-6 p-0 flex-shrink-0">
                    <Check className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1 group cursor-pointer flex-1 min-w-0" onClick={() => setIsEditingName(true)}>
                  <span className="text-xs font-medium truncate">{localTitle}</span>
                  <Edit2 className="w-2.5 h-2.5 flex-shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )}
            </div>

            {/* Right: badges + time */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {isDigitalRecording && (
                <Monitor className="w-3 h-3 text-primary" />
              )}
              {isBackupEnabled && chunksSaved > 0 && (
                <Shield className="w-3 h-3 text-primary" />
              )}
              <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                {Math.floor(durationSec / 60)}:{(durationSec % 60).toString().padStart(2, '0')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - no scroll */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-2 min-h-0 overflow-hidden">
        <div className="flex flex-col items-center gap-4">
          <MinimalAudioAnalyzer
            stream={streamRef.current}
            isActive={isRecording && !isPaused}
            size={analyzerSize}
          />

          <div className="text-center">
            <div className="font-mono text-4xl font-extralight tracking-tight text-foreground tabular-nums">
              {Math.floor(durationSec / 60)}:{(durationSec % 60).toString().padStart(2, '0')}
            </div>
            <p className={`mt-1.5 text-xs font-medium tracking-wide uppercase ${
              !isRecording ? 'text-muted-foreground/70' : isPaused ? 'text-amber-500' : 'text-destructive/70'
            }`}>
              {!isRecording ? 'Startar inspelning...' : isPaused ? 'Pausad' : 'Spelar in'}
            </p>
          </div>
        </div>

        <div className="mt-6 w-full max-w-sm flex-shrink-0">
          <VoiceNamePrompt durationSec={durationSec} />
        </div>

        {/* Live Transcript Display (Free/Pro only) - capped height */}
        {!useAsrMode && (liveTranscript || interimText) && (
          <div className="mt-4 w-full max-w-md flex-shrink min-h-0 overflow-hidden" style={{ maxHeight: 'clamp(44px, 10svh, 88px)' }}>
            <div ref={transcriptScrollRef} className="h-full overflow-y-auto rounded-lg bg-muted/20 border border-border/20 px-3 py-2.5 text-sm leading-relaxed">
              <span className="text-foreground/80">{liveTranscript}</span>
              {interimText && (
                <span className="text-muted-foreground/40 italic">{interimText}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls - Safe area aware */}
      <div
        className="sticky bottom-0 z-20 flex-shrink-0 bg-background border-t border-border/50"
        style={{ paddingBottom: isNative ? 'max(env(safe-area-inset-bottom, 6px), 8px)' : '8px' }}
      >
        <div className="max-w-lg mx-auto px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <Button onClick={handleBackClick} variant="ghost" size="sm" className="h-10 px-3 text-muted-foreground text-xs">
              Avbryt
            </Button>

            <Button disabled={!isRecording} onClick={togglePause} variant="outline" className="flex-1 h-10 rounded-xl text-sm gap-1.5">
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
              disabled={!isRecording}
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
              Avbryta inspelningen?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Din inspelning ({Math.floor(durationSec / 60)} min {durationSec % 60} sek) kommer att förloras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Fortsätt spela in</AlertDialogCancel>
            <AlertDialogAction onClick={() => { stopMediaRecorder(); stopSpeechRecognition(); onCancel(); }} className="bg-destructive">
              Avbryt utan att spara
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RecordingInstructions isOpen={showInstructions && !shouldShowStartOverlay && !showModeDialog} onClose={() => setShowInstructions(false)} />

      {/* Start Meeting Overlay (shown on arrival to meeting detail) */}
      {shouldShowStartOverlay && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl">
            <div className="p-5 sm:p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <MeetingModeIcon className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold text-foreground">Starta möte</h3>
                  <p className="text-sm text-muted-foreground">
                    Du är nu på mötessidan. Tryck <span className="font-medium text-foreground">Starta möte</span> för att börja inspelningen i <span className="font-medium text-foreground">{meetingModeLabel}</span>.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    debugLog('[🎬 MeetingRecorder] Start overlay -> choose another mode');
                    setShowStartMeetingDialog(false);
                    setShowModeDialog(true);
                  }}
                >
                  Byt mötesläge
                </Button>
                <Button
                  onClick={() => {
                    debugLog('[🎬 MeetingRecorder] Start overlay -> start recording clicked');
                    localStorage.setItem('hasSeenRecordingInstructions', 'true');
                    setShowInstructions(false);
                    setShowStartMeetingDialog(false);
                    void startRecording();
                  }}
                >
                  Starta möte
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Meeting Mode Selection Dialog */}
      <MeetingModeDialog
        open={showModeDialog}
        onOpenChange={(open) => {
          // Prevent accidental dismiss before selecting mode
          if (!open && !meetingMode) return;
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
};
