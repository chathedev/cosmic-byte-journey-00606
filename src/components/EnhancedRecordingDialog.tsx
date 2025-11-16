import { useState, useRef, useEffect } from "react";
import { Square, Pause, Play, Clock, Loader2, FileText, Sparkles, ArrowLeft, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { AgendaSelectorNew } from "./AgendaSelectorNew";
import { useNavigate } from "react-router-dom";

interface EnhancedRecordingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialTranscript?: string;
  meetingName?: string;
  onFinish?: (data: { transcript: string; agendaId?: string }) => void;
}

export const EnhancedRecordingDialog = ({
  isOpen,
  onClose,
  initialTranscript = "",
  meetingName = "Namnlöst möte",
  onFinish
}: EnhancedRecordingDialogProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [transcript, setTranscript] = useState(initialTranscript);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [durationSec, setDurationSec] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState("");
  const [selectedAgendaId, setSelectedAgendaId] = useState<string | undefined>();
  const [showAgendaSelection, setShowAgendaSelection] = useState(false);
  
  const { toast } = useToast();
  const navigate = useNavigate();
  const recognitionRef = useRef<any>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptViewRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptViewRef.current) {
      transcriptViewRef.current.scrollTop = transcriptViewRef.current.scrollHeight;
    }
  }, [transcript, interimTranscript]);

  // Timer
  useEffect(() => {
    if (isRecording && !isPaused) {
      durationIntervalRef.current = setInterval(() => {
        setDurationSec(prev => prev + 1);
      }, 1000);
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    }
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, [isRecording, isPaused]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        toast({
          title: "Stöds ej",
          description: "Din webbläsare stöder inte röstinspelning",
          variant: "destructive",
        });
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'sv-SE';

      recognition.onresult = (event: any) => {
        let interimText = '';
        let finalText = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcriptPiece = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalText += transcriptPiece + ' ';
          } else {
            interimText += transcriptPiece;
          }
        }

        if (finalText) {
          setTranscript(prev => prev + finalText);
        }
        setInterimTranscript(interimText);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech') {
          // Restart if no speech detected
          recognition.start();
        }
      };

      recognition.onend = () => {
        if (isRecording && !isPaused) {
          recognition.start();
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
      toast({
        title: "Inspelning misslyckades",
        description: "Kunde inte starta inspelning",
        variant: "destructive",
      });
    }
  };

  const pauseRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsPaused(true);
  };

  const resumeRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.start();
    }
    setIsPaused(false);
  };

  const stopAndProcess = async () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);

    const wordCount = transcript.trim().split(/\s+/).length;
    if (wordCount < 50) {
      toast({
        title: "För kort möte",
        description: "Transkriptionen måste innehålla minst 50 ord för att skapa ett protokoll.",
        variant: "destructive",
      });
      return;
    }

    // Show agenda selection
    setShowAgendaSelection(true);
  };

  const handleAgendaSelected = async () => {
    setShowAgendaSelection(false);
    setIsProcessing(true);

    // Simulate processing steps
    const steps = [
      { text: "Bearbetar transkription...", duration: 1000 },
      { text: "Analyserar innehåll...", duration: 1000 },
      { text: "Förbereder protokoll...", duration: 800 }
    ];

    for (const step of steps) {
      setProcessingStep(step.text);
      await new Promise(resolve => setTimeout(resolve, step.duration));
    }

    // Navigate to protocol generation
    navigate('/generate-protocol', {
      state: {
        transcript,
        meetingName,
        agendaId: selectedAgendaId,
        fromRecording: true
      }
    });
  };

  const handleSave = () => {
    toast({
      title: "Möte sparat",
      description: "Ditt möte har sparats som utkast",
    });
    onClose();
  };

  const handleBack = () => {
    if (isRecording) {
      if (confirm("Är du säker på att du vill avbryta inspelningen?")) {
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
        onClose();
      }
    } else {
      onClose();
    }
  };

  // Auto-start recording when dialog opens
  useEffect(() => {
    if (isOpen && !isRecording) {
      startRecording();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-background p-6 border-b">
            <div className="flex items-center justify-between mb-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Tillbaka
              </Button>
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-muted-foreground" />
                <span className="text-2xl font-bold tabular-nums">{formatDuration(durationSec)}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-2xl font-bold">{meetingName}</h2>
            </div>
            
            {isRecording && !isProcessing && (
              <div className="flex items-center gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-red-500 animate-pulse" />
                  <span className="text-red-500 font-semibold">Inspelning pågår</span>
                </div>
              </div>
            )}
            
            <p className="text-sm text-muted-foreground mt-2">
              Tala tydligt in ditt möte. Texten transkriberas i realtid nedan
            </p>
          </div>

          {/* Processing State */}
          {isProcessing && (
            <div className="flex-1 flex items-center justify-center p-12 bg-gradient-to-b from-background via-background/95 to-muted/10">
              <div className="text-center space-y-6 max-w-md">
                <div className="inline-flex items-center gap-4">
                  <Sparkles className="w-10 h-10 text-primary animate-pulse" />
                  <Loader2 className="w-12 h-12 text-primary animate-spin" />
                  <Sparkles className="w-10 h-10 text-primary animate-pulse" />
                </div>
                
                <div className="space-y-3">
                  <p className="text-xl font-semibold text-foreground">{processingStep}</p>
                  <p className="text-sm text-muted-foreground">Detta tar bara några sekunder...</p>
                </div>
                
                <div className="w-full h-2 bg-muted/50 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-primary via-primary/80 to-primary rounded-full animate-pulse w-3/4" />
                </div>
              </div>
            </div>
          )}

          {/* Agenda Selection State */}
          {showAgendaSelection && !isProcessing && (
            <div className="flex-1 flex items-center justify-center p-8 bg-gradient-to-b from-background to-muted/5">
              <Card className="w-full max-w-md p-6 space-y-6">
                <div className="text-center space-y-2">
                  <FileText className="w-12 h-12 text-primary mx-auto" />
                  <h3 className="text-2xl font-bold">Välj agenda</h3>
                  <p className="text-sm text-muted-foreground">
                    Vill du koppla en agenda till detta möte? (Valfritt)
                  </p>
                </div>

                <AgendaSelectorNew
                  selectedAgendaId={selectedAgendaId}
                  onSelectAgenda={setSelectedAgendaId}
                />

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedAgendaId(undefined);
                      handleAgendaSelected();
                    }}
                    className="flex-1"
                  >
                    Hoppa över
                  </Button>
                  <Button
                    onClick={handleAgendaSelected}
                    className="flex-1"
                  >
                    Fortsätt
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* Transcript View */}
          {!isProcessing && !showAgendaSelection && (
            <>
              <div 
                ref={transcriptViewRef}
                className="flex-1 overflow-y-auto p-6 bg-muted/5"
              >
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <FileText className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-semibold">Transkription</h3>
                  </div>
                  
                  <Card className="p-4 bg-card">
                    <div className="space-y-3">
                      <div className="text-sm font-medium text-muted-foreground">Allmänt</div>
                      <div className="text-base leading-relaxed text-foreground">
                        {transcript || (
                          <span className="text-muted-foreground italic">
                            Börja tala för att se transkriptionen här...
                          </span>
                        )}
                        {interimTranscript && (
                          <span className="text-muted-foreground italic ml-1">
                            {interimTranscript}
                          </span>
                        )}
                      </div>
                    </div>
                  </Card>
                </div>
              </div>

              {/* Controls */}
              <div className="border-t bg-background p-6">
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    variant="outline"
                    onClick={handleBack}
                    className="flex-1"
                  >
                    Tillbaka
                  </Button>

                  {isRecording && !isPaused && (
                    <Button
                      variant="outline"
                      onClick={pauseRecording}
                      className="flex-1 gap-2"
                    >
                      <Pause className="w-4 h-4" />
                      Pausa
                    </Button>
                  )}

                  {isRecording && isPaused && (
                    <Button
                      variant="outline"
                      onClick={resumeRecording}
                      className="flex-1 gap-2"
                    >
                      <Play className="w-4 h-4" />
                      Återuppta
                    </Button>
                  )}

                  <Button
                    onClick={stopAndProcess}
                    disabled={!transcript.trim()}
                    className="flex-1 gap-2 bg-primary hover:bg-primary/90"
                  >
                    <Square className="w-4 h-4" />
                    Avsluta & Skapa Protokoll
                  </Button>

                  <Button
                    variant="outline"
                    onClick={handleSave}
                    disabled={!transcript.trim()}
                    className="flex-1"
                  >
                    Spara
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
