import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TextPasteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTextReady: (text: string) => void;
}

export const TextPasteDialog = ({ open, onOpenChange, onTextReady }: TextPasteDialogProps) => {
  const [text, setText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const handleGenerate = async () => {
    const trimmedText = text.trim();
    
    // Validate minimum word count
    const wordCount = trimmedText.split(/\s+/).filter(w => w).length;
    if (wordCount < 20) {
      toast({
        title: "För kort text",
        description: `Texten innehåller ${wordCount} ord. Minst 20 ord krävs för att skapa ett protokoll.`,
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    
    // Small delay for UX feedback
    await new Promise(resolve => setTimeout(resolve, 300));
    
    onTextReady(trimmedText);
    setText("");
    setIsProcessing(false);
    onOpenChange(false);
  };

  const handleClose = () => {
    if (!isProcessing) {
      setText("");
      onOpenChange(false);
    }
  };

  const wordCount = text.trim().split(/\s+/).filter(w => w).length;
  const isValid = wordCount >= 20;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Klistra in mötestext
          </DialogTitle>
          <DialogDescription>
            Klistra in dina mötesanteckningar eller transkription för att generera ett protokoll.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-hidden flex flex-col">
          <Textarea
            placeholder="Klistra in mötesanteckningar, transkription eller annan text från ditt möte här..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="flex-1 min-h-[300px] resize-none"
            disabled={isProcessing}
          />

          <div className="flex items-center justify-between">
            <p className={`text-sm ${isValid ? 'text-muted-foreground' : 'text-destructive'}`}>
              {wordCount} ord {!isValid && wordCount > 0 && '(minst 20 krävs)'}
            </p>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={isProcessing}
              >
                Avbryt
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={!isValid || isProcessing}
                className="gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Bearbetar...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generera protokoll
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
