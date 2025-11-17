import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, Save, ArrowLeft, FileText, CheckCircle2, Loader2, Share2 } from "lucide-react";
import { Document, Paragraph, HeadingLevel, AlignmentType, Packer } from "docx";
import { saveAs } from "file-saver";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { generateMeetingTitle } from "@/lib/titleGenerator";
import { useToast } from "@/hooks/use-toast";
import { EmailDialog } from "@/components/EmailDialog";
import { backendApi } from "@/lib/backendApi";

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
  const [progress, setProgress] = useState(0);
  const [documentBlob, setDocumentBlob] = useState<Blob | null>(null);
  const [fileName, setFileName] = useState("Mötesprotokoll.docx");
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const hasGeneratedRef = useRef(false);

  useEffect(() => {
    if (aiProtocol || hasGeneratedRef.current) return;
    hasGeneratedRef.current = true;

    const generateProtocol = async () => {
      setIsGenerating(true);
      
      // Slower, smoother progress animation
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 85) return prev;
          return prev + Math.random() * 2;
        });
      }, 300);

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
        
        // Complete progress
        clearInterval(progressInterval);
        setProgress(100);
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
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
        clearInterval(progressInterval);
        toast({
          title: "Fel vid generering",
          description: "Kunde inte generera protokollet. Försök igen.",
          variant: "destructive",
          duration: 2500,
        });
      } finally {
        setIsGenerating(false);
      }
    };

    generateProtocol();
  }, [transcript, aiProtocol]);

  const fetchAgendaContent = async (id: string): Promise<string> => {
    try {
      // Fetch from backend API instead of Supabase
      const token = localStorage.getItem('authToken');
      if (!token) {
        console.warn('⚠️ No auth token - skipping agenda fetch');
        return '';
      }

      const response = await fetch(`https://api.tivly.se/agendas/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch agenda: ${response.status}`);
      }

      const data = await response.json();
      return data?.content || '';
    } catch (error) {
      console.error('Error fetching agenda:', error);
      return '';
    }
  };

  const saveActionItems = async (items: AIActionItem[], meetingId: string, userId: string) => {
    try {
      // Save to backend API instead of Supabase
      const token = localStorage.getItem('authToken');
      if (!token) {
        console.warn('⚠️ No auth token - skipping action items save');
        return;
      }

      const response = await fetch(`https://api.tivly.se/meetings/${meetingId}/action-items`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ actionItems: items }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to save action items: ${errorText}`);
      }

      console.log('✅ Action items saved to backend successfully');
    } catch (error) {
      console.error('Error saving action items:', error);
      // Non-blocking - protocol generation continues even if action items fail
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
    
    // CRITICAL: Automatically save protocol to backend immediately after generation
    if (meetingId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(meetingId)) {
      try {
        console.log('💾 Auto-saving protocol to meeting:', meetingId);
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        
        await new Promise<void>((resolve, reject) => {
          reader.onload = async () => {
            try {
              const base64 = reader.result as string;
              await backendApi.saveProtocol(meetingId, {
                fileName: `${title}.docx`,
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                documentBlob: base64,
              });
              console.log('✅ Protocol auto-saved to meeting successfully');
              resolve();
            } catch (error) {
              console.error('❌ Failed to auto-save protocol:', error);
              reject(error);
            }
          };
          reader.onerror = reject;
        });
      } catch (error) {
        console.error('❌ Protocol auto-save failed (non-blocking):', error);
        // Don't throw - let user still see and download the protocol
      }
    } else {
      console.log('⚠️ Skipping auto-save - no valid meeting ID:', meetingId);
    }
  };

  const handleDownload = () => {
    if (documentBlob) {
      saveAs(documentBlob, fileName);
      toast({
        title: "Nedladdning startad",
        description: "Protokollet laddas ner till din enhet.",
        duration: 2000,
      });
    }
  };

  const handleSave = async () => {
    // Helper to check if a string is a valid UUID
    const isValidUUID = (id: string) => {
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
    };

    // CRITICAL: The protocol is already auto-saved to the meeting during generation
    // This button is just for user confirmation and navigation
    
    if (!meetingId || !isValidUUID(meetingId)) {
      console.warn('⚠️ No valid meeting ID - protocol already generated, navigating to library');
      toast({
        title: "Protokoll klart",
        description: "Protokollet har genererats och är tillgängligt i biblioteket.",
        duration: 2000,
      });
      navigate("/library");
      return;
    }

    // Protocol is already saved via backend during generation
    // Just provide user feedback and navigate
    toast({
      title: "Protokoll sparat",
      description: "Protokollet har sparats på mötet och finns i ditt bibliotek.",
      duration: 2000,
    });
    
    navigate("/library");
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'text-red-600 dark:text-red-400';
      case 'high': return 'text-orange-600 dark:text-orange-400';
      case 'medium': return 'text-yellow-600 dark:text-yellow-400';
      case 'low': return 'text-green-600 dark:text-green-400';
      default: return 'text-muted-foreground';
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
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 space-y-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="relative">
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">Genererar protokoll</h3>
              <p className="text-sm text-muted-foreground">AI analyserar ditt möte...</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-center text-muted-foreground">
              {Math.round(progress)}%
            </p>
          </div>
        </Card>
      </div>
    );
  }

  if (!generatedProtocol) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background border-b">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Tillbaka
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowEmailDialog(true)}
                disabled={!documentBlob}
              >
                <Share2 className="w-4 h-4 mr-2" />
                Dela
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={!documentBlob}
              >
                <Download className="w-4 h-4 mr-2" />
                Ladda ner
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
              >
                <Save className="w-4 h-4 mr-2" />
                Spara
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card className="p-8 animate-fadeIn">
          {/* Title */}
          <div className="mb-8 pb-6 border-b">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h1 className="text-3xl font-bold mb-2">
                  {fileName.replace('.docx', '')}
                </h1>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{new Date(meetingCreatedAt || Date.now()).toLocaleDateString('sv-SE')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Content sections */}
          <div className="space-y-8">
            {/* Summary */}
            <div>
              <h2 className="text-xl font-semibold mb-3">Sammanfattning</h2>
              <p className="text-muted-foreground leading-relaxed">
                {generatedProtocol.summary}
              </p>
            </div>

            {/* Main Points */}
            <div>
              <h2 className="text-xl font-semibold mb-3">Huvudpunkter</h2>
              <ul className="space-y-2">
                {generatedProtocol.mainPoints.map((point, index) => (
                  <li key={index} className="flex gap-3">
                    <span className="text-primary font-medium">{index + 1}.</span>
                    <span className="text-muted-foreground">{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Decisions */}
            {generatedProtocol.decisions.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold mb-3">Beslut</h2>
                <ul className="space-y-2">
                  {generatedProtocol.decisions.map((decision, index) => (
                    <li key={index} className="flex gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{decision}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action Items */}
            {generatedProtocol.actionItems.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold mb-3">Åtgärdspunkter</h2>
                <div className="space-y-4">
                  {generatedProtocol.actionItems.map((item, index) => (
                    <div key={index} className="pl-4 border-l-2 border-primary/20">
                      <div className="flex items-start justify-between gap-4 mb-1">
                        <h3 className="font-medium">{item.title}</h3>
                        <span className={`text-xs font-medium ${getPriorityColor(item.priority)}`}>
                          {getPriorityLabel(item.priority)}
                        </span>
                      </div>
                      {item.description && (
                        <p className="text-sm text-muted-foreground mb-2">{item.description}</p>
                      )}
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        {item.owner && <span>Ansvarig: {item.owner}</span>}
                        {item.deadline && <span>Deadline: {item.deadline}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </Card>
      </div>

      <EmailDialog
        open={showEmailDialog}
        onOpenChange={setShowEmailDialog}
        documentBlob={documentBlob}
        fileName={fileName}
      />
    </div>
  );
};
