import { useState, useEffect } from "react";
import { Download, Mail, Loader2, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { saveAs } from "file-saver";
import { EmailDialog } from "./EmailDialog";
import { analyzeMeeting } from "@/lib/backend";

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
}

interface FreeUserProtocolDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transcript: string;
  meetingCreatedAt: string;
  meetingName: string;
}

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
      }, 8); // Slower reveal for "pretty and slow"

      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(timeout);
  }, [text, delay]);

  return <>{displayText}</>;
};

export const FreeUserProtocolDialog = ({
  open,
  onOpenChange,
  transcript,
  meetingCreatedAt,
  meetingName
}: FreeUserProtocolDialogProps) => {
  const [isGenerating, setIsGenerating] = useState(true);
  const [progress, setProgress] = useState(0);
  const [protocol, setProtocol] = useState<AIProtocol | null>(null);
  const [documentBlob, setDocumentBlob] = useState<Blob | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    
    let cancelled = false;
    
    const generateProtocol = async () => {
      try {
        setIsGenerating(true);
        setProgress(5);
        setShowContent(false);
        
        // Simulate slow, pretty generation
        await new Promise(resolve => setTimeout(resolve, 800));
        setProgress(15);
        
        const meetingDate = new Date(meetingCreatedAt);
        const dateStr = meetingDate.toLocaleDateString('sv-SE');
        const timeStr = meetingDate.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
        
        setProgress(25);
        await new Promise(resolve => setTimeout(resolve, 600));
        
        // Generate AI protocol
        setProgress(35);
        const data = await analyzeMeeting({ 
          transcript, 
          meetingName 
        });
        
        if (cancelled) return;
        
        setProgress(60);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const finalProtocol: AIProtocol = {
          title: data.title || meetingName,
          summary: data.summary || '',
          mainPoints: Array.isArray(data.mainPoints) ? data.mainPoints : [],
          decisions: Array.isArray(data.decisions) ? data.decisions : [],
          actionItems: Array.isArray(data.actionItems) ? data.actionItems : [],
        };
        
        if (cancelled) return;
        setProtocol(finalProtocol);
        setProgress(75);
        
        // Generate Word document
        const doc = new Document({
          sections: [{
            properties: {},
            children: [
              new Paragraph({
                text: "MÖTESPROTOKOLL",
                heading: HeadingLevel.TITLE,
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 },
              }),
              new Paragraph({
                children: [new TextRun({ text: finalProtocol.title, bold: true, size: 32 })],
                spacing: { after: 300 },
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: "Datum: ", bold: true }),
                  new TextRun(dateStr),
                  new TextRun({ text: " | Tid: ", bold: true }),
                  new TextRun(timeStr),
                ],
                spacing: { after: 300 },
              }),
              new Paragraph({
                text: "─────────────────────────────────────────",
                spacing: { after: 300 },
              }),
              new Paragraph({
                text: "Sammanfattning",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 200, after: 200 },
              }),
              new Paragraph({ text: finalProtocol.summary, spacing: { after: 300 } }),
              new Paragraph({
                text: "Huvudpunkter",
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 200, after: 200 },
              }),
              ...finalProtocol.mainPoints.map(point => 
                new Paragraph({ text: `• ${point}`, spacing: { after: 100 } })
              ),
              ...(finalProtocol.decisions.length > 0 ? [
                new Paragraph({ 
                  text: "Beslut", 
                  heading: HeadingLevel.HEADING_1, 
                  spacing: { before: 300, after: 200 } 
                }),
                ...finalProtocol.decisions.map(decision => 
                  new Paragraph({ text: `• ${decision}`, spacing: { after: 100 } })
                ),
              ] : []),
              ...(finalProtocol.actionItems.length > 0 ? [
                new Paragraph({ 
                  text: "Åtgärdspunkter", 
                  heading: HeadingLevel.HEADING_1, 
                  spacing: { before: 300, after: 200 } 
                }),
                ...finalProtocol.actionItems.map(item => 
                  new Paragraph({ text: `• ${item}`, spacing: { after: 100 } })
                ),
              ] : []),
              new Paragraph({ text: "", spacing: { before: 600 } }),
              new Paragraph({
                text: "─────────────────────────────────────────",
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 },
              }),
              new Paragraph({
                children: [new TextRun({ text: "TIVLY - GRATIS PLAN", bold: true, size: 24 })],
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
            ],
          }],
        });
        
        setProgress(90);
        await new Promise(resolve => setTimeout(resolve, 400));
        
        const blob = await Packer.toBlob(doc);
        const generatedFileName = `Motesprotokoll_${dateStr}_${timeStr.replace(':', '-')}.docx`;
        
        if (cancelled) return;
        
        setDocumentBlob(blob);
        setFileName(generatedFileName);
        setProgress(100);
        
        await new Promise(resolve => setTimeout(resolve, 600));
        setIsGenerating(false);
        setShowContent(true);
        
      } catch (error) {
        console.error("Protocol generation error:", error);
        if (!cancelled) {
          setIsGenerating(false);
          toast({ 
            title: "Fel", 
            description: "Kunde inte generera protokollet. Försök igen.", 
            variant: "destructive" 
          });
        }
      }
    };
    
    generateProtocol();
    return () => { cancelled = true; };
  }, [open, transcript, meetingCreatedAt, meetingName, toast]);

  const handleDownload = () => {
    if (documentBlob && fileName) {
      saveAs(documentBlob, fileName);
      toast({
        title: "Nedladdning startad!",
        description: `${fileName} laddas ner nu.`,
      });
    }
  };

  const displayDate = new Date(meetingCreatedAt);
  const dateStr = displayDate.toLocaleDateString('sv-SE');
  const timeStr = displayDate.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b p-4 flex items-center justify-between">
            <h2 className="text-xl font-bold">Genererar protokoll...</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="p-6">
            {isGenerating ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-6">
                <div className="relative">
                  <Loader2 className="w-16 h-16 animate-spin text-primary" />
                  <div className="absolute inset-0 blur-xl bg-primary/20 animate-pulse" />
                </div>
                <div className="text-center space-y-2">
                  <p className="text-lg font-medium animate-pulse">Genererar ditt protokoll...</p>
                  <div className="w-64 h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-500 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">{progress}%</p>
                </div>
              </div>
            ) : (
              protocol && showContent && (
                <div className="space-y-8 animate-fade-in">
                  {/* Header */}
                  <div className="text-center space-y-3 pb-6 border-b">
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                      MÖTESPROTOKOLL
                    </h1>
                    <h2 className="text-xl font-semibold text-primary">
                      {protocol.title}
                    </h2>
                    <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
                      <span>📅 {dateStr}</span>
                      <span>•</span>
                      <span>🕐 {timeStr}</span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="space-y-6">
                    {protocol.summary && (
                      <div className="space-y-2">
                        <h3 className="text-lg font-bold flex items-center gap-2">
                          <span className="w-1 h-5 bg-primary rounded-full" />
                          Sammanfattning
                        </h3>
                        <p className="text-foreground/90 leading-relaxed pl-4">
                          <SmoothRevealText text={protocol.summary} delay={0} />
                        </p>
                      </div>
                    )}

                    {protocol.mainPoints.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-lg font-bold flex items-center gap-2">
                          <span className="w-1 h-5 bg-primary rounded-full" />
                          Huvudpunkter
                        </h3>
                        <ul className="space-y-2 pl-4">
                          {protocol.mainPoints.map((point, index) => (
                            <li key={index} className="flex gap-2 items-start">
                              <span className="text-primary mt-1">•</span>
                              <span className="flex-1 text-foreground/90">
                                <SmoothRevealText text={point} delay={index * 100} />
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {protocol.decisions.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-lg font-bold flex items-center gap-2">
                          <span className="w-1 h-5 bg-primary rounded-full" />
                          Beslut
                        </h3>
                        <ul className="space-y-2 pl-4">
                          {protocol.decisions.map((decision, index) => (
                            <li key={index} className="flex gap-2 items-start">
                              <span className="text-primary mt-1">✓</span>
                              <span className="flex-1 text-foreground/90">
                                <SmoothRevealText text={decision} delay={index * 100} />
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {protocol.actionItems.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-lg font-bold flex items-center gap-2">
                          <span className="w-1 h-5 bg-primary rounded-full" />
                          Åtgärdspunkter
                        </h3>
                        <ul className="space-y-2 pl-4">
                          {protocol.actionItems.map((item, index) => {
                            const itemText = typeof item === 'string' 
                              ? item 
                              : `${item.title}${item.description ? ` - ${item.description}` : ''}${item.owner ? ` (${item.owner})` : ''}`;
                            return (
                              <li key={index} className="flex gap-2 items-start">
                                <span className="text-primary mt-1">→</span>
                                <span className="flex-1 text-foreground/90">
                                  <SmoothRevealText text={itemText} delay={index * 100} />
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Free user watermark */}
                  <div className="pt-6 border-t text-center space-y-2">
                    <p className="text-sm font-bold text-primary">TIVLY - GRATIS PLAN</p>
                    <p className="text-xs text-muted-foreground">
                      Uppgradera till Standard eller Plus för obegränsade protokoll utan vattenstämpel
                    </p>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-3 pt-4">
                    <Button
                      onClick={handleDownload}
                      className="flex-1"
                      size="lg"
                      disabled={!documentBlob}
                    >
                      <Download className="mr-2 h-5 w-5" />
                      Ladda ner Word
                    </Button>
                    <Button
                      onClick={() => setEmailDialogOpen(true)}
                      variant="outline"
                      className="flex-1"
                      size="lg"
                      disabled={!documentBlob}
                    >
                      <Mail className="mr-2 h-5 w-5" />
                      Skicka via mail
                    </Button>
                  </div>
                </div>
              )
            )}
          </div>
        </DialogContent>
      </Dialog>

      {documentBlob && (
        <EmailDialog
          open={emailDialogOpen}
          onOpenChange={setEmailDialogOpen}
          documentBlob={documentBlob}
          fileName={fileName}
        />
      )}
    </>
  );
};
