// MeetingRecorder - Embedded recorder component for the Meeting-First flow
// Records audio directly on the meeting page, then uploads to /asr/recording-upload

import { useState, useRef, useEffect } from "react";
import { Square, Pause, Play, Edit2, Check, Clock, AlertTriangle, Shield, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MinimalAudioAnalyzer } from "./MinimalAudioAnalyzer";
import { RecordingInstructions } from "./RecordingInstructions";
import { VoiceNamePrompt } from "./VoiceNamePrompt";
import { RecordingIndicator } from "./RecordingIndicator";
import { isNativeApp } from "@/utils/capacitorDetection";
import { uploadRecordingToAsr } from "@/lib/asrRecordingUpload";
import { apiClient } from "@/lib/api";
import { useRecordingBackup } from "@/hooks/useRecordingBackup";
import { digitalRecordingStreams } from "@/lib/digitalRecordingStreams";

interface MeetingRecorderProps {
  meetingId: string;
  meetingTitle: string;
  onTitleChange: (title: string) => void;
  onRecordingComplete: () => void;
  onCancel: () => void;
  useAsrMode: boolean;
  language?: string;
  isDigitalRecording?: boolean;
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

  // Real-time transcript for Free/Pro plans (browser speech recognition)
  const [liveTranscript, setLiveTranscript] = useState<string>("");
  const [interimText, setInterimText] = useState<string>("");

  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const wakeLockRef = useRef<any>(null);
  const recognitionRef = useRef<any>(null);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const isSavingRef = useRef(false);

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

  // Check instructions
  useEffect(() => {
    const hasSeenInstructions = localStorage.getItem('hasSeenRecordingInstructions');
    if (!hasSeenInstructions) {
      setShowInstructions(true);
    }
  }, []);

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

  // Auto-start recording on mount
  useEffect(() => {
    startRecording();
    return () => {
      stopMediaRecorder();
      stopSpeechRecognition();
      releaseWakeLock();
    };
  }, []);

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
      let combinedStream: MediaStream;

