import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckCircle2, Copy, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface BillingSuccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billingType: 'one_time' | 'monthly' | 'yearly';
  amountSek: number;
  oneTimeAmountSek?: number;
  invoiceUrl: string;
  portalUrl?: string;
  companyName: string;
  oneTimeInvoiceUrl?: string;
  oneTimeInvoiceId?: string;
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
  oneTimeInvoiceUrl,
}: BillingSuccessDialogProps) {
  const [isCopying, setIsCopying] = useState(false);

  const getBillingTypeLabel = (type: string) => {
    switch (type) {
      case 'one_time': return 'Engång';
      case 'monthly': return 'Månad';
      case 'yearly': return 'År';
      default: return type;
    }
  };

  const handleCopy = async (text: string, label: string) => {
    setIsCopying(true);
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} kopierad`);
    } catch (error) {
      toast.error('Kunde inte kopiera');
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle2 className="h-5 w-5" />
            <DialogTitle>Fakturering skapad</DialogTitle>
          </div>
          <p className="text-sm text-muted-foreground">{companyName}</p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Typ</span>
              <Badge variant="outline">{getBillingTypeLabel(billingType)}</Badge>
            </div>
            
            {billingType === 'one_time' ? (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Belopp</span>
                <span className="text-lg font-semibold">
                  {amountSek.toLocaleString('sv-SE')} SEK
                </span>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Återkommande</span>
                  <span className="font-medium">
                    {amountSek.toLocaleString('sv-SE')} SEK
                  </span>
                </div>
                {oneTimeAmountSek && oneTimeAmountSek > 0 && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Engång</span>
                      <span className="font-medium">
                        {oneTimeAmountSek.toLocaleString('sv-SE')} SEK
                      </span>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Första fakturan</span>
                      <span className="text-lg font-semibold">
                        {(amountSek + oneTimeAmountSek).toLocaleString('sv-SE')} SEK
                      </span>
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* Invoice Link */}
          <div className="space-y-2">
            <Label className="text-sm">Fakturalänk</Label>
            <div className="flex gap-2">
              <Input
                value={invoiceUrl}
                readOnly
                className="flex-1 text-xs font-mono"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleCopy(invoiceUrl, 'Länk')}
                disabled={isCopying}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => window.open(invoiceUrl, '_blank')}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* One-Time Invoice Link */}
          {oneTimeInvoiceUrl && (
            <div className="space-y-2">
              <Label className="text-sm">Separat engångsfaktura</Label>
              <div className="flex gap-2">
                <Input
                  value={oneTimeInvoiceUrl}
                  readOnly
                  className="flex-1 text-xs font-mono"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleCopy(oneTimeInvoiceUrl, 'Länk')}
                  disabled={isCopying}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => window.open(oneTimeInvoiceUrl, '_blank')}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Portal Link */}
          {portalUrl && (
            <div className="space-y-2">
              <Label className="text-sm">Billing Portal</Label>
              <div className="flex gap-2">
                <Input
                  value={portalUrl}
                  readOnly
                  className="flex-1 text-xs font-mono"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleCopy(portalUrl, 'Länk')}
                  disabled={isCopying}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => window.open(portalUrl, '_blank')}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Företaget kan hantera sin prenumeration här
              </p>
            </div>
          )}

          <Button
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
