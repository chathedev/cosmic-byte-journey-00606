import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {protocol?.fileName || "Protokoll"}
            </DialogTitle>
            <DialogDescription>
              Sparat {protocol?.storedAt ? new Date(protocol.storedAt).toLocaleDateString('sv-SE', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              }) : ''} · {protocol?.size ? formatFileSize(protocol.size) : ''}
            </DialogDescription>
          </DialogHeader>

          {/* Action Buttons */}
          <div className="flex gap-2 pb-4 border-b border-border">
            <Button onClick={handleDownload} variant="outline" size="sm" className="gap-2">
              <Download className="w-4 h-4" />
              Ladda ner
            </Button>
            <Button onClick={handleShare} variant="outline" size="sm" className="gap-2">
              <Share2 className="w-4 h-4" />
              Dela via e-post
            </Button>
            <Button 
              onClick={() => onOpenChange(false)} 
              variant="ghost" 
              size="sm" 
              className="gap-2 ml-auto"
            >
              <X className="w-4 h-4" />
              Stäng
            </Button>
          </div>

          {/* Protocol Preview */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : htmlContent ? (
              <div 
                className="prose prose-sm dark:prose-invert max-w-none p-6 bg-muted/30 rounded-lg"
                dangerouslySetInnerHTML={{ __html: htmlContent }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">
                  Förhandsvisning inte tillgänglig
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Ladda ner protokollet för att visa det
                </p>
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
