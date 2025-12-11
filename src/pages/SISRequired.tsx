import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mic, MicOff, Check, AlertCircle, Loader2, Play, RotateCcw, Upload, Volume2, Building2 } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/contexts/SubscriptionContext';

const SAMPLE_SENTENCES = [
  "God morgon, mitt namn är [ditt namn] och jag arbetar på [företagsnamn]. Idag ska vi diskutera de viktigaste punkterna på dagordningen.",
  "Jag vill gärna dela med mig av mina tankar kring detta projekt. Det är viktigt att vi alla är överens om nästa steg framåt.",
  "Sammanfattningsvis tycker jag att vi har gjort stora framsteg. Låt oss boka in ett uppföljningsmöte nästa vecka för att gå igenom resultaten."
];

const MIN_RECORDING_TIME = 10;
const MAX_RECORDING_TIME = 30;

export default function SISRequired() {
  const { toast } = useToast();
  const { enterpriseMembership, refreshEnterpriseMembership } = useSubscription();
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [currentSentence, setCurrentSentence] = useState(0);
  const [uploadComplete, setUploadComplete] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);
      
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
          title: 'Röstprov uppladdat!',
          description: 'Ditt röstprov har sparats. Du kan nu använda Tivly.',
        });
        setUploadComplete(true);
        // Refresh the enterprise membership to get updated SIS status
        if (refreshEnterpriseMembership) {
          await refreshEnterpriseMembership();
        }
        // Force reload to continue to app
        setTimeout(() => {
          window.location.reload();
        }, 1500);
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
  }, [audioBlob, recordingTime, toast, refreshEnterpriseMembership]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (uploadComplete) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-green-500/50 bg-green-500/5">
          <CardContent className="pt-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
              <Check className="h-8 w-8 text-green-500" />
            </div>
            <h2 className="text-xl font-semibold">Röstprov uppladdat!</h2>
            <p className="text-muted-foreground">Omdirigerar dig till appen...</p>
            <Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Building2 className="h-6 w-6 text-primary" />
            <span className="font-semibold text-lg">{enterpriseMembership?.company?.name || 'Enterprise'}</span>
          </div>
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Volume2 className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Röstprov krävs</h1>
          <p className="text-muted-foreground">
            Ditt företag har aktiverat talaridentifiering. Spela in ett röstprov för att kunna använda Tivly.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Mic className="h-5 w-5" />
              Spela in ditt röstprov
            </CardTitle>
            <CardDescription>
              Läs meningarna nedan högt och tydligt. Inspelningen används för att identifiera dig i möten.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Instructions */}
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

            {/* Recording controls */}
            <div className="space-y-4">
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
