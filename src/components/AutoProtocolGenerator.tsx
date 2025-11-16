import { useEffect, useState } from "react";
import { ArrowLeft, Download, Mic, FileText, ListChecks, CheckCircle2, Target, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { saveAs } from "file-saver";
import { generateMeetingTitle } from "@/lib/titleGenerator";
import { saveActionItems } from "@/lib/backend";
import { hasPlusAccess } from "@/lib/accessCheck";
import { useNavigate } from "react-router-dom";

const TypeWriter = ({ text, delay = 0 }: { text: string; delay?: number }) => {
  const [displayedText, setDisplayedText] = useState("");
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      let currentIndex = 0;
      const interval = setInterval(() => {
        if (currentIndex <= text.length) {
          setDisplayedText(text.slice(0, currentIndex));
          currentIndex++;
        } else {
          setIsComplete(true);
          clearInterval(interval);
        }
      }, 12);
      return () => clearInterval(interval);
    }, delay * 1000);
    return () => clearTimeout(timer);
  }, [text, delay]);

  return (
    <div className={`transition-opacity duration-300 ${isComplete ? 'opacity-100' : 'opacity-95'}`}>
      {displayedText}
      {!isComplete && <span className="inline-block w-0.5 h-4 ml-0.5 bg-primary animate-pulse" />}
    </div>
  );
};

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
  nextMeetingSuggestions?: string[];
}

interface AutoProtocolGeneratorProps {
  transcript: string;
  aiProtocol: AIProtocol | null;
  onBack: () => void;
  isFreeTrialMode?: boolean;
  showWidget?: boolean;
  onProtocolReady?: () => void;
  meetingCreatedAt?: string;
  agendaId?: string;
  meetingId?: string;
  userId?: string;
}

