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
  const getBillingTypeLabel = (type: string) => {
    switch (type) {
      case 'one_time': return 'Engångsfaktura';
      case 'monthly': return 'Månadsprenumeration';
      case 'yearly': return 'Årsprenumeration';
      default: return type;
    }
  };

  const getTotalAmount = () => {
    return amountSek + (oneTimeAmountSek || 0);
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
                  <span className="text-sm text-muted-foreground">Återkommande ({billingType === 'monthly' ? 'månad' : 'år'})</span>
                  <span className="text-sm font-medium">{amountSek.toLocaleString('sv-SE')} kr</span>
                </div>
                {oneTimeAmountSek && oneTimeAmountSek > 0 && (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Engångsavgift</span>
                      <span className="text-sm font-medium">{oneTimeAmountSek.toLocaleString('sv-SE')} kr</span>
                    </div>
                    <div className="border-t pt-2 mt-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">Första fakturan</span>
                        <span className="text-base font-semibold">{getTotalAmount().toLocaleString('sv-SE')} kr</span>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
            {billingType === 'one_time' && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Engångsbelopp</span>
                <span className="text-base font-semibold">{amountSek.toLocaleString('sv-SE')} kr</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Button
              variant="default"
              className="w-full"
              onClick={() => window.open(invoiceUrl, '_blank')}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Visa Faktura
            </Button>

            {portalUrl && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => window.open(portalUrl, '_blank')}
              >
                Kundportal
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
