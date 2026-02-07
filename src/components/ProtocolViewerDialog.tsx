import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Share2, FileText, Loader2 } from "lucide-react";
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
    htmlContent?: string; // Pre-rendered HTML for demo protocols
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
      // If protocol has pre-rendered HTML (demo protocols), use it directly
      if (protocol?.htmlContent) {
        setHtmlContent(protocol.htmlContent);
        setLoading(false);
        return;
      }

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
          {/* Header with title + actions */}
          <div className="flex items-center gap-3 px-6 py-4 border-b">
            <FileText className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-foreground truncate">
                {protocol?.fileName?.replace(/\.(docx|pdf)$/i, '') || "Protokoll"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {protocol?.storedAt ? new Date(protocol.storedAt).toLocaleDateString('sv-SE', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                }) : ''}
                {protocol?.size ? ` · ${formatFileSize(protocol.size)}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button onClick={handleDownload} variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                <Download className="w-4 h-4" />
                Ladda ner
              </Button>
              <Button onClick={handleShare} variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                <Share2 className="w-4 h-4" />
                Dela
              </Button>
            </div>
          </div>

          {/* Document Preview */}
          <div className="flex-1 overflow-auto bg-muted/30">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16 space-y-4">
                <div className="relative">
                  <Loader2 className="w-10 h-10 text-primary animate-spin" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium text-foreground">Laddar dokument</p>
                  <p className="text-xs text-muted-foreground">Förbereder förhandsvisning...</p>
                </div>
              </div>
            ) : htmlContent ? (
              <div className="py-8 px-4 sm:px-8">
                <div className="max-w-[210mm] mx-auto">
                  {/* Document Paper */}
                  <div 
                    className="bg-white dark:bg-white shadow-2xl min-h-[297mm] p-12 sm:p-16 
                               document-preview text-gray-900"
                    style={{
                      fontFamily: 'Georgia, "Times New Roman", serif',
                      lineHeight: '1.8',
                    }}
                    dangerouslySetInnerHTML={{ __html: htmlContent }}
                  />
                </div>
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
