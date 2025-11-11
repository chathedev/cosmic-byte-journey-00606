import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
// Email functionality removed - requires backend setup
import { Mail, X, Plus } from "lucide-react";

interface EmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentBlob: Blob;
  fileName: string;
}

export const EmailDialog = ({ open, onOpenChange, documentBlob, fileName }: EmailDialogProps) => {
  const [recipients, setRecipients] = useState<string[]>([""]);
  const [subject, setSubject] = useState("Mötesprotokoll");
  const [message, setMessage] = useState("Hej,\n\nBifogat finner du mötesprotokoll från vårt möte.\n\nMed vänliga hälsningar");
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const addRecipient = () => {
    setRecipients([...recipients, ""]);
  };

  const removeRecipient = (index: number) => {
    const newRecipients = recipients.filter((_, i) => i !== index);
    setRecipients(newRecipients.length > 0 ? newRecipients : [""]);
  };

  const updateRecipient = (index: number, value: string) => {
    const newRecipients = [...recipients];
    newRecipients[index] = value;
    setRecipients(newRecipients);
  };

  const handleSend = async () => {
    const validRecipients = recipients.filter(r => r.trim() && r.includes('@'));
    
    if (validRecipients.length === 0) {
      toast({
        title: "Inga mottagare",
        description: "Lägg till minst en giltig e-postadress.",
        variant: "destructive",
      });
      return;
    }

    if (!subject.trim()) {
      toast({
        title: "Saknar ämne",
        description: "Ange ett ämne för e-postmeddelandet.",
        variant: "destructive",
      });
      return;
    }

    setSending(true);

    try {
      // Convert blob to base64
      const reader = new FileReader();
      reader.readAsDataURL(documentBlob);
      
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        const base64 = base64data.split(',')[1];

        try {
          const { sendProtocolEmail } = await import('@/lib/backend');
          const result = await sendProtocolEmail({
            recipients: validRecipients,
            subject: subject.trim(),
            message: message.trim(),
            documentBlob: base64,
            fileName,
          });

          setSending(false);
          
          // If we got here without throwing, the email was sent successfully
          toast({
            title: "E-post skickat!",
            description: `Protokollet har skickats till ${validRecipients.length} mottagare.`,
          });
          onOpenChange(false);
        } catch (err: any) {
          console.error('Email error:', err);
          setSending(false);
          
          let errorMessage = "Ett fel uppstod vid skickandet.";
          if (err.message?.includes('invalid_recipients')) {
            errorMessage = "En eller flera e-postadresser är ogiltiga.";
          } else if (err.message?.includes('attachment_too_large')) {
            errorMessage = "Bilagan är för stor (max 15 MB).";
          } else if (err.message) {
            errorMessage = err.message;
          }
          
          toast({
            title: "Kunde inte skicka e-post",
            description: errorMessage,
            variant: "destructive",
          });
        }
      };
    } catch (error: any) {
      console.error('Send error:', error);
      setSending(false);
      toast({
        title: "Fel",
        description: "Kunde inte skicka e-postmeddelandet.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Skicka protokoll via e-post
          </DialogTitle>
          <DialogDescription>
            Skicka mötesprotokoll som bilaga till en eller flera mottagare
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Mottagare</Label>
            {recipients.map((recipient, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  type="email"
                  placeholder="namn@exempel.se"
                  value={recipient}
                  onChange={(e) => updateRecipient(index, e.target.value)}
                />
                {recipients.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => removeRecipient(index)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addRecipient}
              className="w-full gap-2"
            >
              <Plus className="w-4 h-4" />
              Lägg till mottagare
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Ämne</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Mötesprotokoll"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Meddelande</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              placeholder="Skriv ett meddelande..."
            />
          </div>

          <div className="text-sm text-muted-foreground">
            Bilaga: {fileName}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Avbryt
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? "Skickar..." : "Skicka e-post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
