import { useEffect, useState } from "react";
import { ArrowLeft, Download, Loader2, Mail, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  const [displayText, setDisplayText] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => {
      let currentIndex = 0;
      const interval = setInterval(() => {
        if (currentIndex <= text.length) {
          setDisplayText(text.slice(0, currentIndex));
          currentIndex++;
        } else {
          clearInterval(interval);
        }
      }, 5);

      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(timeout);
  }, [text, delay]);

  return <>{displayText}</>;
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
  const [isEditing, setIsEditing] = useState(false);
  const [editedProtocol, setEditedProtocol] = useState<AIProtocol | null>(null);
  const { user } = useAuth();
  const { userPlan } = useSubscription();
  useEffect(() => {
    setProtocol(aiProtocol);
    setEditedProtocol(aiProtocol);
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

  const handleSaveEdits = () => {
    if (editedProtocol) {
      setProtocol(editedProtocol);
      setIsEditing(false);
      toast({ title: "Ändringar sparade!", description: "Protokollet har uppdaterats." });
    }
  };

  const handleCancelEdit = () => {
    setEditedProtocol(protocol);
    setIsEditing(false);
  };

  useEffect(() => {
    let cancelled = false;
    const generateDocument = async () => {
      try {
        setIsGenerating(true);
        setProgress(10);
        // Wait a moment to show loading state with progress message
        await new Promise(resolve => setTimeout(resolve, 300));
        setProgress(15);
        await new Promise(resolve => setTimeout(resolve, 200));
        setProgress(20);

        // Use meeting creation date instead of current date
        const meetingDate = meetingCreatedAt ? new Date(meetingCreatedAt) : new Date();
        const dateStr = meetingDate.toLocaleDateString('sv-SE');
        const timeStr = meetingDate.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

        // If no AI protocol provided, try to generate it here
        let finalProtocol: AIProtocol | null = protocol;
        if (!finalProtocol && transcript && transcript.trim().length >= 20) {
          try {
            setProgress(30);
            const { analyzeMeeting } = await import('@/lib/backend');
            setProgress(40);
            const data: any = await analyzeMeeting({ 
              transcript, 
              meetingName: `Mötesprotokoll ${dateStr}`,
              agenda: agendaContent 
            });
            setProgress(70);
            if (data) {
              // Generate AI title if not provided
              const aiTitle = data.title || await generateMeetingTitle(transcript);
              
              // Best-effort normalization (trust backend to paraphrase and avoid verbatim copy)
              finalProtocol = {
                title: aiTitle || `Mötesprotokoll ${dateStr}`,
                summary: typeof data.summary === 'string' ? data.summary : (Array.isArray(data.mainPoints) ? data.mainPoints.join('\n') : ''),
                mainPoints: Array.isArray(data.mainPoints) ? data.mainPoints : [],
                decisions: Array.isArray(data.decisions) ? data.decisions : [],
                actionItems: Array.isArray(data.actionItems) ? data.actionItems : [],
                nextMeetingSuggestions: Array.isArray(data.nextMeetingSuggestions) ? data.nextMeetingSuggestions : [],
              };
              if (!cancelled) setProtocol(finalProtocol);
              
              // Save action items to backend for Plus/Admin users
              const hasAccess = hasPlusAccess(user, userPlan);
              if (hasAccess && meetingId && userId && data.actionItems && Array.isArray(data.actionItems) && data.actionItems.length > 0) {
                try {
                  await saveActionItems({
                    meetingId,
                    userId,
                    actionItems: data.actionItems
                  });
                  console.log('✅ Saved action items to backend');
                } catch (e) {
                  console.warn('Failed to save action items:', e);
                }
              }
            }
          } catch (e) {
            console.warn('AI analysis failed in protocol view, falling back to simple doc:', e);
          }
        }

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

        if (cancelled) return;

        setProgress(85);
        const blob = await Packer.toBlob(doc);
        const generatedFileName = `Motesprotokoll_${dateStr}_${timeStr.replace(':', '-')}.docx`;
        
        setProgress(95);
        setDocumentBlob(blob);
        setFileName(generatedFileName);
        setProgress(100);
        
        // Small delay before showing content
        await new Promise(resolve => setTimeout(resolve, 300));
        setIsGenerating(false);
        setShowContent(true);

        if (onProtocolReady) {
          onProtocolReady();
        } else {
          toast({ title: "Protokoll klart!", description: "Du kan nu se och ladda ner ditt protokoll." });
        }
      } catch (error) {
        console.error("Fel vid generering av protokoll:", error);
        setIsGenerating(false);
        toast({ title: "Fel", description: "Kunde inte skapa protokollet.", variant: "destructive" });
      }
    };

    generateDocument();
    return () => { cancelled = true; };
  }, [transcript, protocol, toast]);

  const handleDownload = () => {
    if (documentBlob && fileName) {
      saveAs(documentBlob, fileName);
      toast({
        title: "Nedladdning startad!",
        description: `${fileName} laddas ner nu.`,
      });
    }
  };

  // Use meeting creation date instead of current date for display
  const displayDate = meetingCreatedAt ? new Date(meetingCreatedAt) : new Date();
  const dateStr = displayDate.toLocaleDateString('sv-SE');
  const timeStr = displayDate.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

  // If showing widget mode, don't render the full UI
  if (showWidget) {
    return (
      <ProtocolGenerationWidget
        isGenerating={isGenerating}
        progress={progress}
        onComplete={onProtocolReady}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-background/95 flex flex-col">
      {/* Content */}
      <div className="flex-1 container max-w-5xl mx-auto px-4 py-8 md:py-12">
        {isGenerating ? (
          <div className="flex items-center justify-center min-h-[60vh]">
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
                <div className="space-y-3">
                  <CardTitle className="text-3xl md:text-4xl font-bold text-center">
                    MÖTESPROTOKOLL
                  </CardTitle>
                  <h2 className="text-xl md:text-2xl font-semibold text-center text-primary">
                    {protocol?.title || `Mötesprotokoll ${dateStr}`}
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
                  <div className="space-y-8 animate-fade-in">
                    {/* Summary Section */}
                    {(isEditing ? editedProtocol?.summary : protocol.summary) && (
                      <div className="space-y-3">
                        <h3 className="text-xl font-bold flex items-center gap-2 text-primary">
                          <span className="w-1 h-6 bg-primary rounded-full" />
                          Sammanfattning
                        </h3>
                        {isEditing ? (
                          <textarea
                            value={editedProtocol?.summary || ''}
                            onChange={(e) => setEditedProtocol(prev => prev ? {...prev, summary: e.target.value} : null)}
                            className="w-full min-h-[120px] p-4 text-base leading-relaxed border rounded-md bg-background"
                          />
                        ) : (
                          <p className="text-base leading-relaxed text-foreground/90 pl-4">
                            <SmoothRevealText text={protocol.summary} delay={0} />
                          </p>
                        )}
                      </div>
                    )}

                    {/* Main Points Section */}
                    {(isEditing ? editedProtocol?.mainPoints : protocol.mainPoints) && (isEditing ? editedProtocol?.mainPoints.length : protocol.mainPoints.length) > 0 && (
                      <div className="space-y-3">
                        <h3 className="text-xl font-bold flex items-center gap-2 text-primary">
                          <span className="w-1 h-6 bg-primary rounded-full" />
                          Huvudpunkter
                        </h3>
                        {isEditing ? (
                          <div className="space-y-3">
                            {editedProtocol?.mainPoints.map((point, index) => (
                              <div key={index} className="flex gap-2 items-start">
                                <span className="text-primary mt-3">•</span>
                                <textarea
                                  value={point}
                                  onChange={(e) => {
                                    const newPoints = [...(editedProtocol?.mainPoints || [])];
                                    newPoints[index] = e.target.value;
                                    setEditedProtocol(prev => prev ? {...prev, mainPoints: newPoints} : null);
                                  }}
                                  className="flex-1 min-h-[60px] p-2 text-sm leading-relaxed border rounded-md bg-background"
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <ul className="space-y-3 pl-4">
                            {protocol.mainPoints.map((point, index) => (
                              <li key={index} className="flex gap-3 items-start group">
                                <span className="text-primary mt-1.5 text-lg group-hover:scale-125 transition-transform">•</span>
                                <span className="flex-1 text-base leading-relaxed text-foreground/90">
                                  <SmoothRevealText text={point} delay={index * 100} />
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {/* Decisions Section */}
                    {(isEditing ? editedProtocol?.decisions : protocol.decisions) && (isEditing ? editedProtocol?.decisions.length : protocol.decisions.length) > 0 && (
                      <div className="space-y-3">
                        <h3 className="text-xl font-bold flex items-center gap-2 text-primary">
                          <span className="w-1 h-6 bg-primary rounded-full" />
                          Beslut
                        </h3>
                        {isEditing ? (
                          <div className="space-y-3">
                            {editedProtocol?.decisions.map((decision, index) => (
                              <div key={index} className="flex gap-2 items-start">
                                <span className="text-primary mt-3">✓</span>
                                <textarea
                                  value={decision}
                                  onChange={(e) => {
                                    const newDecisions = [...(editedProtocol?.decisions || [])];
                                    newDecisions[index] = e.target.value;
                                    setEditedProtocol(prev => prev ? {...prev, decisions: newDecisions} : null);
                                  }}
                                  className="flex-1 min-h-[60px] p-2 text-sm leading-relaxed border rounded-md bg-background"
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <ul className="space-y-3 pl-4">
                            {protocol.decisions.map((decision, index) => (
                              <li key={index} className="flex gap-3 items-start group">
                                <span className="text-primary mt-1.5 text-lg group-hover:scale-125 transition-transform">✓</span>
                                <span className="flex-1 text-base leading-relaxed text-foreground/90">
                                  <SmoothRevealText text={decision} delay={index * 100} />
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {/* Action Items Section with Smart Display */}
                    {protocol.actionItems && protocol.actionItems.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="text-xl font-bold flex items-center gap-2 text-primary">
                          <span className="w-1 h-6 bg-primary rounded-full" />
                          Åtgärdspunkter
                        </h3>
                        <div className="space-y-4 pl-4">
                          {protocol.actionItems.map((item, index) => {
                            const isSmartItem = typeof item === 'object' && item.priority;
                            if (!isSmartItem) {
                              // Legacy string format
                              return (
                                <div key={index} className="flex gap-3 items-start group">
                                  <span className="text-primary mt-1.5 text-lg group-hover:scale-125 transition-transform">→</span>
                                  <span className="flex-1 text-base leading-relaxed text-foreground/90">
                                    <SmoothRevealText text={typeof item === 'string' ? item : item.title} delay={index * 100} />
                                  </span>
                                </div>
                              );
                            }
                            
                            // Smart action item display
                            const priorityColors = {
                              critical: 'bg-red-500/10 text-red-700 border-red-200 dark:text-red-400',
                              high: 'bg-orange-500/10 text-orange-700 border-orange-200 dark:text-orange-400',
                              medium: 'bg-yellow-500/10 text-yellow-700 border-yellow-200 dark:text-yellow-400',
                              low: 'bg-green-500/10 text-green-700 border-green-200 dark:text-green-400'
                            };
                            
                            return (
                              <div key={index} className="border rounded-lg p-4 bg-card hover:shadow-md transition-shadow">
                                <div className="flex items-start justify-between gap-3 mb-2">
                                  <h4 className="font-semibold text-foreground flex-1">
                                    <SmoothRevealText text={item.title} delay={index * 100} />
                                  </h4>
                                  <Badge variant="outline" className={priorityColors[item.priority]}>
                                    {item.priority === 'critical' && <AlertCircle className="w-3 h-3 mr-1" />}
                                    {item.priority.toUpperCase()}
                                  </Badge>
                                </div>
                                {item.description && (
                                  <p className="text-sm text-muted-foreground mb-2">
                                    <SmoothRevealText text={item.description} delay={index * 100 + 50} />
                                  </p>
                                )}
                                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                                  {item.owner && (
                                    <div className="flex items-center gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>{item.owner}</span>
                                    </div>
                                  )}
                                  {item.deadline && (
                                    <div className="flex items-center gap-1">
                                      <Clock className="w-3.5 h-3.5" />
                                      <span>{new Date(item.deadline).toLocaleDateString('sv-SE')}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Next Meeting Suggestions - Plus users only */}
                    {hasPlusAccess(user, userPlan) && protocol.nextMeetingSuggestions && protocol.nextMeetingSuggestions.length > 0 && (
                      <div className="space-y-3 bg-primary/5 rounded-lg p-5 border border-primary/20">
                        <h3 className="text-xl font-bold flex items-center gap-2 text-primary">
                          <span className="w-1 h-6 bg-primary rounded-full" />
                          Förslag för nästa möte
                        </h3>
                        <p className="text-sm text-muted-foreground mb-3">AI-genererade förslag baserade på detta möte</p>
                        <ul className="space-y-3 pl-4">
                          {protocol.nextMeetingSuggestions.map((suggestion, index) => (
                            <li key={index} className="flex gap-3 items-start group">
                              <span className="text-primary mt-1.5 text-lg group-hover:scale-125 transition-transform">→</span>
                              <span className="flex-1 text-base leading-relaxed text-foreground/90">
                                <SmoothRevealText text={suggestion} delay={index * 100} />
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Transcript section intentionally removed to prevent exposing raw transcript in protocol view */}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex flex-wrap justify-center gap-3 md:gap-4">
              {!isFreeTrialMode && (
                <Button onClick={onBack} variant="outline" size="lg" className="gap-2 min-w-[160px]">
                  <ArrowLeft className="w-4 h-4" />
                  Nytt möte
                </Button>
              )}
              {!isEditing ? (
                <>
                  <Button onClick={() => setIsEditing(true)} variant="outline" size="lg" className="gap-2 min-w-[160px]">
                    Redigera
                  </Button>
                  <Button onClick={() => setEmailDialogOpen(true)} variant="outline" size="lg" className="gap-2 min-w-[160px]">
                    <Mail className="w-4 h-4" />
                    E-posta
                  </Button>
                  <Button onClick={handleDownload} size="lg" className="gap-2 min-w-[160px] bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70">
                    <Download className="w-4 h-4" />
                    Ladda ner
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={handleCancelEdit} variant="outline" size="lg" className="gap-2 min-w-[160px]">
                    Avbryt
                  </Button>
                  <Button onClick={handleSaveEdits} size="lg" className="gap-2 min-w-[160px]">
                    Spara ändringar
                  </Button>
                </>
              )}
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
