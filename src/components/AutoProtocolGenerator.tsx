import { useEffect, useState } from "react";
import { ArrowLeft, Download, Loader2, Mail, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { saveAs } from "file-saver";
import { EmailDialog } from "./EmailDialog";
import { ProtocolGenerationWidget } from "./ProtocolGenerationWidget";
import { generateMeetingTitle } from "@/lib/titleGenerator";
import { saveActionItems } from "@/lib/backend";
import { hasPlusAccess } from "@/lib/accessCheck";

const SmoothRevealText = ({ 
  text, 
  delay = 0 
}: { 
  text: string; 
  delay?: number;
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setIsVisible(true);
    }, delay);

    return () => clearTimeout(timeout);
  }, [delay]);

  return (
    <span 
      className={`inline-block transition-all duration-700 ease-out ${
        isVisible 
          ? 'opacity-100 translate-y-0' 
          : 'opacity-0 translate-y-4'
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {text}
    </span>
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
  showWidget = false,
  onProtocolReady,
  meetingCreatedAt,
  agendaId,
  meetingId,
  userId
}: AutoProtocolGeneratorProps) => {
  const [isGenerating, setIsGenerating] = useState(true);
  const [progress, setProgress] = useState(0);
  const [documentBlob, setDocumentBlob] = useState<Blob | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [protocol, setProtocol] = useState<AIProtocol | null>(aiProtocol);
  const [showContent, setShowContent] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [agendaContent, setAgendaContent] = useState<string>("");
  const { user } = useAuth();
  const { userPlan } = useSubscription();
  
  useEffect(() => {
    setProtocol(aiProtocol);
  }, [aiProtocol]);
  
  const { toast } = useToast();

  useEffect(() => {
    // Load agenda if provided
    const loadAgenda = async () => {
      if (agendaId) {
        try {
          const { agendaStorage } = await import('@/utils/agendaStorage');
          const agenda = await agendaStorage.getAgenda(agendaId);
          if (agenda) {
            setAgendaContent(agenda.content);
          }
        } catch (error) {
          console.error('Failed to load agenda:', error);
        }
      }
    };
    loadAgenda();
  }, [agendaId]);

  useEffect(() => {
    let cancelled = false;
    const generateDocument = async () => {
      try {
        setIsGenerating(true);
        setProgress(10);
        // Wait a moment to show loading state with progress message
        await new Promise(resolve => setTimeout(resolve, 500));
        if (cancelled) return;
        setProgress(25);

        const finalProtocol = protocol;

        // Generate title from protocol or transcript
        let generatedTitle = finalProtocol?.title;
        if (!generatedTitle || generatedTitle.toLowerCase().startsWith('möte')) {
          try {
            generatedTitle = await generateMeetingTitle(transcript);
          } catch (e) {
            console.warn('Title generation failed:', e);
          }
        }

        setProgress(50);
        if (cancelled) return;

        // Format date/time
        const meetingDate = meetingCreatedAt ? new Date(meetingCreatedAt) : new Date();
        const dateStr = meetingDate.toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', day: 'numeric' });
        const timeStr = meetingDate.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

        // Removed heuristic fallback to avoid using transcript text in the protocol
        // If AI fails to generate, we keep sections empty and suggest retrying via UI/toast.
        if (!finalProtocol) {
          if (!cancelled) {
            toast({ title: "Kunde inte generera AI‑protokoll", description: "Försök igen om en liten stund." });
          }
        }

        const title = finalProtocol?.title || `Mötesprotokoll ${dateStr}`;
        
        const doc = new Document({
          sections: [
            {
              properties: {},
              children: [
                // Title
                new Paragraph({
                  text: "MÖTESPROTOKOLL",
                  heading: HeadingLevel.TITLE,
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 400 },
                }),
                
                // Meeting title
                new Paragraph({
                  children: [
                    new TextRun({
                      text: title,
                      bold: true,
                      size: 32,
                    }),
                  ],
                  spacing: { after: 300 },
                }),

                // Date and time
                new Paragraph({
                  children: [
                    new TextRun({ text: "Datum: ", bold: true }),
                    new TextRun(dateStr),
                    new TextRun({ text: " | Tid: ", bold: true }),
                    new TextRun(timeStr),
                  ],
                  spacing: { after: 300 },
                }),

                // Divider
                new Paragraph({
                  text: "─────────────────────────────────────────",
                  spacing: { after: 300 },
                }),

                // AI-generated content (if available)
                ...(finalProtocol ? [
                  // Summary
                  new Paragraph({
                    text: "Sammanfattning",
                    heading: HeadingLevel.HEADING_1,
                    spacing: { before: 200, after: 200 },
                  }),
                  new Paragraph({ text: finalProtocol.summary, spacing: { after: 300 } }),

                  // Main Points
                  new Paragraph({
                    text: "Huvudpunkter",
                    heading: HeadingLevel.HEADING_1,
                    spacing: { before: 200, after: 200 },
                  }),
                  ...finalProtocol.mainPoints.map(point => new Paragraph({ text: `• ${point}`, spacing: { after: 100 } })),

                  // Decisions (if any)
                  ...(finalProtocol.decisions.length > 0 ? [
                    new Paragraph({ text: "Beslut", heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 200 } }),
                    ...finalProtocol.decisions.map(decision => new Paragraph({ text: `• ${decision}`, spacing: { after: 100 } })),
                  ] : []),

                  // Action Items (if any)
                  ...(finalProtocol.actionItems.length > 0 ? [
                    new Paragraph({ text: "Åtgärdspunkter", heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 200 } }),
                    ...finalProtocol.actionItems.map((item: AIActionItem) => {
                      const itemText = typeof item === 'string' 
                        ? item 
                        : `${item.title}${item.description ? ` - ${item.description}` : ''}${item.owner ? ` (${item.owner})` : ''}${item.deadline ? ` [Deadline: ${item.deadline}]` : ''} [Priority: ${item.priority}]`;
                      return new Paragraph({ text: `• ${itemText}`, spacing: { after: 100 } });
                    }),
                  ] : []),
                ] : []),

                // Watermark for free users
                ...(isFreeTrialMode ? [
                  new Paragraph({ text: "", spacing: { before: 600 } }),
                  new Paragraph({
                    text: "─────────────────────────────────────────",
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 200 },
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: "TIVLY - GRATIS PLAN",
                        bold: true,
                        size: 24,
                      }),
                    ],
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 100 },
                  }),
                  new Paragraph({
                    text: "Uppgradera till Standard eller Plus för obegränsade protokoll utan vattenstämpel",
                    alignment: AlignmentType.CENTER,
                    spacing: { after: 200 },
                  }),
                  new Paragraph({
                    text: "─────────────────────────────────────────",
                    alignment: AlignmentType.CENTER,
                  }),
                ] : []),
              ],
            },
          ],
        });

        setProgress(75);
        if (cancelled) return;

        const blob = await Packer.toBlob(doc);
        const safeTitle = (generatedTitle || title || 'Mötesprotokoll').replace(/[^a-zA-Z0-9åäöÅÄÖ\s\-_]/g, '');
        const fileName = `${safeTitle}_${dateStr.replace(/ /g, '_')}.docx`;
        
        setDocumentBlob(blob);
        setFileName(fileName);
        
        setProgress(100);
        setIsGenerating(false);
        
        // Save action items if user has Plus access
        if (finalProtocol && finalProtocol.actionItems && finalProtocol.actionItems.length > 0 && hasPlusAccess(user, userPlan) && meetingId) {
          try {
            await saveActionItems({
              actionItems: finalProtocol.actionItems,
              meetingId: meetingId,
              userId: user.uid
            });
            console.log('Action items saved successfully');
          } catch (error) {
            console.error('Failed to save action items:', error);
          }
        }

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

  const handleDownload = () => {
    if (documentBlob && fileName) {
      saveAs(documentBlob, fileName);
      toast({
        title: "Protokoll nedladdat!",
        description: `${fileName} har laddats ner.`,
      });
    }
  };

  // Format date/time for display
  const meetingDate = meetingCreatedAt ? new Date(meetingCreatedAt) : new Date();
  const dateStr = meetingDate.toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = meetingDate.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        {showWidget && <ProtocolGenerationWidget isGenerating={isGenerating} progress={progress} onComplete={onProtocolReady} />}
        
        {isGenerating ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="text-center space-y-8 max-w-md">
              {/* Elegant loading animation */}
              <div className="relative w-32 h-32 mx-auto">
                {/* Outer rotating circle */}
                <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-spin" 
                     style={{ animationDuration: '3s' }}>
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full"></div>
                </div>
                {/* Inner pulsing circle */}
                <div className="absolute inset-4 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 animate-pulse flex items-center justify-center">
                  <svg className="w-12 h-12 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>

              {/* Status text */}
              <div className="space-y-3">
                <h3 className="text-2xl font-semibold text-foreground">
                  Skapar ditt protokoll
                </h3>
                <p className="text-base text-muted-foreground leading-relaxed">
                  {progress < 30 && "Analyserar innehållet och förbereder strukturen..."}
                  {progress >= 30 && progress < 60 && "Identifierar huvudpunkter och beslut..."}
                  {progress >= 60 && progress < 85 && "Formulerar sammanfattning och åtgärder..."}
                  {progress >= 85 && "Färdigställer ditt professionella protokoll..."}
                </p>
              </div>

              {/* Modern progress bar */}
              <div className="space-y-2">
                <div className="w-full h-1.5 bg-muted/50 rounded-full overflow-hidden backdrop-blur">
                  <div 
                    className="h-full bg-gradient-to-r from-primary via-primary/80 to-primary rounded-full transition-all duration-500 ease-out relative"
                    style={{ width: `${progress}%` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground font-medium">{Math.round(progress)}% slutfört</p>
              </div>

              {/* Subtle hint */}
              <p className="text-xs text-muted-foreground/70 italic">
                Detta tar vanligtvis 10-15 sekunder
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-8 animate-fade-in">
            {/* Header */}
            <div className="text-center space-y-2">
              <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Protokoll klart!
              </h1>
              <p className="text-muted-foreground">Ditt mötesprotokoll är genererat och redo att användas</p>
            </div>

            {/* Protocol Card */}
            <Card className="border-2 shadow-xl overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5 border-b-2 space-y-4 py-8">
                <div className="space-y-3 animate-fade-in">
                  <CardTitle className="text-3xl md:text-4xl font-bold text-center">
                    MÖTESPROTOKOLL
                  </CardTitle>
                  <h2 className="text-xl md:text-2xl font-semibold text-center text-muted-foreground">
                    {protocol?.title || 'Protokoll'}
                  </h2>
                  <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
                    <span className="font-medium">📅 {dateStr}</span>
                    <span className="text-border">•</span>
                    <span className="font-medium">🕐 {timeStr}</span>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="py-8 px-6 md:px-10">
                {protocol && showContent ? (
                  <div className="space-y-8">
                    {/* Summary */}
                    {protocol.summary && (
                      <div className="space-y-3 opacity-0 animate-fade-in" style={{ animationDelay: '100ms', animationFillMode: 'forwards' }}>
                        <h3 className="text-xl font-bold flex items-center gap-2 text-primary">
                          <span className="w-1 h-6 bg-primary rounded-full" />
                          Sammanfattning
                        </h3>
                        <p className="text-base leading-relaxed text-foreground/90 pl-4">
                          <SmoothRevealText text={protocol.summary} delay={200} />
                        </p>
                      </div>
                    )}

                    {/* Main Points */}
                    {protocol.mainPoints && protocol.mainPoints.length > 0 && (
                      <div className="space-y-3 opacity-0 animate-fade-in" style={{ animationDelay: '300ms', animationFillMode: 'forwards' }}>
                        <h3 className="text-xl font-bold flex items-center gap-2 text-primary">
                          <span className="w-1 h-6 bg-primary rounded-full" />
                          Huvudpunkter
                        </h3>
                        <ul className="space-y-3 pl-4">
                          {protocol.mainPoints.map((point, index) => (
                            <li key={index} className="flex gap-3 items-start opacity-0 animate-fade-in" 
                                style={{ animationDelay: `${400 + index * 150}ms`, animationFillMode: 'forwards' }}>
                              <span className="text-primary mt-1.5 text-lg">•</span>
                              <span className="flex-1 text-base leading-relaxed text-foreground/90">
                                <SmoothRevealText text={point} delay={400 + index * 150} />
                              </span>
                            </li>
                          ))
                          }
                        </ul>
                      </div>
                    )}

                    {/* Decisions */}
                    {protocol.decisions && protocol.decisions.length > 0 && (
                      <div className="space-y-3 opacity-0 animate-fade-in" style={{ animationDelay: `${500 + protocol.mainPoints.length * 150}ms`, animationFillMode: 'forwards' }}>
                        <h3 className="text-xl font-bold flex items-center gap-2 text-primary">
                          <span className="w-1 h-6 bg-primary rounded-full" />
                          Beslut
                        </h3>
                        <ul className="space-y-3 pl-4">
                          {protocol.decisions.map((decision, index) => (
                            <li key={index} className="flex gap-3 items-start opacity-0 animate-fade-in" 
                                style={{ animationDelay: `${600 + protocol.mainPoints.length * 150 + index * 150}ms`, animationFillMode: 'forwards' }}>
                              <span className="text-primary mt-1.5 text-lg">✓</span>
                              <span className="flex-1 text-base leading-relaxed text-foreground/90">
                                <SmoothRevealText text={decision} delay={600 + protocol.mainPoints.length * 150 + index * 150} />
                              </span>
                            </li>
                          ))
                          }
                        </ul>
                      </div>
                    )}

                    {/* Action Items */}
                    {protocol.actionItems && protocol.actionItems.length > 0 && (
                      <div className="space-y-3 opacity-0 animate-fade-in" 
                           style={{ 
                             animationDelay: `${700 + protocol.mainPoints.length * 150 + protocol.decisions.length * 150}ms`, 
                             animationFillMode: 'forwards' 
                           }}>
                        <h3 className="text-xl font-bold flex items-center gap-2 text-primary">
                          <span className="w-1 h-6 bg-primary rounded-full" />
                          Åtgärdspunkter
                        </h3>
                        <ul className="space-y-4 pl-4">
                          {protocol.actionItems.map((item, index) => {
                            const isSmartItem = typeof item === 'object' && 'priority' in item;
                            const baseDelay = 800 + protocol.mainPoints.length * 150 + protocol.decisions.length * 150 + index * 200;
                            
                            return (
                              <li key={index} className="flex gap-3 items-start opacity-0 animate-fade-in" 
                                  style={{ animationDelay: `${baseDelay}ms`, animationFillMode: 'forwards' }}>
                                <span className="text-primary mt-1.5 text-lg">→</span>
                                <div className="flex-1 space-y-1">
                                  {isSmartItem ? (
                                    <>
                                      <div className="flex items-start gap-2 flex-wrap">
                                        <span className="font-semibold text-foreground">
                                          <SmoothRevealText text={item.title} delay={baseDelay} />
                                        </span>
                                        <Badge 
                                          variant={
                                            item.priority === 'critical' ? 'destructive' : 
                                            item.priority === 'high' ? 'default' : 
                                            'secondary'
                                          }
                                          className="text-xs"
                                        >
                                          {item.priority === 'critical' ? 'Kritisk' : 
                                           item.priority === 'high' ? 'Hög' : 
                                           item.priority === 'medium' ? 'Medel' : 'Låg'}
                                        </Badge>
                                      </div>
                                      {item.description && (
                                        <p className="text-sm text-muted-foreground">
                                          <SmoothRevealText text={item.description} delay={baseDelay + 100} />
                                        </p>
                                      )}
                                      <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                                        {item.owner && (
                                          <span className="flex items-center gap-1">
                                            <span className="font-medium">Ansvarig:</span> 
                                            <SmoothRevealText text={item.owner} delay={baseDelay + 150} />
                                          </span>
                                        )}
                                        {item.deadline && (
                                          <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            <SmoothRevealText text={item.deadline} delay={baseDelay + 200} />
                                          </span>
                                        )}
                                      </div>
                                    </>
                                  ) : (
                                    <span className="text-base leading-relaxed text-foreground/90">
                                      <SmoothRevealText text={String(item)} delay={baseDelay} />
                                    </span>
                                  )}
                                </div>
                              </li>
                            );
                          })
                          }
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 opacity-0 animate-fade-in" 
                   style={{ animationDelay: '1000ms', animationFillMode: 'forwards' }}>
                {!isFreeTrialMode && (
                  <Button onClick={onBack} variant="outline" size="lg" className="gap-2 w-full">
                    <ArrowLeft className="w-4 h-4" />
                    <span className="whitespace-nowrap">Nytt möte</span>
                  </Button>
                )}
                <Button onClick={() => setEmailDialogOpen(true)} variant="outline" size="lg" className="gap-2 w-full">
                  <Mail className="w-4 h-4" />
                  <span className="whitespace-nowrap">E-posta</span>
                </Button>
                <Button onClick={handleDownload} size="lg" className="gap-2 w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70">
                  <Download className="w-4 h-4" />
                  <span className="whitespace-nowrap">Ladda ner</span>
                </Button>
              </div>
            </div>
            
            {/* Free trial notice */}
            {isFreeTrialMode && (
              <div className="mt-6 p-6 bg-gradient-to-r from-primary/10 to-primary/5 border-2 border-primary/20 rounded-xl text-center">
                <p className="text-sm leading-relaxed">
                  <strong className="text-primary">Gratis testversion:</strong>{" "}
                  <span className="text-muted-foreground">
                    Du har använt ditt gratis möte och protokoll. Uppgradera för att skapa fler möten och protokoll!
                  </span>
                </p>
              </div>
            )}

            {/* Email Dialog */}
            {documentBlob && (
              <EmailDialog
                open={emailDialogOpen}
                onOpenChange={setEmailDialogOpen}
                documentBlob={documentBlob}
                fileName={fileName}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};
