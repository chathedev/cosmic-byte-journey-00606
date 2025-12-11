import { useState, useRef, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mic, MicOff, Check, AlertCircle, Loader2, Play, RotateCcw, Upload, Volume2 } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface SISVoiceSampleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSample?: {
    status: 'ready' | 'processing' | 'error' | null;
    uploadedAt?: string;
    lastMatchScore?: number;
    error?: string | null;
  };
  onSampleUploaded?: () => void;
}

const SAMPLE_SENTENCES = [
  "God morgon, mitt namn är [ditt namn] och jag arbetar på [företagsnamn]. Idag ska vi diskutera de viktigaste punkterna på dagordningen.",
  "Jag vill gärna dela med mig av mina tankar kring detta projekt. Det är viktigt att vi alla är överens om nästa steg framåt.",
  "Sammanfattningsvis tycker jag att vi har gjort stora framsteg. Låt oss boka in ett uppföljningsmöte nästa vecka för att gå igenom resultaten."
];

const MIN_RECORDING_TIME = 10; // 10 seconds minimum
const MAX_RECORDING_TIME = 30; // 30 seconds maximum

export function SISVoiceSampleDialog({ 
  open, 
  onOpenChange, 
  currentSample,
  onSampleUploaded 
}: SISVoiceSampleDialogProps) {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [currentSentence, setCurrentSentence] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, [audioUrl]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        } 
      });
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
          ? 'audio/webm;codecs=opus' 
          : 'audio/webm'
      });
      
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      setRecordingTime(0);
      
      // Start timer
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => {
          const newTime = prev + 1;
          if (newTime >= MAX_RECORDING_TIME) {
            stopRecording();
          }
          return newTime;
        });
      }, 1000);
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      toast({
        title: 'Mikrofonåtkomst nekad',
        description: 'Tillåt mikrofonåtkomst för att spela in ett röstprov.',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const playRecording = useCallback(() => {
    if (!audioUrl) return;
    
    if (audioRef.current) {
      audioRef.current.pause();
    }
    
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
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    setCurrentSentence(0);
  }, [audioUrl]);

  const uploadSample = useCallback(async () => {
    if (!audioBlob) return;
    
    if (recordingTime < MIN_RECORDING_TIME) {
      toast({
        title: 'Inspelning för kort',
        description: `Inspelningen måste vara minst ${MIN_RECORDING_TIME} sekunder lång.`,
        variant: 'destructive',
      });
      return;
    }
    
    setIsUploading(true);
    try {
      const result = await apiClient.uploadSISSample(audioBlob);
      
      if (result.ok) {
        toast({
          title: 'Röstprov uppladdat',
          description: 'Ditt röstprov har sparats och kommer att användas för talaridentifiering.',
        });
        onSampleUploaded?.();
        onOpenChange(false);
        resetRecording();
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Failed to upload voice sample:', error);
      toast({
        title: 'Uppladdning misslyckades',
        description: 'Kunde inte ladda upp röstprovet. Försök igen.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  }, [audioBlob, recordingTime, toast, onSampleUploaded, onOpenChange, resetRecording]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const hasValidSample = currentSample?.status === 'ready';
  const isProcessing = currentSample?.status === 'processing';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5 text-primary" />
            Röstprov för Talaridentifiering
          </DialogTitle>
          <DialogDescription>
            Spela in ditt röstprov för att kunna identifieras automatiskt i mötesinspelningar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Current sample status */}
          {currentSample && (
            <Card className={hasValidSample ? 'border-green-500/50 bg-green-500/5' : isProcessing ? 'border-yellow-500/50 bg-yellow-500/5' : ''}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  {hasValidSample && <Check className="h-4 w-4 text-green-500" />}
                  {isProcessing && <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />}
                  {currentSample.status === 'error' && <AlertCircle className="h-4 w-4 text-destructive" />}
                  Nuvarande Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <Badge variant={hasValidSample ? 'default' : isProcessing ? 'secondary' : 'destructive'}>
                    {hasValidSample ? 'Verifierad' : isProcessing ? 'Bearbetas' : 'Ej verifierad'}
                  </Badge>
                </div>
                {currentSample.uploadedAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Uppladdat:</span>
                    <span className="text-sm">{new Date(currentSample.uploadedAt).toLocaleDateString('sv-SE')}</span>
                  </div>
                )}
                {currentSample.lastMatchScore !== undefined && currentSample.lastMatchScore !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Matchningspoäng:</span>
                    <Badge variant="outline">{Math.round(currentSample.lastMatchScore * 100)}%</Badge>
                  </div>
                )}
                {currentSample.error && (
                  <p className="text-sm text-destructive">{currentSample.error}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Instructions */}
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Läs följande meningar högt och tydligt:</h4>
            <div className="space-y-2">
              {SAMPLE_SENTENCES.map((sentence, index) => (
                <div 
                  key={index}
                  className={`p-3 rounded-lg border text-sm transition-colors ${
                    index === currentSentence 
                      ? 'border-primary bg-primary/5' 
                      : index < currentSentence 
                        ? 'border-green-500/50 bg-green-500/5' 
                        : 'border-border bg-muted/30'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium ${
                      index === currentSentence 
                        ? 'bg-primary text-primary-foreground' 
                        : index < currentSentence
                          ? 'bg-green-500 text-white'
                          : 'bg-muted text-muted-foreground'
                    }`}>
                      {index < currentSentence ? <Check className="h-3 w-3" /> : index + 1}
                    </span>
                    <p className="leading-relaxed">{sentence}</p>
                  </div>
                </div>
              ))}
            </div>
            {isRecording && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setCurrentSentence(prev => Math.min(prev + 1, SAMPLE_SENTENCES.length - 1))}
                disabled={currentSentence >= SAMPLE_SENTENCES.length - 1}
              >
                Nästa mening
              </Button>
            )}
          </div>

          {/* Recording controls */}
          <div className="space-y-4">
            {/* Timer and progress */}
            {(isRecording || audioBlob) && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className={isRecording ? 'text-red-500 animate-pulse' : 'text-muted-foreground'}>
                    {isRecording ? '⏺ Spelar in...' : 'Inspelning klar'}
                  </span>
                  <span className="font-mono">{formatTime(recordingTime)}</span>
                </div>
                <Progress 
                  value={(recordingTime / MAX_RECORDING_TIME) * 100} 
                  className="h-2"
                />
                <p className="text-xs text-muted-foreground">
                  Minst {MIN_RECORDING_TIME} sekunder krävs. Max {MAX_RECORDING_TIME} sekunder.
                </p>
              </div>
            )}

            {/* Main controls */}
            <div className="flex items-center justify-center gap-3">
              {!audioBlob ? (
                <Button
                  size="lg"
                  variant={isRecording ? 'destructive' : 'default'}
                  onClick={isRecording ? stopRecording : startRecording}
                  className="gap-2"
                >
                  {isRecording ? (
                    <>
                      <MicOff className="h-5 w-5" />
                      Stoppa inspelning
                    </>
                  ) : (
                    <>
                      <Mic className="h-5 w-5" />
                      Starta inspelning
                    </>
                  )}
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={isPlaying ? stopPlaying : playRecording}
                    className="gap-2"
                  >
                    <Play className="h-4 w-4" />
                    {isPlaying ? 'Stoppa' : 'Lyssna'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={resetRecording}
                    className="gap-2"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Spela in igen
                  </Button>
                  <Button
                    onClick={uploadSample}
                    disabled={isUploading || recordingTime < MIN_RECORDING_TIME}
                    className="gap-2"
                  >
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Ladda upp
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Tips */}
          <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
            <p className="font-medium">Tips för bästa resultat:</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
              <li>Välj en tyst miljö utan bakgrundsljud</li>
              <li>Tala i normal samtalston</li>
              <li>Håll mikrofonen på lagom avstånd</li>
              <li>Läs alla tre meningar utan paus</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
