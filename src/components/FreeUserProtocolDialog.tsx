import { useState, useEffect } from "react";
import { Download, Mail, Loader2, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { saveAs } from "file-saver";
import { EmailDialog } from "./EmailDialog";
import { ConfirmCloseProtocolDialog } from "./ConfirmCloseProtocolDialog";
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
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const [hasShared, setHasShared] = useState(false);
  const { toast } = useToast();
  
  // Check if running on iOS app domain
  const isIosApp = typeof window !== 'undefined' && window.location.hostname === 'io.tivly.se';

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
        
        setProgress(90);
        await new Promise(resolve => setTimeout(resolve, 400));

        // Build final doc
        const finalChildren = [
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
            children: [new TextRun({ text: "TIVLY - GRATIS PLAN", bold: true, size: 24 })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
          }),
          new Paragraph({
            text: "Uppgradera till Tivly Pro eller Plus för obegränsade protokoll utan vattenstämpel",
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "dokumenterat av tivly.se",
                color: "AAAAAA",
                size: 14,
                font: "Helvetica",
              }),
            ],
            alignment: AlignmentType.CENTER,
          }),
        ];

        const finalDoc = new Document({
          sections: [{
            properties: {},
            children: finalChildren,
          }],
        });
        
        const blob = await Packer.toBlob(finalDoc);
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
      setHasDownloaded(true);
      toast({
        title: "Nedladdning startad!",
        description: `${fileName} laddas ner nu.`,
      });
    }
  };

  // Intercept close attempts to show warning
  const handleCloseAttempt = () => {
    if (protocol && showContent && !isGenerating) {
      setShowCloseConfirm(true);
    } else {
      onOpenChange(false);
    }
  };

  const handleConfirmClose = () => {
    setShowCloseConfirm(false);
    onOpenChange(false);
  };

  const handleShareFromDialog = () => {
    setShowCloseConfirm(false);
    setEmailDialogOpen(true);
    setHasShared(true);
  };

  // Intercept dialog onOpenChange
  const handleDialogOpenChange = (isOpen: boolean) => {
    if (!isOpen && protocol && showContent && !isGenerating) {
      setShowCloseConfirm(true);
    } else {
      onOpenChange(isOpen);
    }
  };

  const displayDate = new Date(meetingCreatedAt);
  const dateStr = displayDate.toLocaleDateString('sv-SE');
  const timeStr = displayDate.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b p-4 flex items-center justify-between">
            <h2 className="text-xl font-bold">{showContent ? 'Ditt protokoll' : 'Genererar protokoll...'}</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCloseAttempt}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="p-6">
            {isGenerating ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-8">
                {/* Elegant loading animation */}
                <div className="relative w-32 h-32">
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
                <div className="text-center space-y-3 max-w-md">
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
                <div className="w-full max-w-sm space-y-2">
                  <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden backdrop-blur">
                    <div 
                      className="h-full bg-gradient-to-r from-primary via-primary/80 to-primary rounded-full transition-all duration-500 ease-out relative"
                      style={{ width: `${progress}%` }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground font-medium text-center">{Math.round(progress)}% slutfört</p>
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

                  {/* Free user watermark - different text for iOS */}
                  <div className="pt-6 border-t text-center space-y-2">
                    <p className="text-sm font-bold text-primary">TIVLY - GRATIS PLAN</p>
                    <p className="text-xs text-muted-foreground">
                      {isIosApp 
                        ? 'Ändringar av din plan görs på din kontosida på webben.'
                        : 'Uppgradera till Tivly Pro eller Plus för obegränsade protokoll utan vattenstämpel'}
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
                      onClick={() => {
                        setEmailDialogOpen(true);
                        setHasShared(true);
                      }}
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

      <ConfirmCloseProtocolDialog
        open={showCloseConfirm}
        onOpenChange={setShowCloseConfirm}
        onConfirmClose={handleConfirmClose}
        onDownload={handleDownload}
        onShare={handleShareFromDialog}
        isFreeUser={true}
        hasDownloaded={hasDownloaded}
        hasShared={hasShared}
      />
    </>
  );
};
