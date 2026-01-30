import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, User } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface WelcomeNameDialogProps {
  open: boolean;
  onComplete: () => void;
}

export function WelcomeNameDialog({ open, onComplete }: WelcomeNameDialogProps) {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setIsSaving(true);
    try {
      await apiClient.updatePreferredName(trimmedName);
      await refreshUser();
      toast({
        title: "Välkommen!",
        description: `Trevligt att träffas, ${trimmedName}!`,
      });
      onComplete();
    } catch (error) {
      console.error("Failed to save name:", error);
      toast({
        title: "Kunde inte spara",
        description: "Försök igen om en stund",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && name.trim()) {
      handleSave();
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="text-center sm:text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <User className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-xl">Välkommen till Tivly!</DialogTitle>
          <DialogDescription>
            Ange ditt namn för att fortsätta. Detta används för hälsningar och talaridentifiering.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="welcome-name">Ditt namn</Label>
            <Input
              id="welcome-name"
              placeholder="T.ex. Anna Johansson"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">
              {user?.email}
            </p>
          </div>

          <Button 
            onClick={handleSave} 
            className="w-full" 
            disabled={!name.trim() || isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sparar...
              </>
            ) : (
              "Fortsätt"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
