import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Share2, X, FileText, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EmailDialog } from "@/components/EmailDialog";
import mammoth from "mammoth";

interface ProtocolViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  protocol: {
    fileName: string;
    mimeType: string;
    blob: string;
    storedAt: string;
    size: number;
  } | null;
}

interface ParsedProtocol {
  summary: string;
  mainPoints: string[];
  decisions: string[];
  actionItems: Array<{
    title: string;
    description?: string;
    owner?: string;
    deadline?: string;
    priority?: string;
  }>;
  nextMeetingSuggestions?: string[];
}

export const ProtocolViewerDialog = ({
  open,
  onOpenChange,
  protocol,
}: ProtocolViewerDialogProps) => {
  const [parsedProtocol, setParsedProtocol] = useState<ParsedProtocol | null>(null);
  const [loading, setLoading] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const { toast } = useToast();

  // Parse HTML content into structured sections
  const parseProtocolContent = (html: string): ParsedProtocol => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const text = doc.body.textContent || '';
    
    const parsed: ParsedProtocol = {
      summary: '',
      mainPoints: [],
      decisions: [],
      actionItems: [],
      nextMeetingSuggestions: []
    };

    // Split by common headings
    const sections = text.split(/(?=Sammanfattning|Huvudpunkter|Beslut|Åtgärdspunkter|Action Items|Nästa möte)/i);
    
    sections.forEach(section => {
      const lowerSection = section.toLowerCase();
      
      if (lowerSection.startsWith('sammanfattning')) {
        parsed.summary = section.replace(/sammanfattning:?/i, '').trim();
      } else if (lowerSection.startsWith('huvudpunkter')) {
        const content = section.replace(/huvudpunkter:?/i, '').trim();
        parsed.mainPoints = content
          .split(/\n+/)
          .map(p => p.replace(/^\d+\.\s*|^[-•]\s*/, '').trim())
          .filter(p => p.length > 0);
      } else if (lowerSection.startsWith('beslut')) {
        const content = section.replace(/beslut:?/i, '').trim();
        parsed.decisions = content
          .split(/\n+/)
          .map(d => d.replace(/^\d+\.\s*|^[-•]\s*/, '').trim())
          .filter(d => d.length > 0);
      } else if (lowerSection.startsWith('åtgärdspunkter') || lowerSection.startsWith('action items')) {
        const content = section.replace(/åtgärdspunkter:?|action items:?/i, '').trim();
        const items = content.split(/\n\n+/);
        
        items.forEach(item => {
          if (!item.trim()) return;
          
          const lines = item.split('\n').map(l => l.trim()).filter(l => l);
          if (lines.length === 0) return;
          
          const actionItem: any = { title: lines[0].replace(/^\d+\.\s*|^[-•]\s*/, '') };
          
          lines.slice(1).forEach(line => {
            if (line.match(/ansvarig:/i)) {
              actionItem.owner = line.replace(/ansvarig:/i, '').trim();
            } else if (line.match(/deadline:/i)) {
              actionItem.deadline = line.replace(/deadline:/i, '').trim();
            } else if (line.match(/prioritet:|priority:/i)) {
              actionItem.priority = line.replace(/prioritet:|priority:/i, '').trim().toLowerCase();
            } else if (!actionItem.description) {
              actionItem.description = line;
            }
          });
          
          parsed.actionItems.push(actionItem);
        });
      }
    });

    return parsed;
  };

  // Load preview when dialog opens
  useEffect(() => {
    const loadProtocolPreview = async () => {
      if (!protocol?.blob) return;

      setLoading(true);
      try {
        // Decode base64 to blob
        const base64Data = protocol.blob.replace(/^data:.*?;base64,/, '');
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const arrayBuffer = bytes.buffer;

        // Convert DOCX to HTML using mammoth
        const result = await mammoth.convertToHtml({ arrayBuffer });
        
        // Parse the HTML into structured sections
        const parsed = parseProtocolContent(result.value);
        setParsedProtocol(parsed);
      } catch (error) {
        console.error("Failed to load protocol preview:", error);
        toast({
          title: "Förhandsvisning misslyckades",
          description: "Kunde inte visa protokollet. Du kan fortfarande ladda ner det.",
          variant: "destructive",
          duration: 2500,
        });
      } finally {
        setLoading(false);
      }
    };

    if (open && protocol) {
      loadProtocolPreview();
    } else {
      setParsedProtocol(null);
      setLoading(false);
    }
  }, [open, protocol, toast]);

  const handleDownload = () => {
    if (!protocol?.blob) return;

    try {
      const base64Data = protocol.blob.replace(/^data:.*?;base64,/, '');
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const file = new Blob([bytes], { type: protocol.mimeType });
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = protocol.fileName;
      a.click();
      URL.revokeObjectURL(url);
      
      toast({
        title: "Protokoll nedladdat",
        description: protocol.fileName,
        duration: 2000,
      });
    } catch (error: any) {
      toast({
        title: "Fel",
        description: error.message || "Kunde inte ladda ner protokoll",
        variant: "destructive",
        duration: 2500,
      });
    }
  };

  const handleShare = () => {
    setShowEmailDialog(true);
  };

  const getProtocolBlob = (): Blob | null => {
    if (!protocol?.blob) return null;

    try {
      const base64Data = protocol.blob.replace(/^data:.*?;base64,/, '');
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return new Blob([bytes], { type: protocol.mimeType });
    } catch (error) {
      console.error("Failed to convert protocol to blob:", error);
      return null;
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'critical': case 'kritisk': return 'text-red-600 dark:text-red-400';
      case 'high': case 'hög': return 'text-orange-600 dark:text-orange-400';
      case 'medium': return 'text-yellow-600 dark:text-yellow-400';
      case 'low': case 'låg': return 'text-green-600 dark:text-green-400';
      default: return 'text-muted-foreground';
    }
  };

  const getPriorityLabel = (priority?: string) => {
    if (!priority) return '';
    switch (priority.toLowerCase()) {
      case 'critical': case 'kritisk': return 'Kritisk';
      case 'high': case 'hög': return 'Hög';
      case 'medium': return 'Medium';
      case 'low': case 'låg': return 'Låg';
      default: return priority;
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0">
          {/* Header Section */}
          <div className="p-8 pb-6 border-b bg-gradient-to-br from-background to-muted/20">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                <FileText className="w-7 h-7 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold mb-2 text-foreground">
                  {protocol?.fileName?.replace(/\.(docx|pdf)$/i, '') || "Protokoll"}
                </h2>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <span>
                      {protocol?.storedAt ? new Date(protocol.storedAt).toLocaleDateString('sv-SE', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      }) : ''}
                    </span>
                  </div>
                  {protocol?.size && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                      <span>{formatFileSize(protocol.size)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 px-8 py-4 border-b bg-muted/30">
            <Button onClick={handleDownload} variant="outline" size="sm" className="gap-2 hover:bg-background">
              <Download className="w-4 h-4" />
              Ladda ner
            </Button>
            <Button onClick={handleShare} variant="outline" size="sm" className="gap-2 hover:bg-background">
              <Share2 className="w-4 h-4" />
              Dela via e-post
            </Button>
            <Button 
              onClick={() => onOpenChange(false)} 
              variant="ghost" 
              size="sm" 
              className="gap-2 ml-auto hover:bg-background"
            >
              <X className="w-4 h-4" />
              Stäng
            </Button>
          </div>

          {/* Protocol Preview */}
          <div className="flex-1 overflow-auto px-8 py-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 space-y-4">
                <div className="relative">
                  <Loader2 className="w-10 h-10 text-primary animate-spin" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium text-foreground">Laddar protokoll</p>
                  <p className="text-xs text-muted-foreground">Förbereder förhandsvisning...</p>
                </div>
              </div>
            ) : parsedProtocol ? (
              <div className="max-w-4xl mx-auto space-y-8">
                {/* Summary */}
                {parsedProtocol.summary && (
                  <div>
                    <h2 className="text-xl font-semibold mb-3 text-foreground">Sammanfattning</h2>
                    <p className="text-muted-foreground leading-relaxed">
                      {parsedProtocol.summary}
                    </p>
                  </div>
                )}

                {/* Main Points */}
                {parsedProtocol.mainPoints.length > 0 && (
                  <div>
                    <h2 className="text-xl font-semibold mb-3 text-foreground">Huvudpunkter</h2>
                    <ul className="space-y-2">
                      {parsedProtocol.mainPoints.map((point, index) => (
                        <li key={index} className="flex gap-3">
                          <span className="text-primary font-medium">{index + 1}.</span>
                          <span className="text-muted-foreground">{point}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Decisions */}
                {parsedProtocol.decisions.length > 0 && (
                  <div>
                    <h2 className="text-xl font-semibold mb-3 text-foreground">Beslut</h2>
                    <ul className="space-y-2">
                      {parsedProtocol.decisions.map((decision, index) => (
                        <li key={index} className="flex gap-3">
                          <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                          <span className="text-muted-foreground">{decision}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Action Items */}
                {parsedProtocol.actionItems.length > 0 && (
                  <div>
                    <h2 className="text-xl font-semibold mb-3 text-foreground">Åtgärdspunkter</h2>
                    <div className="space-y-4">
                      {parsedProtocol.actionItems.map((item, index) => (
                        <div key={index} className="pl-4 border-l-2 border-primary/20">
                          <div className="flex items-start justify-between gap-4 mb-1">
                            <h3 className="font-medium text-foreground">{item.title}</h3>
                            {item.priority && (
                              <span className={`text-xs font-medium ${getPriorityColor(item.priority)}`}>
                                {getPriorityLabel(item.priority)}
                              </span>
                            )}
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
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center">
                  <FileText className="w-10 h-10 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Förhandsvisning inte tillgänglig
                  </p>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    Ladda ner protokollet för att visa det i din föredragna applikation
                  </p>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Email Dialog */}
      {showEmailDialog && protocol && (
        <EmailDialog
          open={showEmailDialog}
          onOpenChange={setShowEmailDialog}
          documentBlob={getProtocolBlob()}
          fileName={protocol.fileName}
        />
      )}
    </>
  );
};