export const AutoProtocolGenerator = ({ 
  transcript, 
  aiProtocol, 
  onBack, 
  isFreeTrialMode = false,
  onProtocolReady,
  meetingCreatedAt,
  meetingId,
  userId
}: AutoProtocolGeneratorProps) => {
  const [isGenerating, setIsGenerating] = useState(true);
  const [currentStep, setCurrentStep] = useState("");
  const [progress, setProgress] = useState(0);
  const [documentBlob, setDocumentBlob] = useState<Blob | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [protocol, setProtocol] = useState<AIProtocol | null>(aiProtocol);
  const [showContent, setShowContent] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const { user } = useAuth();
  const { userPlan } = useSubscription();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  useEffect(() => {
    setProtocol(aiProtocol);
  }, [aiProtocol]);

  useEffect(() => {
    let cancelled = false;

    const generateDocument = async () => {
      if (!protocol) return;

      try {
        // Simulate progress with realistic steps
        const steps = [
          { text: "Analyserar mötesinnehållet...", progress: 15 },
          { text: "Identifierar huvudpunkter...", progress: 35 },
          { text: "Sammanställer beslut...", progress: 55 },
          { text: "Formaterar åtgärdspunkter...", progress: 75 },
          { text: "Färdigställer protokollet...", progress: 95 }
        ];

        for (const step of steps) {
          if (cancelled) return;
          setCurrentStep(step.text);
          setProgress(step.progress);
          await new Promise(resolve => setTimeout(resolve, 800));
        }

        // Generate title
        const generatedTitle = await generateMeetingTitle(transcript);
        const finalTitle = generatedTitle || protocol.title || "Mötesprotokoll";
        
        // Update protocol with generated title
        const updatedProtocol = { ...protocol, title: finalTitle };
        setProtocol(updatedProtocol);

        // Create document sections
        const docChildren: Paragraph[] = [
          new Paragraph({
            text: "MÖTESPROTOKOLL",
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 200 }
          }),
          new Paragraph({
            text: finalTitle,
            heading: HeadingLevel.HEADING_2,
            spacing: { after: 400 }
          }),
        ];

        // Add summary
        if (updatedProtocol.summary) {
          docChildren.push(
            new Paragraph({
              text: "Sammanfattning",
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 400, after: 200 }
            }),
            new Paragraph({
              text: updatedProtocol.summary,
              spacing: { after: 400 }
            })
          );
        }

        // Add main points
        if (updatedProtocol.mainPoints && updatedProtocol.mainPoints.length > 0) {
          docChildren.push(
            new Paragraph({
              text: "Huvudpunkter",
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 400, after: 200 }
            })
          );
          updatedProtocol.mainPoints.forEach(point => {
            docChildren.push(
              new Paragraph({
                text: `• ${point}`,
                spacing: { after: 100 }
              })
            );
          });
        }

        // Add decisions
        if (updatedProtocol.decisions && updatedProtocol.decisions.length > 0) {
          docChildren.push(
            new Paragraph({
              text: "Beslut",
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 400, after: 200 }
            })
          );
          updatedProtocol.decisions.forEach(decision => {
            docChildren.push(
              new Paragraph({
                text: `• ${decision}`,
                spacing: { after: 100 }
              })
            );
          });
        }

        // Add action items
        if (updatedProtocol.actionItems && updatedProtocol.actionItems.length > 0) {
          docChildren.push(
            new Paragraph({
              text: "Åtgärdspunkter",
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 400, after: 200 }
            })
          );
          updatedProtocol.actionItems.forEach(item => {
            const itemText = typeof item === 'string' ? item : item.title;
            docChildren.push(
              new Paragraph({
                text: `• ${itemText}`,
                spacing: { after: 100 }
              })
            );
          });
        }

        const doc = new Document({
          sections: [{
            properties: {},
            children: docChildren
          }]
        });

        const blob = await Packer.toBlob(doc);
        setDocumentBlob(blob);
        setFileName(`protokoll_${finalTitle.replace(/\s+/g, '_')}.docx`);

        // Save action items if needed
        if (updatedProtocol.actionItems && updatedProtocol.actionItems.length > 0 && meetingId && user) {
          try {
            await saveActionItems({
              actionItems: updatedProtocol.actionItems,
              meetingId: meetingId,
              userId: user.uid
            });
          } catch (error) {
            console.error('Failed to save action items:', error);
          }
        }

        setProgress(100);
        setIsGenerating(false);
        
        setTimeout(() => {
          setShowContent(true);
          onProtocolReady?.();
        }, 300);
      } catch (error) {
        console.error('Document generation error:', error);
        if (!cancelled) {
          toast({
            title: "Ett fel uppstod",
            description: "Kunde inte generera dokumentet. Försök igen.",
            variant: "destructive",
          });
        }
      }
    };

    generateDocument();

    return () => {
      cancelled = true;
    };
  }, [protocol, transcript, toast, meetingCreatedAt, isFreeTrialMode, onProtocolReady, userPlan, user, meetingId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Simulate save
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast({
        title: "Protokoll sparat!",
        description: "Ditt protokoll har sparats i biblioteket.",
      });
      navigate("/library");
    } catch (error) {
      toast({
        title: "Ett fel uppstod",
        description: "Kunde inte spara protokollet.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = () => {
    setIsDownloading(true);
    try {
      if (documentBlob && fileName) {
        saveAs(documentBlob, fileName);
        toast({
          title: "Protokoll nedladdat!",
          description: `${fileName} har laddats ner.`,
        });
      }
    } finally {
      setTimeout(() => setIsDownloading(false), 1000);
    }
  };

  const handleBackToHome = () => {
    navigate("/");
  };

  const handleNewRecording = () => {
    navigate("/recording");
  };

  const meetingTitle = protocol?.title || "Mötesprotokoll";

  const parsedSections = {
    summary: protocol?.summary || "",
    mainPoints: protocol?.mainPoints || [],
    decisions: protocol?.decisions || [],
    actionItems: protocol?.actionItems?.map(item => typeof item === 'string' ? item : item.title) || []
  };

  if (isGenerating) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-background/95 to-muted/10 flex items-center justify-center p-6">
        <div className="w-full max-w-3xl space-y-10">
          <div className="text-center space-y-6">
            <div className="inline-flex items-center gap-4 mb-8">
              <div className="relative">
                <Sparkles className="w-10 h-10 text-primary animate-pulse" />
                <div className="absolute inset-0 w-10 h-10 bg-primary/20 rounded-full blur-xl animate-pulse" />
              </div>
              <h1 className="text-5xl font-bold tracking-tight">
                <span className="bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
                  Genererar protokoll
                </span>
              </h1>
              <div className="relative">
                <Sparkles className="w-10 h-10 text-primary animate-pulse" />
                <div className="absolute inset-0 w-10 h-10 bg-primary/20 rounded-full blur-xl animate-pulse" />
              </div>
            </div>
            
            <div className="w-full max-w-xl mx-auto space-y-3">
              <div className="relative bg-card/30 backdrop-blur-md rounded-2xl p-3 shadow-2xl border border-border/30">
                <div 
                  className="h-4 bg-gradient-to-r from-primary/90 via-primary to-primary/80 rounded-xl transition-all duration-1000 ease-out shadow-[0_0_30px_rgba(var(--primary),0.6)]"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-base text-muted-foreground/80 font-medium animate-fade-in">
                {currentStep}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background/98 to-muted/5 py-12 px-4">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-4 opacity-0 animate-fade-in" style={{ animationDelay: "0s", animationFillMode: "forwards" }}>
          <div className="flex items-center gap-4 mb-2">
            <FileText className="w-8 h-8 text-primary" />
            <h1 className="text-4xl font-bold tracking-tight text-foreground">
              {meetingTitle}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground ml-12">
            Möte genomfört • Protokoll genererat automatiskt
          </p>
          <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent ml-12" />
        </div>

        {/* Summary */}
        {parsedSections.summary && (
          <Card className="border-border/40 bg-card/50 backdrop-blur-sm shadow-xl opacity-0" style={{
            animation: "fadeInUp 0.8s cubic-bezier(0.22, 0.61, 0.36, 1) 0.2s forwards"
          }}>
            <CardHeader className="pb-4 space-y-3">
              <div className="flex items-center gap-3">
                <FileText className="w-6 h-6 text-primary" />
                <CardTitle className="text-2xl font-semibold">Sammanfattning</CardTitle>
              </div>
              <div className="h-px bg-gradient-to-r from-primary/50 via-primary/20 to-transparent" />
            </CardHeader>
            <CardContent className="pt-2">
              <div className="prose prose-sm max-w-none text-foreground/85 leading-relaxed">
                <TypeWriter text={parsedSections.summary} delay={0.4} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Points */}
        {parsedSections.mainPoints && parsedSections.mainPoints.length > 0 && (
          <Card className="border-border/40 bg-card/50 backdrop-blur-sm shadow-xl opacity-0" style={{
            animation: "fadeInUp 0.8s cubic-bezier(0.22, 0.61, 0.36, 1) 0.5s forwards"
          }}>
            <CardHeader className="pb-4 space-y-3">
              <div className="flex items-center gap-3">
                <ListChecks className="w-6 h-6 text-primary" />
                <CardTitle className="text-2xl font-semibold">Huvudpunkter</CardTitle>
              </div>
              <div className="h-px bg-gradient-to-r from-primary/50 via-primary/20 to-transparent" />
            </CardHeader>
            <CardContent className="pt-2">
              <div className="space-y-5">
                {parsedSections.mainPoints.map((point, index) => (
                  <div key={index} className="flex gap-4 group">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold border border-primary/30 transition-all">
                      {index + 1}
                    </div>
                    <div className="flex-1 pt-0.5 text-foreground/85">
                      <TypeWriter text={point} delay={0.7 + index * 0.3} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Decisions */}
        {parsedSections.decisions && parsedSections.decisions.length > 0 && (
          <Card className="border-border/40 bg-card/50 backdrop-blur-sm shadow-xl opacity-0" style={{
            animation: "fadeInUp 0.8s cubic-bezier(0.22, 0.61, 0.36, 1) 0.8s forwards"
          }}>
            <CardHeader className="pb-4 space-y-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-primary" />
                <CardTitle className="text-2xl font-semibold">Beslut</CardTitle>
              </div>
              <div className="h-px bg-gradient-to-r from-primary/50 via-primary/20 to-transparent" />
            </CardHeader>
            <CardContent className="pt-2">
              <div className="space-y-5">
                {parsedSections.decisions.map((decision, index) => {
                  const decisionKey = `decision-${index}`;
                  return (
                    <div key={decisionKey} className="group">
                      <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/30 border border-border/30 transition-all">
                        <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                        <div className="flex-1 text-foreground/85">
                          <TypeWriter text={decision} delay={1.1 + index * 0.3} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Items */}
        {parsedSections.actionItems && parsedSections.actionItems.length > 0 && (
          <Card className="border-border/40 bg-card/50 backdrop-blur-sm shadow-xl opacity-0" style={{
            animation: "fadeInUp 0.8s cubic-bezier(0.22, 0.61, 0.36, 1) 1.1s forwards"
          }}>
            <CardHeader className="pb-4 space-y-3">
              <div className="flex items-center gap-3">
                <Target className="w-6 h-6 text-primary" />
                <CardTitle className="text-2xl font-semibold">Åtgärdspunkter</CardTitle>
              </div>
              <div className="h-px bg-gradient-to-r from-primary/50 via-primary/20 to-transparent" />
            </CardHeader>
            <CardContent className="pt-2">
              <div className="space-y-5">
                {parsedSections.actionItems.map((item, index) => {
                  const itemKey = `action-${index}`;
                  const parts = item.split(/(\[.*?\])/g).filter(Boolean);
                  return (
                    <div key={itemKey} className="group">
                      <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/30 border border-border/30 hover:border-primary/30 transition-all">
                        <Target className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="text-foreground/85">
                            <TypeWriter 
                              text={parts.map(part => 
                                part.startsWith('[') && part.endsWith(']') 
                                  ? part.slice(1, -1)
                                  : part
                              ).join('')} 
                              delay={1.4 + index * 0.3} 
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 pt-6 opacity-0" style={{
          animation: "fadeInUp 0.8s cubic-bezier(0.22, 0.61, 0.36, 1) 1.4s forwards"
        }}>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 h-12 text-base font-semibold shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Sparar...
              </>
            ) : (
              <>
                <Save className="mr-2 h-5 w-5" />
                Spara protokoll
              </>
            )}
          </Button>

          <Button
            variant="outline"
            onClick={handleDownload}
            disabled={isDownloading}
            className="flex-1 h-12 text-base font-semibold border-2 hover:shadow-lg transition-all hover:scale-[1.02]"
          >
            {isDownloading ? (
              <>
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2" />
                Laddar ner...
              </>
            ) : (
              <>
                <Download className="mr-2 h-5 w-5" />
                Ladda ner (.docx)
              </>
            )}
          </Button>
        </div>

        {/* Bottom Navigation */}
        <div className="mt-8 flex flex-col sm:flex-row gap-4 opacity-0" style={{
          animation: "fadeInUp 0.8s cubic-bezier(0.22, 0.61, 0.36, 1) 1.7s forwards"
        }}>
          <Button
            variant="ghost"
            onClick={handleBackToHome}
            className="flex-1 h-11 text-base border border-border/40 hover:border-border transition-all hover:scale-[1.01]"
          >
            <ArrowLeft className="mr-2 h-5 w-5" />
            Tillbaka till startsidan
          </Button>

          <Button
            variant="ghost"
            onClick={handleNewRecording}
            className="flex-1 h-11 text-base border border-border/40 hover:border-border transition-all hover:scale-[1.01]"
          >
            <Mic className="mr-2 h-5 w-5" />
            Ny inspelning
          </Button>
        </div>
      </div>
    </div>
  );
};
