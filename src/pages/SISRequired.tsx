import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mic, MicOff, Check, Loader2, Play, RotateCcw, Upload, Building2, Pause } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { motion, AnimatePresence } from 'framer-motion';

const MIN_RECORDING_TIME = 10;
const MAX_RECORDING_TIME = 30;

export default function SISRequired() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { enterpriseMembership, refreshEnterpriseMembership, isAdmin, isLoading } = useSubscription();
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const companyName = enterpriseMembership?.company?.name || 'Enterprise';

  useEffect(() => {
    if (isLoading) return;
    
    const sisEnabled = enterpriseMembership?.company?.speakerIdentificationEnabled;
    const hasSample = enterpriseMembership?.sisSample?.status === 'ready';
    const isEnterprise = enterpriseMembership?.isMember;
    
    if (!isEnterprise || !sisEnabled || hasSample || isAdmin) {
      navigate('/', { replace: true });
    }
  }, [enterpriseMembership, isAdmin, navigate, isLoading]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (audioRef.current) audioRef.current.pause();
    };
  }, [audioUrl]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 } 
      });
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
          ? 'audio/webm;codecs=opus' : 'audio/webm'
      });
      
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);
      
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => {
          if (prev + 1 >= MAX_RECORDING_TIME) stopRecording();
          return prev + 1;
        });
      }, 1000);
      
    } catch (error) {
      toast({
        title: 'Mikrofonåtkomst nekad',
        description: 'Tillåt mikrofonåtkomst för att spela in.',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop();
    }
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const playRecording = useCallback(() => {
    if (!audioUrl) return;
    if (audioRef.current) audioRef.current.pause();
    
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.onended = () => setIsPlaying(false);
    audio.onpause = () => setIsPlaying(false);
    audio.play();
    setIsPlaying(true);
  }, [audioUrl]);

  const stopPlaying = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
  }, []);

  const resetRecording = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
  }, [audioUrl]);

  const uploadSample = useCallback(async () => {
    if (!audioBlob || recordingTime < MIN_RECORDING_TIME) {
      toast({
        title: 'Inspelning för kort',
        description: `Minst ${MIN_RECORDING_TIME} sekunder krävs.`,
        variant: 'destructive',
      });
      return;
    }
    
    setIsUploading(true);
    try {
      const result = await apiClient.uploadSISSample(audioBlob);
      
      if (result.ok) {
        toast({ title: 'Röstprov uppladdat!', description: 'Du är redo att använda Tivly.' });
        setUploadComplete(true);
        await refreshEnterpriseMembership?.();
        setTimeout(() => window.location.reload(), 1500);
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error) {
      toast({
        title: 'Uppladdning misslyckades',
        description: 'Försök igen.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  }, [audioBlob, recordingTime, toast, refreshEnterpriseMembership]);

  const progress = (recordingTime / MAX_RECORDING_TIME) * 100;
  const isReady = recordingTime >= MIN_RECORDING_TIME;

  if (uploadComplete) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center space-y-6"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-24 h-24 rounded-full bg-green-500 flex items-center justify-center mx-auto"
          >
            <Check className="h-12 w-12 text-white" />
          </motion.div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">Klart!</h2>
            <p className="text-muted-foreground">Omdirigerar dig...</p>
          </div>
          <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm space-y-8"
      >
        {/* Company Badge */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="flex justify-center"
        >
          <Badge variant="outline" className="gap-2 px-3 py-1.5 text-xs">
            <Building2 className="h-3 w-3" />
            {companyName}
          </Badge>
        </motion.div>

        {/* Header */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-center space-y-3"
        >
          <h1 className="text-2xl font-semibold tracking-tight">Röstidentifiering</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Spela in ett kort röstprov så vi kan identifiera dig i möten.
          </p>
        </motion.div>

        {/* Recording Area */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="relative"
        >
          {/* Circular Progress */}
          <div className="relative w-48 h-48 mx-auto">
            {/* Background Circle */}
            <svg className="w-full h-full -rotate-90">
              <circle
                cx="96"
                cy="96"
                r="88"
                fill="none"
                strokeWidth="4"
                className="stroke-muted"
              />
              <motion.circle
                cx="96"
                cy="96"
                r="88"
                fill="none"
                strokeWidth="4"
                strokeLinecap="round"
                className={isReady ? "stroke-green-500" : "stroke-primary"}
                strokeDasharray={553}
                strokeDashoffset={553 - (553 * progress) / 100}
                initial={{ strokeDashoffset: 553 }}
                animate={{ strokeDashoffset: 553 - (553 * progress) / 100 }}
                transition={{ duration: 0.3 }}
              />
            </svg>

            {/* Center Content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <AnimatePresence mode="wait">
                {isRecording ? (
                  <motion.div
                    key="recording"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="text-center"
                  >
                    <motion.div
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="w-3 h-3 rounded-full bg-red-500 mx-auto mb-3"
                    />
                    <span className="text-4xl font-light tabular-nums">{recordingTime}s</span>
                    <p className="text-xs text-muted-foreground mt-1">
                      {isReady ? 'Redo' : `${MIN_RECORDING_TIME - recordingTime}s kvar`}
                    </p>
                  </motion.div>
                ) : audioBlob ? (
                  <motion.div
                    key="complete"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="text-center"
                  >
                    <Check className="h-8 w-8 text-green-500 mx-auto mb-2" />
                    <span className="text-2xl font-light tabular-nums">{recordingTime}s</span>
                    <p className="text-xs text-muted-foreground mt-1">Inspelning klar</p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="idle"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="text-center"
                  >
                    <Mic className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Tryck för att börja</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>

        {/* Controls */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="space-y-4"
        >
          <AnimatePresence mode="wait">
            {!audioBlob ? (
              <motion.div
                key="record-btn"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex justify-center"
              >
                <Button
                  size="lg"
                  variant={isRecording ? 'destructive' : 'default'}
                  onClick={isRecording ? stopRecording : startRecording}
                  className="gap-2 h-12 px-8 rounded-full"
                >
                  {isRecording ? (
                    <>
                      <MicOff className="h-4 w-4" />
                      Stoppa
                    </>
                  ) : (
                    <>
                      <Mic className="h-4 w-4" />
                      Starta inspelning
                    </>
                  )}
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key="action-btns"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center justify-center gap-3"
              >
                <Button
                  variant="outline"
                  size="icon"
                  onClick={isPlaying ? stopPlaying : playRecording}
                  className="h-12 w-12 rounded-full"
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={resetRecording}
                  className="h-12 w-12 rounded-full"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button
                  onClick={uploadSample}
                  disabled={isUploading || !isReady}
                  className="gap-2 h-12 px-6 rounded-full"
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Ladda upp
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Hint */}
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-xs text-center text-muted-foreground"
          >
            Prata naturligt i {MIN_RECORDING_TIME}-{MAX_RECORDING_TIME} sekunder
          </motion.p>
        </motion.div>
      </motion.div>
    </div>
  );
}
