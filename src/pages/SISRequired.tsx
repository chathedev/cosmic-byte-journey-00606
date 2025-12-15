import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Mic, MicOff, Check, Loader2, Play, RotateCcw, Upload, Building2, Pause, ArrowRight, ArrowLeft, Volume2, Shield, Sparkles, User, Lightbulb, VolumeX, Timer, MessageSquare, CheckCircle2 } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { motion, AnimatePresence } from 'framer-motion';

const MIN_RECORDING_TIME = 10;
const MAX_RECORDING_TIME = 30;

type Step = 'intro' | 'name' | 'tips' | 'record' | 'review' | 'uploading' | 'success';

const STORAGE_KEY = 'sis_onboarding_state';

interface StoredState {
  step: Step;
  speakerName: string;
}

function loadStoredState(): StoredState | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load SIS state:', e);
  }
  return null;
}

function saveState(state: StoredState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save SIS state:', e);
  }
}

function clearStoredState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('Failed to clear SIS state:', e);
  }
}

export default function SISRequired() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { enterpriseMembership, refreshEnterpriseMembership, isAdmin, isLoading } = useSubscription();
  
  // Load initial state from storage
  const storedState = loadStoredState();
  const initialStep = storedState?.step && !['uploading', 'success', 'review'].includes(storedState.step) 
    ? storedState.step 
    : 'intro';
  const initialName = storedState?.speakerName || '';
  
  const [step, setStep] = useState<Step>(initialStep);
  const [speakerName, setSpeakerName] = useState(initialName);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const canProceedFromName = speakerName.trim().length >= 2;
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const companyName = enterpriseMembership?.company?.name || 'Enterprise';

  const sampleText = `Hej, jag heter ${speakerName || '[ditt namn]'} och arbetar på ${companyName}. Idag ska vi diskutera de viktigaste punkterna på dagordningen. Jag vill gärna dela med mig av mina tankar kring detta projekt. Det är viktigt att vi alla är överens om nästa steg framåt.`;

  // Save state whenever step or name changes
  useEffect(() => {
    if (step !== 'uploading' && step !== 'success') {
      saveState({ step, speakerName });
    }
  }, [step, speakerName]);

  useEffect(() => {
    if (isLoading) return;
    
    const sisEnabled = enterpriseMembership?.company?.speakerIdentificationEnabled;
    const hasSample = enterpriseMembership?.sisSample?.status === 'ready';
    const sisDisabled = enterpriseMembership?.sisSample?.status === 'disabled';
    const isEnterprise = enterpriseMembership?.isMember;
    
    // Redirect if: not enterprise, SIS disabled, sample already ready, or admin
    if (!isEnterprise || !sisEnabled || sisDisabled || hasSample || isAdmin) {
      clearStoredState();
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
        setStep('review');
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
    setStep('record');
  }, [audioUrl]);

  const [showSuccessDialog, setShowSuccessDialog] = useState(false);

  const uploadSample = useCallback(async () => {
    if (!audioBlob || recordingTime < MIN_RECORDING_TIME) {
      toast({
        title: 'Inspelning för kort',
        description: `Minst ${MIN_RECORDING_TIME} sekunder krävs.`,
        variant: 'destructive',
      });
      return;
    }
    
    setStep('uploading');
    try {
      const result = await apiClient.uploadSISSample(audioBlob, speakerName.trim());
      
      if (result.ok) {
        clearStoredState();
        await refreshEnterpriseMembership?.();
        // Navigate to home and show success dialog
        navigate('/', { replace: true });
        // Use a small delay to ensure navigation completes
        setTimeout(() => setShowSuccessDialog(true), 100);
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error) {
      toast({
        title: 'Uppladdning misslyckades',
        description: 'Försök igen.',
        variant: 'destructive',
      });
      setStep('review');
    }
  }, [audioBlob, recordingTime, speakerName, toast, refreshEnterpriseMembership, navigate]);

  // Success dialog component
  const SuccessDialog = () => (
    <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
      <DialogContent className="sm:max-w-md text-center p-8">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", duration: 0.5 }}
          className="space-y-6"
        >
          <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">Tack, {speakerName}!</h2>
            <p className="text-muted-foreground">
              Nu fungerar röstidentifieringen. Ditt namn kommer automatiskt att visas i framtida mötestranskriptioner.
            </p>
          </div>
          <Button onClick={() => setShowSuccessDialog(false)} className="w-full">
            Stäng
          </Button>
        </motion.div>
      </DialogContent>
    </Dialog>
  );

  const progress = (recordingTime / MAX_RECORDING_TIME) * 100;
  const isReady = recordingTime >= MIN_RECORDING_TIME;

  const stepVariants = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 }
  };

  // Step indicator
  const steps = ['intro', 'name', 'tips', 'record', 'review'];
  const currentStepIndex = steps.indexOf(step);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      {/* Company Badge */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed top-6 left-6"
      >
        <Badge variant="outline" className="gap-2 px-3 py-1.5 text-xs">
          <Building2 className="h-3 w-3" />
          {companyName}
        </Badge>
      </motion.div>

      {/* Progress dots */}
      {step !== 'uploading' && step !== 'success' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed top-6 right-6 flex gap-1.5"
        >
          {steps.map((s, i) => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full transition-colors ${
                i <= currentStepIndex ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </motion.div>
      )}

      <div className="w-full max-w-md">
        <AnimatePresence mode="wait">
          {/* Step 1: Intro */}
          {step === 'intro' && (
            <motion.div
              key="intro"
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="space-y-8 text-center"
            >
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1 }}
                className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto"
              >
                <Volume2 className="h-10 w-10 text-primary" />
              </motion.div>
              
              <div className="space-y-3">
                <h1 className="text-2xl font-semibold tracking-tight">Röstidentifiering</h1>
                <p className="text-muted-foreground leading-relaxed">
                  För att automatiskt identifiera dig i mötestranskriptioner behöver vi ett kort röstprov.
                </p>
              </div>

              <div className="space-y-3 text-left bg-muted/50 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Shield className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Säkert & Privat</p>
                    <p className="text-xs text-muted-foreground">Ditt röstprov lagras krypterat och används endast för identifiering.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Automatisk Identifiering</p>
                    <p className="text-xs text-muted-foreground">Ditt namn visas automatiskt i mötesprotokoll.</p>
                  </div>
                </div>
              </div>

              <Button onClick={() => setStep('name')} className="w-full gap-2">
                Kom igång
                <ArrowRight className="h-4 w-4" />
              </Button>
            </motion.div>
          )}

          {/* Step 2: Name */}
          {step === 'name' && (
            <motion.div
              key="name"
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              <div className="text-center space-y-3">
                <motion.div
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto"
                >
                  <User className="h-8 w-8 text-primary" />
                </motion.div>
                <h1 className="text-2xl font-semibold tracking-tight">Vad heter du?</h1>
                <p className="text-muted-foreground text-sm">
                  Detta namn visas i mötestranskriptioner.
                </p>
              </div>

              <div className="space-y-4">
                <Input
                  placeholder="Ditt fullständiga namn..."
                  value={speakerName}
                  onChange={(e) => setSpeakerName(e.target.value)}
                  className="h-14 text-center text-lg"
                  autoFocus
                />
                {speakerName.trim().length > 0 && speakerName.trim().length < 2 && (
                  <p className="text-xs text-muted-foreground text-center">
                    Ange minst 2 tecken
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep('intro')} className="flex-1 gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Tillbaka
                </Button>
                <Button 
                  onClick={() => setStep('tips')} 
                  disabled={!canProceedFromName}
                  className="flex-1 gap-2"
                >
                  Fortsätt
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 3: Tips */}
          {step === 'tips' && (
            <motion.div
              key="tips"
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              <div className="text-center space-y-3">
                <motion.div
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto"
                >
                  <Lightbulb className="h-8 w-8 text-primary" />
                </motion.div>
                <h1 className="text-2xl font-semibold tracking-tight">Tips för bästa resultat</h1>
              </div>

              <div className="space-y-4">
                {[
                  { icon: VolumeX, title: 'Tyst miljö', desc: 'Välj en plats utan bakgrundsljud' },
                  { icon: Mic, title: 'Lagom avstånd', desc: 'Håll enheten nära men inte för nära' },
                  { icon: MessageSquare, title: 'Naturligt tal', desc: 'Prata som du gör i vanliga möten' },
                  { icon: Timer, title: `${MIN_RECORDING_TIME}-${MAX_RECORDING_TIME} sekunder`, desc: 'Läs texten i lugn takt' },
                ].map((tip, i) => (
                  <motion.div
                    key={tip.title}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center gap-4 p-3 rounded-xl bg-muted/50"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <tip.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{tip.title}</p>
                      <p className="text-xs text-muted-foreground">{tip.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep('name')} className="flex-1 gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Tillbaka
                </Button>
                <Button onClick={() => setStep('record')} className="flex-1 gap-2">
                  Jag är redo
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 4: Record */}
          {step === 'record' && (
            <motion.div
              key="record"
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <div className="text-center space-y-2">
                <h1 className="text-xl font-semibold tracking-tight">
                  {isRecording ? 'Spelar in...' : 'Läs texten nedan'}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Hej, <span className="font-medium text-foreground">{speakerName}</span>
                </p>
              </div>

              {/* Sample Text */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-4 rounded-xl border-2 transition-colors ${
                  isRecording ? 'border-primary bg-primary/5' : 'border-border bg-muted/30'
                }`}
              >
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2 font-medium">
                  Läs detta högt
                </p>
                <p className="text-sm leading-relaxed">
                  "{sampleText}"
                </p>
              </motion.div>

              {/* Circular Progress */}
              <div className="relative w-44 h-44 mx-auto">
                <svg className="w-full h-full -rotate-90">
                  <circle
                    cx="88"
                    cy="88"
                    r="80"
                    fill="none"
                    strokeWidth="6"
                    className="stroke-muted"
                  />
                  <motion.circle
                    cx="88"
                    cy="88"
                    r="80"
                    fill="none"
                    strokeWidth="6"
                    strokeLinecap="round"
                    className={isReady ? "stroke-green-500" : "stroke-primary"}
                    strokeDasharray={503}
                    strokeDashoffset={503 - (503 * progress) / 100}
                    initial={{ strokeDashoffset: 503 }}
                    animate={{ strokeDashoffset: 503 - (503 * progress) / 100 }}
                    transition={{ duration: 0.3 }}
                  />
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <AnimatePresence mode="wait">
                    {isRecording ? (
                      <motion.div
                        key="rec"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        className="text-center"
                      >
                        <motion.div
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ duration: 1, repeat: Infinity }}
                          className="w-4 h-4 rounded-full bg-red-500 mx-auto mb-2"
                        />
                        <span className="text-4xl font-light tabular-nums">{recordingTime}</span>
                        <p className="text-xs text-muted-foreground mt-1">
                          {isReady ? 'Redo att stoppa' : `${MIN_RECORDING_TIME - recordingTime}s kvar`}
                        </p>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="idle"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        className="text-center"
                      >
                        <Mic className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">Tryck för att starta</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Record Button */}
              <div className="flex justify-center">
                <Button
                  size="lg"
                  variant={isRecording ? 'destructive' : 'default'}
                  onClick={isRecording ? stopRecording : startRecording}
                  className="gap-2 h-14 px-10 rounded-full text-base"
                >
                  {isRecording ? (
                    <>
                      <MicOff className="h-5 w-5" />
                      {isReady ? 'Stoppa inspelning' : 'Vänta...'}
                    </>
                  ) : (
                    <>
                      <Mic className="h-5 w-5" />
                      Starta inspelning
                    </>
                  )}
                </Button>
              </div>

              {!isRecording && (
                <Button 
                  variant="ghost" 
                  onClick={() => setStep('tips')} 
                  className="w-full text-muted-foreground"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Tillbaka till tips
                </Button>
              )}
            </motion.div>
          )}

          {/* Step 5: Review */}
          {step === 'review' && (
            <motion.div
              key="review"
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              <div className="text-center space-y-3">
                <motion.div
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto"
                >
                  <Check className="h-10 w-10 text-green-500" />
                </motion.div>
                <h1 className="text-2xl font-semibold tracking-tight">Inspelning klar</h1>
                <p className="text-muted-foreground text-sm">
                  <span className="font-medium text-foreground">{recordingTime} sekunder</span> inspelat. Lyssna och godkänn.
                </p>
              </div>

              {/* Audio Player */}
              <div className="flex items-center justify-center gap-4">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={isPlaying ? stopPlaying : playRecording}
                  className="gap-2 h-14 px-8 rounded-full"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="h-5 w-5" />
                      Pausa
                    </>
                  ) : (
                    <>
                      <Play className="h-5 w-5" />
                      Lyssna
                    </>
                  )}
                </Button>
              </div>

              <div className="space-y-3">
                <Button
                  onClick={uploadSample}
                  className="w-full gap-2 h-12"
                  disabled={!isReady}
                >
                  <Upload className="h-4 w-4" />
                  Godkänn och ladda upp
                </Button>
                
                <Button
                  variant="ghost"
                  onClick={resetRecording}
                  className="w-full text-muted-foreground gap-2"
                >
                  <RotateCcw className="h-4 w-4" />
                  Spela in igen
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 6: Uploading */}
          {step === 'uploading' && (
            <motion.div
              key="uploading"
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.3 }}
              className="space-y-8 text-center"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="w-20 h-20 rounded-full border-4 border-muted border-t-primary flex items-center justify-center mx-auto"
              />
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight">Laddar upp...</h1>
                <p className="text-muted-foreground text-sm">
                  Vänta medan vi sparar ditt röstprov.
                </p>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Success Dialog */}
      <SuccessDialog />
    </div>
  );
}
