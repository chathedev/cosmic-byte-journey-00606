import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, Save, ArrowLeft, FileText, CheckCircle2, Clock, Users, Target, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { Document, Paragraph, HeadingLevel, AlignmentType, Packer } from "docx";
import { saveAs } from "file-saver";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { generateMeetingTitle } from "@/lib/titleGenerator";
import { useToast } from "@/hooks/use-toast";

// TypeWriter component for smooth text reveal
const TypeWriter = ({ 
  text, 
  delay = 0,
  speed = 15 
}: { 
  text: string; 
  delay?: number;
  speed?: number;
}) => {
  const [displayedText, setDisplayedText] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const startTimer = setTimeout(() => {
      setStarted(true);
    }, delay);

    return () => clearTimeout(startTimer);
  }, [delay]);

  useEffect(() => {
    if (!started) return;
    
    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex <= text.length) {
        setDisplayedText(text.slice(0, currentIndex));
        currentIndex++;
      } else {
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, started, speed]);

  return <span>{displayedText}</span>;
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
  showWidget?: boolean;
  onProtocolReady?: () => void;
  isFreeTrialMode?: boolean;
  meetingCreatedAt?: string;
  agendaId?: string;
  meetingId?: string;
  userId?: string;
}

export const AutoProtocolGenerator = ({
  transcript,
  aiProtocol,
  onBack,
  showWidget = true,
  onProtocolReady,
  isFreeTrialMode = false,
  meetingCreatedAt,
  agendaId,
  meetingId,
  userId,
}: AutoProtocolGeneratorProps) => {
  const [generatedProtocol, setGeneratedProtocol] = useState<AIProtocol | null>(aiProtocol);
  const [isGenerating, setIsGenerating] = useState(!aiProtocol);
  const [generationStep, setGenerationStep] = useState(0);
  const [documentBlob, setDocumentBlob] = useState<Blob | null>(null);
  const [fileName, setFileName] = useState("Mötesprotokoll.docx");
  const [isExpanded, setIsExpanded] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const hasGeneratedRef = useRef(false);

  const generationSteps = [
    { icon: Sparkles, text: "Analyserar transkription...", duration: 800 },
    { icon: Users, text: "Identifierar deltagare och samtalsämnen...", duration: 1000 },
    { icon: Target, text: "Extraherar viktiga beslut och åtgärdspunkter...", duration: 1200 },
    { icon: FileText, text: "Strukturerar protokollet...", duration: 800 },
    { icon: CheckCircle2, text: "Färdigställer dokument...", duration: 600 },
  ];

  useEffect(() => {
    if (aiProtocol || hasGeneratedRef.current) return;
    hasGeneratedRef.current = true;

    const generateProtocol = async () => {
      setIsGenerating(true);
      
      // Animate through steps
      for (let i = 0; i < generationSteps.length; i++) {
        setGenerationStep(i);
        await new Promise(resolve => setTimeout(resolve, generationSteps[i].duration));
      }

      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-meeting`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({
              transcript,
              meetingName: fileName.replace('.docx', ''),
              agenda: agendaId ? await fetchAgendaContent(agendaId) : undefined,
            }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to generate protocol");
        }

        const data = await response.json();
        setGeneratedProtocol(data);

        // Generate title
        const title = await generateMeetingTitle(transcript);
        setFileName(`${title}.docx`);

        // Save action items if we have meeting data
        if (meetingId && user && data.actionItems?.length > 0) {
          await saveActionItems(data.actionItems, meetingId, user.uid);
        }

        // Generate document
        await generateDocument(data, title);
        
        if (onProtocolReady) {
          onProtocolReady();
        }
      } catch (error) {
        console.error("Error generating protocol:", error);
        toast({
          title: "Fel vid generering",
          description: "Kunde inte generera protokollet. Försök igen.",
          variant: "destructive",
        });
      } finally {
        setIsGenerating(false);
      }
    };

    generateProtocol();
  }, [transcript, aiProtocol]);

  const fetchAgendaContent = async (id: string): Promise<string> => {
    try {
      const { data, error } = await supabase
        .from('meeting_agendas')
        .select('content')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data?.content || '';
    } catch (error) {
      console.error('Error fetching agenda:', error);
      return '';
    }
  };

  const saveActionItems = async (items: AIActionItem[], meetingId: string, userId: string) => {
    try {
      const actionItems = items.map(item => ({
        meeting_id: meetingId,
        user_id: userId,
        title: item.title,
        description: item.description || null,
        owner: item.owner || null,
        deadline: item.deadline || null,
        priority: item.priority,
        status: 'pending',
      }));

      const { error } = await supabase
        .from('action_items')
        .insert(actionItems);

      if (error) throw error;
    } catch (error) {
      console.error('Error saving action items:', error);
    }
  };

  const generateDocument = async (protocol: AIProtocol, title: string) => {
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: title,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          new Paragraph({
            text: `Datum: ${new Date(meetingCreatedAt || Date.now()).toLocaleDateString('sv-SE')}`,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          new Paragraph({
            text: "Sammanfattning",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 200 },
          }),
          new Paragraph({
            text: protocol.summary,
            spacing: { after: 300 },
          }),
          new Paragraph({
            text: "Huvudpunkter",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 200 },
          }),
          ...protocol.mainPoints.map(point => 
            new Paragraph({
              text: point,
              bullet: { level: 0 },
              spacing: { after: 100 },
            })
          ),
          new Paragraph({
            text: "Beslut",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 200 },
          }),
          ...protocol.decisions.map(decision => 
            new Paragraph({
              text: decision,
              bullet: { level: 0 },
              spacing: { after: 100 },
            })
          ),
          new Paragraph({
            text: "Åtgärdspunkter",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 200 },
          }),
          ...protocol.actionItems.flatMap(item => [
            new Paragraph({
              text: item.title,
              bullet: { level: 0 },
              spacing: { after: 50 },
            }),
            ...(item.description ? [new Paragraph({
              text: item.description,
              bullet: { level: 1 },
              spacing: { after: 50 },
            })] : []),
            ...(item.owner ? [new Paragraph({
              text: `Ansvarig: ${item.owner}`,
              bullet: { level: 1 },
              spacing: { after: 50 },
            })] : []),
            ...(item.deadline ? [new Paragraph({
              text: `Deadline: ${item.deadline}`,
              bullet: { level: 1 },
              spacing: { after: 100 },
            })] : []),
          ]),
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    setDocumentBlob(blob);
  };

  const handleDownload = () => {
    if (documentBlob) {
      saveAs(documentBlob, fileName);
      toast({
        title: "Nedladdning startad",
        description: "Protokollet laddas ner till din enhet.",
      });
    }
  };

  const handleSave = () => {
    toast({
      title: "Protokoll sparat",
      description: "Protokollet finns nu i ditt bibliotek.",
    });
    navigate("/library");
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20';
      case 'high': return 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20';
      case 'medium': return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20';
      case 'low': return 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'critical': return 'Kritisk';
      case 'high': return 'Hög';
      case 'medium': return 'Medium';
      case 'low': return 'Låg';
      default: return priority;
    }
  };

  if (isGenerating) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full">
          <Card className="p-8 md:p-12 backdrop-blur-sm bg-card/80 border-primary/10 shadow-2xl">
            <div className="space-y-8">
              {/* Logo/Icon */}
              <div className="flex justify-center">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/20">
                    <FileText className="w-10 h-10 text-primary-foreground" />
                  </div>
                  <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping"></div>
                </div>
              </div>

              {/* Title */}
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  Genererar protokoll
                </h2>
                <p className="text-muted-foreground">AI analyserar ditt möte och skapar ett strukturerat protokoll</p>
              </div>

              {/* Progress Steps */}
              <div className="space-y-4 py-8">
                {generationSteps.map((step, index) => {
                  const StepIcon = step.icon;
                  const isActive = index === generationStep;
                  const isCompleted = index < generationStep;
                  
                  return (
                    <div 
                      key={index}
                      className={`flex items-center gap-4 p-4 rounded-lg transition-all duration-500 ${
                        isActive 
                          ? 'bg-primary/10 scale-105 shadow-lg shadow-primary/10' 
                          : isCompleted
                          ? 'bg-muted/50 opacity-60'
                          : 'bg-muted/20 opacity-40'
                      }`}
                      style={{
                        animation: isActive ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none'
                      }}
                    >
                      <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
                        isActive 
                          ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30' 
                          : isCompleted
                          ? 'bg-primary/60 text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      } transition-all duration-500`}>
                        <StepIcon className={`w-6 h-6 ${isActive ? 'animate-bounce' : ''}`} />
                      </div>
                      <div className="flex-1">
                        <p className={`font-medium transition-colors duration-500 ${
                          isActive ? 'text-foreground' : 'text-muted-foreground'
                        }`}>
                          {step.text}
                        </p>
                      </div>
                      {isCompleted && (
                        <CheckCircle2 className="w-6 h-6 text-primary animate-scale-in" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-500 ease-out"
                    style={{ width: `${((generationStep + 1) / generationSteps.length) * 100}%` }}
                  />
                </div>
                <p className="text-sm text-center text-muted-foreground">
                  {Math.round(((generationStep + 1) / generationSteps.length) * 100)}% färdigt
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (!generatedProtocol) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="hover:bg-muted"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Tillbaka
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={!documentBlob}
                className="hover:bg-primary/10"
              >
                <Download className="w-4 h-4 mr-2" />
                Ladda ner
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                className="bg-primary hover:bg-primary/90"
              >
                <Save className="w-4 h-4 mr-2" />
                Spara i bibliotek
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="space-y-6">
          {/* Title Card */}
          <Card className="p-8 backdrop-blur-sm bg-card/80 border-primary/10 shadow-lg animate-fadeInUp" style={{ animationDelay: '100ms' }}>
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg shadow-primary/20">
                <FileText className="w-7 h-7 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <h1 className="text-3xl md:text-4xl font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                  <TypeWriter text={fileName.replace('.docx', '')} speed={30} />
                </h1>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span>{new Date(meetingCreatedAt || Date.now()).toLocaleDateString('sv-SE')}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    <span className="text-primary font-medium">Färdigt</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Summary Card */}
          <Card className="p-6 backdrop-blur-sm bg-card/80 border-primary/10 shadow-lg animate-fadeInUp" style={{ animationDelay: '200ms' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold">Sammanfattning</h2>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              <TypeWriter text={generatedProtocol.summary} delay={300} speed={8} />
            </p>
          </Card>

          {/* Main Points Card */}
          <Card className="p-6 backdrop-blur-sm bg-card/80 border-primary/10 shadow-lg animate-fadeInUp" style={{ animationDelay: '300ms' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="text-2xl font-semibold">Huvudpunkter</h2>
            </div>
            <ul className="space-y-3">
              {generatedProtocol.mainPoints.map((point, index) => (
                <li 
                  key={index} 
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors animate-fadeInUp"
                  style={{ animationDelay: `${400 + index * 100}ms` }}
                >
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center mt-0.5">
                    <span className="text-xs font-bold text-primary">{index + 1}</span>
                  </div>
                  <p className="text-muted-foreground flex-1">
                    <TypeWriter text={point} delay={400 + index * 100} speed={5} />
                  </p>
                </li>
              ))}
            </ul>
          </Card>

          {/* Decisions Card */}
          {generatedProtocol.decisions.length > 0 && (
            <Card className="p-6 backdrop-blur-sm bg-card/80 border-primary/10 shadow-lg animate-fadeInUp" style={{ animationDelay: '500ms' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <h2 className="text-2xl font-semibold">Beslut</h2>
              </div>
              <ul className="space-y-3">
                {generatedProtocol.decisions.map((decision, index) => (
                  <li 
                    key={index} 
                    className="flex items-start gap-3 p-3 rounded-lg bg-green-500/5 hover:bg-green-500/10 transition-colors border border-green-500/20 animate-fadeInUp"
                    style={{ animationDelay: `${600 + index * 100}ms` }}
                  >
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                    <p className="text-muted-foreground flex-1">
                      <TypeWriter text={decision} delay={600 + index * 100} speed={5} />
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Action Items Card */}
          {generatedProtocol.actionItems.length > 0 && (
            <Card className="p-6 backdrop-blur-sm bg-card/80 border-primary/10 shadow-lg animate-fadeInUp" style={{ animationDelay: '700ms' }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <Target className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <h2 className="text-2xl font-semibold">Åtgärdspunkter</h2>
              </div>
              <div className="space-y-4">
                {generatedProtocol.actionItems.map((item, index) => (
                  <div 
                    key={index}
                    className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-all border border-border/50 hover:border-primary/30 animate-fadeInUp"
                    style={{ animationDelay: `${800 + index * 100}ms` }}
                  >
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <h3 className="font-semibold text-lg flex-1">
                        <TypeWriter text={item.title} delay={800 + index * 100} speed={10} />
                      </h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getPriorityColor(item.priority)}`}>
                        {getPriorityLabel(item.priority)}
                      </span>
                    </div>
                    {item.description && (
                      <p className="text-sm text-muted-foreground mb-3">
                        <TypeWriter text={item.description} delay={900 + index * 100} speed={5} />
                      </p>
                    )}
                    <div className="flex flex-wrap gap-4 text-sm">
                      {item.owner && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Users className="w-4 h-4" />
                          <span>{item.owner}</span>
                        </div>
                      )}
                      {item.deadline && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          <span>{item.deadline}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Transcript Card (Collapsible) */}
          <Card className="backdrop-blur-sm bg-card/80 border-primary/10 shadow-lg animate-fadeInUp" style={{ animationDelay: '900ms' }}>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full p-6 flex items-center justify-between hover:bg-muted/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <h2 className="text-2xl font-semibold">Transkription</h2>
              </div>
              {isExpanded ? (
                <ChevronUp className="w-5 h-5 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-5 h-5 text-muted-foreground" />
              )}
            </button>
            {isExpanded && (
              <div className="px-6 pb-6">
                <div className="p-4 rounded-lg bg-muted/30 max-h-96 overflow-y-auto">
                  <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {transcript}
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
