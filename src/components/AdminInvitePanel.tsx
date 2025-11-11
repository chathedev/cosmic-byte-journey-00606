import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import { Mail, Send, Lock, Check } from "lucide-react";

export const AdminInvitePanel = () => {
  const [recipientEmail, setRecipientEmail] = useState("");
  const [inviteSecret, setInviteSecret] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [redemptionUrl, setRedemptionUrl] = useState("");
  const { toast } = useToast();

  const handleCreateInvite = async () => {
    if (!recipientEmail || !inviteSecret) {
      toast({
        title: "Fält saknas",
        description: "Fyll i både e-post och invite secret",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await apiClient.createUnlimitedInvite(recipientEmail, inviteSecret);
      setRedemptionUrl(result.redemptionUrl);
      
      toast({
        title: "Inbjudan skapad!",
        description: `Unlimited invite har skapats för ${recipientEmail}`,
      });
      
      setRecipientEmail("");
    } catch (error: any) {
      toast({
        title: "Fel",
        description: error.message || "Kunde inte skapa inbjudan",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyUrl = () => {
    if (redemptionUrl) {
      navigator.clipboard.writeText(redemptionUrl);
      toast({
        title: "Kopierad!",
        description: "Inbjudningslänken har kopierats",
      });
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto border-2 border-primary/20 shadow-xl">
      <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5">
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-primary" />
          Admin: Skapa Unlimited Invite
        </CardTitle>
        <CardDescription>
          Skapa en inbjudan som ger mottagaren unlimited-plan
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="recipientEmail">Mottagarens e-post</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="recipientEmail"
                type="email"
                placeholder="mottagare@example.com"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="inviteSecret">Invite Secret</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="inviteSecret"
                type="password"
                placeholder="Din hemliga invite-nyckel"
                value={inviteSecret}
                onChange={(e) => setInviteSecret(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Button
            onClick={handleCreateInvite}
            disabled={isLoading || !recipientEmail || !inviteSecret}
            className="w-full"
            size="lg"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                <span>Skapar...</span>
              </div>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Skapa Inbjudan
              </>
            )}
          </Button>
        </div>

        {redemptionUrl && (
          <div className="space-y-3 p-4 bg-muted rounded-lg border border-border animate-fade-in">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <Check className="h-4 w-4" />
              Inbjudan skapad!
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Inbjudningslänk:</Label>
              <div className="flex gap-2">
                <Input
                  value={redemptionUrl}
                  readOnly
                  className="text-xs bg-background"
                />
                <Button
                  onClick={handleCopyUrl}
                  variant="outline"
                  size="sm"
                >
                  Kopiera
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Skicka denna länk till {recipientEmail}. När de öppnar länken och loggar in kommer deras konto uppgraderas till unlimited.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