      // If digital recording mode, use the pre-captured streams
      if (isDigitalRecording) {
        const { systemStream, micStream } = digitalRecordingStreams.get();
        
        if (!systemStream && !micStream) {
          throw new Error('Inga ljudkällor hittades för digitalt möte');
        }

        // Combine streams using AudioContext
        const audioContext = new AudioContext();
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
        console.log('✅ Combined digital audio streams');
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
        }
      };

      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;

      setIsRecording(true);
      await requestWakeLock();
      
      // Start auto-save backup for reliability
      startAutoSave();

      if (!useAsrMode) {
        startSpeechRecognition();
      }

      console.log('✅ Recording started', useAsrMode ? '(ASR mode)' : '(Browser mode)', isDigitalRecording ? '(Digital)' : '(In-person)');
    } catch (error) {
      console.error('Error starting recording:', error);
      // Clean up digital streams on error
      if (isDigitalRecording) {
        digitalRecordingStreams.clear();
      }
      toast({
        title: 'Behörighet nekad',
        description: isDigitalRecording ? 'Kunde inte starta digital inspelning.' : 'Tivly behöver tillstånd till mikrofon.',
        variant: 'destructive',
      });
      onCancel();
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
    // Clean up digital recording streams
    if (isDigitalRecording) {
      digitalRecordingStreams.clear();
    }
  };

  const togglePause = () => {
    if (!mediaRecorderRef.current) return;

    if (isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      requestWakeLock();
      if (!useAsrMode && recognitionRef.current) {
        try { recognitionRef.current.start(); } catch { /* ignore */ }
      }
    } else {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      releaseWakeLock();
      // Save backup when pausing for extra safety
      saveBackup();
      if (!useAsrMode && recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ignore */ }
      }
    }
  };

  const handleStopRecording = async () => {
    if (isSaving) return;

    if (durationSec < 5) {
      toast({
        title: 'För kort inspelning',
        description: 'Spela in minst 5 sekunder.',
        variant: 'destructive',
      });
      return;
    }

    const currentTranscript = (liveTranscript + ' ' + interimText).trim();
    if (!useAsrMode && !currentTranscript) {
      toast({
        title: 'Ingen text transkriberad',
        description: 'Försäkra dig om att mikrofonen fungerar och tala tydligt.',
        variant: 'destructive',
      });
      return;
    }

    if (!useAsrMode) {
      const wordCount = currentTranscript.split(/\s+/).filter(w => w).length;
      if (wordCount < 20) {
        toast({
          title: 'För kort transkription',
          description: `Minst 20 ord krävs. Du har ${wordCount} ord.`,
          variant: 'destructive',
        });
        return;
      }
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
          description: 'Inspelningen verkar vara tom. Kontrollera mikrofonen.',
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

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Always-on-screen Recording Indicator */}
      <RecordingIndicator
        isRecording={isRecording}
        isPaused={isPaused}
        durationSec={durationSec}
        isBackupEnabled={isBackupEnabled}
        chunksSaved={chunksSaved}
        compact={true}
      />

      {/* Header */}
      <div className={`border-b bg-background/95 backdrop-blur-sm sticky top-0 z-10 flex-shrink-0 ${isNative ? 'pt-safe' : ''}`}>
        <div className="max-w-5xl mx-auto px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className={`w-2.5 h-2.5 flex-shrink-0 rounded-full transition-all ${
                !isPaused ? 'bg-destructive animate-pulse shadow-lg shadow-destructive/50' : 'bg-muted-foreground/40'
              }`} />
              {isEditingName ? (
                <div className="flex gap-1 items-center flex-1 min-w-0">
                  <Input
                    value={localTitle}
                    onChange={(e) => setLocalTitle(e.target.value)}
                    onBlur={handleTitleSave}
                    onKeyDown={(e) => e.key === "Enter" && handleTitleSave()}
                    autoFocus
                    className="h-7 text-xs flex-1"
                  />
                  <Button onClick={handleTitleSave} size="sm" variant="ghost" className="h-7 w-7 p-0 flex-shrink-0">
                    <Check className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 group cursor-pointer flex-1 min-w-0" onClick={() => setIsEditingName(true)}>
                  <h1 className="text-xs font-medium truncate">{localTitle}</h1>
                  <Edit2 className="w-3 h-3 flex-shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Digital recording indicator */}
              {isDigitalRecording && (
                <div className="flex items-center gap-1 text-primary">
                  <Monitor className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-medium hidden sm:inline">Digitalt</span>
                </div>
              )}
              {/* Backup indicator in header */}
              {isBackupEnabled && chunksSaved > 0 && (
                <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <Shield className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-medium hidden sm:inline">Säkrad</span>
                </div>
              )}
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <span className="font-mono text-[10px]">
                    {Math.floor(durationSec / 60)}:{(durationSec % 60).toString().padStart(2, '0')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-3 min-h-0 overflow-hidden">
        <div className="flex-shrink-0">
          <MinimalAudioAnalyzer
            stream={streamRef.current}
            isActive={isRecording && !isPaused}
            size={Math.min(180, window.innerWidth - 48)}
          />
        </div>

        <div className="mt-4 text-center flex-shrink-0">
          <div className="font-mono text-xl md:text-2xl tracking-tight text-foreground/80">
            {Math.floor(durationSec / 60)}:{(durationSec % 60).toString().padStart(2, '0')}
          </div>
          <p className="mt-1 text-xs md:text-sm text-muted-foreground">
            {isPaused ? 'Pausad' : 'Spelar in'}
          </p>
        </div>

        <VoiceNamePrompt />

        {/* Live Transcript Display (Free/Pro only) */}
        {!useAsrMode && (liveTranscript || interimText) && (
          <div className="mt-3 w-full max-w-md flex-1 min-h-0 max-h-[25vh] md:max-h-[30vh]">
            <ScrollArea className="h-full rounded-xl bg-card/60 backdrop-blur-sm border border-border/30">
              <div ref={transcriptScrollRef} className="p-3 text-sm leading-relaxed">
                <span className="text-foreground">{liveTranscript}</span>
                {interimText && (
                  <span className="text-muted-foreground/60 italic">{interimText}</span>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      <div className={`flex-shrink-0 bg-background/95 backdrop-blur-sm border-t shadow-lg ${isNative ? 'pb-safe' : ''}`}>
        <div className="max-w-5xl mx-auto px-3 py-3">
          <div className="flex items-center justify-center gap-2">
            <Button onClick={handleBackClick} variant="ghost" size="sm" className="h-10 px-3">
              Avbryt
            </Button>

            <Button onClick={togglePause} variant="outline" size="sm" className="h-10 px-3">
              {isPaused ? (
                <>
                  <Play className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">Återuppta</span>
                </>
              ) : (
                <>
                  <Pause className="w-4 h-4 sm:mr-1" />
                  <span className="hidden sm:inline">Pausa</span>
                </>
              )}
            </Button>

            <Button
              onClick={handleStopRecording}
              size="sm"
              className="h-10 px-4 bg-primary hover:bg-primary/90 font-semibold"
            >
              <Square className="w-4 h-4 mr-1" />
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

      <RecordingInstructions isOpen={showInstructions} onClose={() => setShowInstructions(false)} />
    </div>
  );
};
