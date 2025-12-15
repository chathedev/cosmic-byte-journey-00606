import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Shield, Copy, RefreshCw, XCircle, Clock, CheckCircle } from "lucide-react";
import { apiClient } from "@/lib/api";

interface SupportCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SupportCodeDialog = ({ open, onOpenChange }: SupportCodeDialogProps) => {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [supportCode, setSupportCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      // Don't reset code when closing - it persists until expired/revoked
    }
  }, [open]);

  // Timer countdown
  useEffect(() => {
    if (!expiresAt) {
      setTimeRemaining(null);
      return;
    }

    const updateTimeRemaining = () => {
      const now = new Date().getTime();
      const expires = new Date(expiresAt).getTime();
      const remaining = Math.max(0, Math.floor((expires - now) / 1000));
      
      if (remaining <= 0) {
        setSupportCode(null);
        setExpiresAt(null);
        setTimeRemaining(null);
        return;
      }
      
      setTimeRemaining(remaining);
    };

    updateTimeRemaining();
    const interval = setInterval(updateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const result = await apiClient.generateSupportCode();
      setSupportCode(result.code);
      setExpiresAt(result.expiresAt);
      toast({
        title: "Supportkod genererad",
        description: "Dela denna kod med support för att ge tillfällig åtkomst.",
      });
    } catch (error: any) {
      console.error('Failed to generate support code:', error);
      toast({
        title: "Kunde inte generera kod",
        description: error?.message || "Ett oväntat fel uppstod",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRevoke = async () => {
    setIsRevoking(true);
    try {
      await apiClient.revokeSupportCode();
      setSupportCode(null);
      setExpiresAt(null);
      setTimeRemaining(null);
      toast({
        title: "Supportåtkomst återkallad",
        description: "Supportkoden är inte längre giltig.",
      });
    } catch (error: any) {
      console.error('Failed to revoke support code:', error);
      toast({
        title: "Kunde inte återkalla kod",
        description: error?.message || "Ett oväntat fel uppstod",
        variant: "destructive",
      });
    } finally {
      setIsRevoking(false);
    }
  };

  const handleCopy = async () => {
    if (!supportCode) return;
    
    try {
      await navigator.clipboard.writeText(supportCode);
      setCopied(true);
      toast({
        title: "Kopierad!",
        description: "Supportkoden har kopierats till urklipp.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Kunde inte kopiera",
        description: "Kopiera koden manuellt.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Supportåtkomst
          </DialogTitle>
          <DialogDescription>
            Generera en tillfällig kod för att ge support läs-åtkomst till dina möten och transkriptioner.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {supportCode ? (
            <>
              {/* Active Support Code */}
              <div className="p-4 border border-primary/20 rounded-lg bg-primary/5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Din supportkod:</span>
                  {timeRemaining !== null && (
                    <Badge variant="outline" className="text-xs">
                      <Clock className="h-3 w-3 mr-1" />
                      {formatTime(timeRemaining)}
                    </Badge>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono text-lg font-semibold text-foreground bg-background px-3 py-2 rounded border border-border text-center tracking-wider">
                    {supportCode}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopy}
                    className="shrink-0"
                  >
                    {copied ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Support kan använda denna kod för att tillfälligt se dina möten i läsläge. 
                  De kan <strong>inte</strong> göra ändringar.
                </p>
              </div>

              {/* Revoke Button */}
              <Button
                variant="destructive"
                onClick={handleRevoke}
                disabled={isRevoking}
                className="w-full"
              >
                {isRevoking ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Återkallar...
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 mr-2" />
                    Återkalla supportåtkomst
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              {/* No Active Code */}
              <div className="p-4 border border-border rounded-lg bg-muted/30 space-y-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Shield className="h-5 w-5" />
                  <span className="text-sm">Ingen aktiv supportkod</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Generera en kod för att ge support tillfällig läs-åtkomst till ditt konto.
                  Koden är giltig i 15 minuter.
                </p>
              </div>

              {/* Generate Button */}
              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Genererar...
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4 mr-2" />
                    Generera supportkod
                  </>
                )}
              </Button>
            </>
          )}

          {/* Security Notice */}
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              <strong>Säkerhetsinfo:</strong> Dela aldrig koden offentligt. 
              Support kommer aldrig be dig om lösenord eller betalningsinformation.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
