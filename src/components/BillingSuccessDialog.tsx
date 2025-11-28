import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckCircle2, Copy, Mail, ExternalLink, FileText, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface BillingSuccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billingType: 'one_time' | 'monthly' | 'yearly';
  amountSek: number;
  oneTimeAmountSek?: number;
  invoiceUrl: string;
  portalUrl?: string;
  companyName: string;
}

export default function BillingSuccessDialog({
  open,
  onOpenChange,
  billingType,
  amountSek,
  oneTimeAmountSek,
  invoiceUrl,
  portalUrl,
  companyName,
}: BillingSuccessDialogProps) {
  const [emailTo, setEmailTo] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const getBillingTypeLabel = (type: string) => {
    switch (type) {
      case 'one_time': return 'Engångsfaktura';
      case 'monthly': return 'Månadsprenumeration';
      case 'yearly': return 'Årsprenumeration';
      default: return type;
    }
  };

  const handleCopyInvoiceLink = () => {
    navigator.clipboard.writeText(invoiceUrl);
    toast.success("Fakturalänk kopierad!");
  };

  const handleCopyPortalLink = () => {
    if (portalUrl) {
      navigator.clipboard.writeText(portalUrl);
      toast.success("Portal-länk kopierad!");
    }
  };

  const handleSendEmail = async () => {
    if (!emailTo.trim()) {
      toast.error("Vänligen ange en e-postadress");
      return;
    }

    setIsSendingEmail(true);
    try {
      // TODO: Implement actual email sending via backend
      // For now, just copy to clipboard
      const emailBody = `
Hej!

En ${getBillingTypeLabel(billingType).toLowerCase()} har skapats för ${companyName}.

${billingType === 'one_time' 
  ? `Belopp: ${amountSek.toLocaleString('sv-SE')} SEK`
  : `Återkommande Belopp: ${amountSek.toLocaleString('sv-SE')} SEK${oneTimeAmountSek && oneTimeAmountSek > 0 ? `\nEngångsavgift: ${oneTimeAmountSek.toLocaleString('sv-SE')} SEK\nFörsta Faktura Total: ${(amountSek + oneTimeAmountSek).toLocaleString('sv-SE')} SEK` : ''}`
}

Faktura: ${invoiceUrl}
${portalUrl ? `\nBilling Portal: ${portalUrl}` : ''}

Vänliga hälsningar
      `.trim();

      await navigator.clipboard.writeText(emailBody);
      toast.success("E-postinnehåll kopierat! Klistra in i din e-postklient.");
      setEmailTo("");
    } catch (error) {
      toast.error("Kunde inte förbereda e-post");
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-2xl">Fakturering Skapad!</DialogTitle>
              <DialogDescription>
                {getBillingTypeLabel(billingType)} för {companyName}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Summary */}
          <div className="rounded-lg bg-muted/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Typ</span>
              <Badge variant={billingType === 'one_time' ? 'secondary' : 'default'}>
                {getBillingTypeLabel(billingType)}
              </Badge>
            </div>
            
            {billingType === 'one_time' ? (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Belopp</span>
                <span className="text-2xl font-bold text-primary">
                  {amountSek.toLocaleString('sv-SE')} SEK
                </span>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Återkommande Belopp</span>
                  <span className="text-2xl font-bold text-primary">
                    {amountSek.toLocaleString('sv-SE')} SEK
                  </span>
                </div>
                {oneTimeAmountSek && oneTimeAmountSek > 0 && (
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <span className="text-sm font-medium text-muted-foreground">Engångsavgift</span>
                    <span className="text-lg font-bold text-secondary-foreground">
                      {oneTimeAmountSek.toLocaleString('sv-SE')} SEK
                    </span>
                  </div>
                )}
                {oneTimeAmountSek && oneTimeAmountSek > 0 && (
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs font-medium text-muted-foreground">Första Faktura Total</span>
                    <span className="text-base font-semibold">
                      {(amountSek + oneTimeAmountSek).toLocaleString('sv-SE')} SEK
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Invoice Link */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-foreground">
              <FileText className="h-4 w-4" />
              Fakturalänk
            </Label>
            <div className="flex gap-2">
              <Input
                value={invoiceUrl}
                readOnly
                className="flex-1 font-mono text-xs bg-background"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleCopyInvoiceLink}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => window.open(invoiceUrl, '_blank', 'noopener,noreferrer')}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Dela denna länk med företaget för att visa fakturan
            </p>
          </div>

          {/* Portal Link (for subscriptions) */}
          {portalUrl && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-foreground">
                <CreditCard className="h-4 w-4" />
                Billing Portal (Hantera Prenumeration)
              </Label>
              <div className="flex gap-2">
                <Input
                  value={portalUrl}
                  readOnly
                  className="flex-1 font-mono text-xs bg-background"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopyPortalLink}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => window.open(portalUrl, '_blank', 'noopener,noreferrer')}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Låt företaget hantera sin prenumeration, uppdatera betalningsmetod, etc.
              </p>
            </div>
          )}

          {/* Send via Email */}
          <div className="space-y-2 pt-4 border-t">
            <Label htmlFor="emailTo" className="flex items-center gap-2 text-foreground">
              <Mail className="h-4 w-4" />
              Skicka via E-post
            </Label>
            <div className="flex gap-2">
              <Input
                id="emailTo"
                type="email"
                placeholder="mottagare@exempel.se"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSendEmail();
                  }
                }}
              />
              <Button
                type="button"
                onClick={handleSendEmail}
                disabled={isSendingEmail || !emailTo.trim()}
              >
                <Mail className="h-4 w-4 mr-2" />
                {isSendingEmail ? "Förbereder..." : "Kopiera"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Kopierar e-postinnehåll till urklipp så du kan klistra in det i din e-postklient
            </p>
          </div>

          {/* Close Button */}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            Stäng
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
