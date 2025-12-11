import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mic, MicOff, Check, Loader2, Play, RotateCcw, Upload, Volume2, Building2, Shield, Sparkles } from 'lucide-react';
import { apiClient } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/contexts/SubscriptionContext';

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
  const [currentSentence, setCurrentSentence] = useState(0);
  const [uploadComplete, setUploadComplete] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Get company name for the sample sentences
  const companyName = enterpriseMembership?.company?.name || 'företaget';
  
  // Sample sentences for recording (name is set by admin, not user input)
  const sampleSentences = [
    `God morgon, jag arbetar på ${companyName}. Idag ska vi diskutera de viktigaste punkterna på dagordningen.`,
    "Jag vill gärna dela med mig av mina tankar kring detta projekt. Det är viktigt att vi alla är överens om nästa steg framåt.",
    "Sammanfattningsvis tycker jag att vi har gjort stora framsteg. Låt oss boka in ett uppföljningsmöte nästa vecka för att gå igenom resultaten."
  ];

  // Auto-redirect if SIS is not required (toggle off, already verified, or not enterprise)
  useEffect(() => {
    // Wait for subscription data to load
    if (isLoading) return;
    
    const sisEnabled = enterpriseMembership?.company?.speakerIdentificationEnabled;
    const hasSample = enterpriseMembership?.sisSample?.status === 'ready';
    const isEnterprise = enterpriseMembership?.isMember;
    
    // Redirect if: not enterprise, SIS disabled, already verified, or admin
    if (!isEnterprise || !sisEnabled || hasSample || isAdmin) {
      console.log('[SISRequired] Redirecting - SIS not required:', { isEnterprise, sisEnabled, hasSample, isAdmin, isLoading });
      navigate('/', { replace: true });
    }
  }, [enterpriseMembership, isAdmin, navigate, isLoading]);

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
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-green-500/30 bg-gradient-to-br from-green-500/10 to-green-500/5 shadow-xl shadow-green-500/10">
          <CardContent className="pt-8 pb-8 text-center space-y-5">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center mx-auto shadow-lg shadow-green-500/30">
              <Check className="h-10 w-10 text-white" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-green-600 dark:text-green-400">Röstprov uppladdat!</h2>
              <p className="text-muted-foreground">Du är redo att använda Tivly med röstidentifiering.</p>
            </div>
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Omdirigerar dig...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 flex items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-6">
        {/* Organization Badge */}
        <div className="flex justify-center">
          <Badge variant="secondary" className="gap-2 px-4 py-2 text-sm bg-primary/10 border-primary/20 hover:bg-primary/15 transition-colors">
            <Building2 className="h-4 w-4" />
            {enterpriseMembership?.company?.name || 'Enterprise'}
          </Badge>
        </div>

        {/* Header */}
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl scale-150 opacity-50" />
            <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center mx-auto shadow-xl shadow-primary/25">
              <Shield className="h-10 w-10 text-primary-foreground" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
              Röstidentifiering aktiverad
            </h1>
            <p className="text-muted-foreground text-lg max-w-sm mx-auto">
              Din organisation har aktiverat röstidentifiering för säkrare mötesprotokoll.
            </p>
          </div>
        </div>

        {/* Info Banner */}
        <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="text-sm">
            <p className="font-medium text-foreground">Varför behövs detta?</p>
            <p className="text-muted-foreground">
              Ditt röstprov används för att identifiera dig i möten och skapa mer personliga protokoll.
            </p>
          </div>
        </div>

        <Card className="border-border/50 shadow-xl shadow-black/5 overflow-hidden">
          <CardHeader className="bg-gradient-to-b from-muted/50 to-transparent pb-4">
            <CardTitle className="text-xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Mic className="h-5 w-5 text-primary" />
              </div>
              Spela in ditt röstprov
            </CardTitle>
            <CardDescription className="text-base">
              Läs meningarna nedan högt och tydligt i normal samtalston.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pt-2">
            {/* Instructions */}
            <div className="space-y-3">
              {sampleSentences.map((sentence, index) => (
                <div 
                  key={index}
                  className={`p-4 rounded-xl border-2 text-sm transition-all duration-300 ${
                    index === currentSentence 
                      ? 'border-primary bg-primary/5 shadow-md shadow-primary/10' 
                      : index < currentSentence 
                        ? 'border-green-500/50 bg-green-500/5' 
                        : 'border-border/50 bg-muted/20'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                      index === currentSentence 
                        ? 'bg-primary text-primary-foreground shadow-md' 
                        : index < currentSentence
                          ? 'bg-green-500 text-white'
                          : 'bg-muted text-muted-foreground'
                    }`}>
                      {index < currentSentence ? <Check className="h-4 w-4" /> : index + 1}
                    </span>
                    <p className="leading-relaxed pt-0.5">{sentence}</p>
                  </div>
                </div>
              ))}
            </div>
            
            {isRecording && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setCurrentSentence(prev => Math.min(prev + 1, sampleSentences.length - 1))}
                disabled={currentSentence >= sampleSentences.length - 1}
                className="w-full"
              >
                Nästa mening →
              </Button>
            )}

            {/* Recording controls */}
            <div className="space-y-4">
              {(isRecording || audioBlob) && (
                <div className="space-y-3 p-4 rounded-xl bg-muted/30 border border-border/50">
                  <div className="flex items-center justify-between text-sm">
                    <span className={isRecording ? 'text-red-500 font-medium flex items-center gap-2' : 'text-muted-foreground'}>
                      {isRecording && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                      {isRecording ? 'Spelar in...' : '✓ Inspelning klar'}
                    </span>
                    <span className="font-mono text-lg font-semibold">{formatTime(recordingTime)}</span>
                  </div>
                  <Progress 
                    value={(recordingTime / MAX_RECORDING_TIME) * 100} 
                    className="h-2"
                  />
                  <p className="text-xs text-muted-foreground text-center">
                    Minst {MIN_RECORDING_TIME} sekunder krävs • Max {MAX_RECORDING_TIME} sekunder
                  </p>
                </div>
              )}

              <div className="flex items-center justify-center gap-3 flex-wrap">
                {!audioBlob ? (
                  <Button
                    size="lg"
                    variant={isRecording ? 'destructive' : 'default'}
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`gap-2 px-8 h-14 text-base shadow-lg transition-all ${
                      isRecording 
                        ? 'shadow-red-500/25' 
                        : 'shadow-primary/25 hover:shadow-primary/40'
                    }`}
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
                      className="gap-2 h-12"
                    >
                      <Play className="h-4 w-4" />
                      {isPlaying ? 'Stoppa' : 'Lyssna'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={resetRecording}
                      className="gap-2 h-12"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Gör om
                    </Button>
                    <Button
                      onClick={uploadSample}
                      disabled={isUploading || recordingTime < MIN_RECORDING_TIME}
                      className="gap-2 h-12 px-6 shadow-lg shadow-primary/25"
                    >
                      {isUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      Slutför
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Tips */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-muted/50 to-muted/30 border border-border/50">
              <p className="font-semibold text-sm mb-2 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Tips för bästa resultat
              </p>
              <ul className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                  Tyst miljö
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                  Normal samtalston
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                  Lagom avstånd till mic
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                  Läs utan paus
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
