import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Sparkles } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface PreferredNameDialogProps {
  open: boolean;
  onNameSet: (name: string) => void;
}

export const PreferredNameDialog = ({ open, onNameSet }: PreferredNameDialogProps) => {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length < 2) {
      toast({
        title: "Ogiltigt namn",
        description: "Vänligen ange ett namn med minst 2 tecken",
        variant: "destructive",
      });
      return;
    }

    if (trimmedName.length > 50) {
      toast({
        title: "Namnet är för långt",
        description: "Vänligen ange ett namn med max 50 tecken",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.updatePreferredName(trimmedName);
      onNameSet(trimmedName);
      toast({
        title: "Välkommen!",
        description: `Trevligt att träffas, ${trimmedName}!`,
      });
    } catch (error) {
      console.error("Failed to set preferred name:", error);
      toast({
        title: "Något gick fel",
        description: "Kunde inte spara ditt namn. Försök igen.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-md [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-8 h-8 text-primary" />
          </div>
          <DialogTitle className="text-2xl">Välkommen till Tivly!</DialogTitle>
          <DialogDescription className="text-base">
            Vad vill du bli kallad? Detta namn visas i appen och i dina mötesprotokoll.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          <div className="space-y-2">
            <Label htmlFor="preferredName" className="text-sm font-medium">
              Ditt namn
            </Label>
            <Input
              id="preferredName"
              type="text"
              placeholder="T.ex. Anna Andersson"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-base h-12"
              autoFocus
              autoComplete="name"
              maxLength={50}
            />
            <p className="text-xs text-muted-foreground">
              Du kan ändra detta senare i inställningarna
            </p>
          </div>

          <Button
            type="submit"
            className="w-full h-12 text-base font-medium"
            disabled={isSubmitting || name.trim().length < 2}
          >
            {isSubmitting ? (
              "Sparar..."
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Kom igång
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
