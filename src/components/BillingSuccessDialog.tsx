import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, ExternalLink } from "lucide-react";

interface BillingSuccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billingType: 'one_time' | 'monthly' | 'yearly';
  amountSek: number; // This is now VAT-inclusive
  oneTimeAmountSek?: number; // This is now VAT-inclusive
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
  const getBillingTypeLabel = (type: string) => {
    switch (type) {
      case 'one_time': return 'Engångsfaktura';
      case 'monthly': return 'Månadsprenumeration';
      case 'yearly': return 'Årsprenumeration';
      default: return type;
    }
  };

  // Calculate net amounts (amounts are VAT-inclusive, so divide by 1.25)
  const netAmount = Math.round(amountSek / 1.25);
  const netOneTimeAmount = oneTimeAmountSek ? Math.round(oneTimeAmountSek / 1.25) : 0;
  
  const getTotalInclVat = () => {
    return amountSek + (oneTimeAmountSek || 0);
  };

  const getTotalExclVat = () => {
    return netAmount + netOneTimeAmount;
  };

  const getTotalVat = () => {
    return getTotalInclVat() - getTotalExclVat();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Check className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle>Fakturering Skapad</DialogTitle>
              <DialogDescription className="mt-1">
                {companyName}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2 p-4 rounded-lg border">
            {billingType !== 'one_time' && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Återkommande ({billingType === 'monthly' ? 'månad' : 'år'}) exkl. moms
                  </span>
                  <span className="text-sm font-medium">{netAmount.toLocaleString('sv-SE')} kr</span>
                </div>
                {oneTimeAmountSek && oneTimeAmountSek > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Engångsavgift exkl. moms</span>
                    <span className="text-sm font-medium">{netOneTimeAmount.toLocaleString('sv-SE')} kr</span>
                  </div>
                )}
              </>
            )}
            {billingType === 'one_time' && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Engångsbelopp exkl. moms</span>
                <span className="text-sm font-medium">{netAmount.toLocaleString('sv-SE')} kr</span>
              </div>
            )}
            
            {/* VAT breakdown */}
            <div className="border-t pt-2 mt-2 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Subtotal exkl. moms</span>
                <span className="text-sm font-medium">{getTotalExclVat().toLocaleString('sv-SE')} kr</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Moms (25%)</span>
                <span className="text-sm font-medium">{getTotalVat().toLocaleString('sv-SE')} kr</span>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-sm font-semibold">Totalt inkl. moms</span>
                <span className="text-base font-bold">{getTotalInclVat().toLocaleString('sv-SE')} kr</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Button
              variant="default"
              className="w-full"
              onClick={() => window.open(invoiceUrl, '_blank')}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Öppna Faktura
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Öppnar fakturan på invoice.stripe.com
            </p>

            {portalUrl && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={() => window.open(portalUrl, '_blank')}
              >
                Kundportal (billing.stripe.com)
              </Button>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost" className="w-full">
            Stäng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
