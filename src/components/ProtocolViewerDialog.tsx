import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Share2, X, FileText, Loader2 } from "lucide-react";
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

export const ProtocolViewerDialog = ({
  open,
  onOpenChange,
  protocol,
}: ProtocolViewerDialogProps) => {
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const { toast } = useToast();

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
        setHtmlContent(result.value);
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
      setHtmlContent("");
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
            ) : htmlContent ? (
              <div className="max-w-4xl mx-auto">
                <div 
                  className="prose prose-sm dark:prose-invert max-w-none p-8 bg-card rounded-xl border shadow-sm
                             prose-headings:text-foreground prose-p:text-muted-foreground 
                             prose-strong:text-foreground prose-ul:text-muted-foreground
                             prose-h1:text-2xl prose-h1:font-bold prose-h1:mb-4
                             prose-h2:text-xl prose-h2:font-semibold prose-h2:mb-3 prose-h2:mt-6
                             prose-h3:text-lg prose-h3:font-medium prose-h3:mb-2
                             prose-p:leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: htmlContent }}
                />
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
