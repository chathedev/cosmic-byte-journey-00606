import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { 
  Shield, 
  Loader2, 
  CheckCircle2, 
  X,
  CreditCard,
  Building2
} from "lucide-react";
import tivlyLogo from "@/assets/tivly-logo.png";

// Enterprise billing uses the Tivly Enterprise Stripe account
const STRIPE_PUBLISHABLE_KEY = 'pk_live_51QH6igLnfTyXNYdEPTKgwYTUNqaCdfAxxKm3muIlm6GmLVvguCeN71I6udCVwiMouKam1BSyvJ4EyELKDjAsdIUo00iMqzDhqu';

// Helper to convert öre (cents) to kronor and format
const formatAmountSEK = (amountInOre: number | undefined | null): string => {
  if (typeof amountInOre !== 'number' || amountInOre <= 0) return '—';
  const kronor = amountInOre / 100;
  return kronor.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Convert öre to kronor
const oreToKronor = (amountInOre: number | undefined | null): number => {
  if (typeof amountInOre !== 'number') return 0;
  return amountInOre / 100;
};

interface InvoicePaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientSecret: string;
  amount: number;
  companyName?: string;
  invoiceType: string;
  onSuccess: () => void;
}

function PaymentFormContent({ 
  onSuccess, 
  onError,
  isProcessing,
  setIsProcessing,
  amount
}: { 
  onSuccess: () => void; 
  onError: (msg: string) => void;
  isProcessing: boolean;
  setIsProcessing: (v: boolean) => void;
  amount: number;
}) {
  const stripe = useStripe();
  const elements = useElements();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.href,
        },
        redirect: 'if_required',
      });

      if (error) {
        onError(error.message || 'Betalningen misslyckades');
        setIsProcessing(false);
      } else if (paymentIntent?.status === 'succeeded') {
        onSuccess();
      } else {
        setIsProcessing(false);
      }
    } catch (err: any) {
      onError(err.message || 'Ett fel uppstod');
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement 
        options={{
          layout: 'tabs',
          wallets: {
            applePay: 'auto',
            googlePay: 'auto',
          },
          paymentMethodOrder: ['card', 'apple_pay', 'google_pay', 'klarna'],
        }}
      />
      
      <Button 
        type="submit" 
        className="w-full h-12 text-base font-medium bg-primary hover:bg-primary/90"
        disabled={!stripe || !elements || isProcessing}
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Bearbetar betalning...
          </>
        ) : (
          <>
            Betala {formatAmountSEK(amount)} kr
          </>
        )}
      </Button>
      
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Shield className="h-3.5 w-3.5" />
        <span>Säker och krypterad betalning</span>
      </div>
    </form>
  );
}

export function InvoicePaymentDialog({
  open,
  onOpenChange,
  clientSecret,
  amount,
  companyName,
  invoiceType,
  onSuccess
}: InvoicePaymentDialogProps) {
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  useEffect(() => {
    setStripePromise(loadStripe(STRIPE_PUBLISHABLE_KEY));
  }, []);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setPaymentSuccess(false);
      setPaymentError(null);
      setIsProcessing(false);
    }
  }, [open]);

  const handlePaymentSuccess = () => {
    setPaymentSuccess(true);
    setIsProcessing(false);
  };

  const handleClose = () => {
    if (paymentSuccess) {
      onSuccess();
    }
    onOpenChange(false);
  };

  // Calculate VAT breakdown - amounts are in öre
  const totalKronor = oreToKronor(amount);
  const netKronor = totalKronor / 1.25;
  const vatKronor = totalKronor - netKronor;

  const formatBillingType = (type: string) => {
    switch (type) {
      case 'one_time': return 'Engångsbetalning';
      case 'monthly': return 'Månadsabonnemang';
      case 'yearly': return 'Årsabonnemang';
      default: return type;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="bg-primary/5 border-b border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary overflow-hidden flex items-center justify-center">
                <img src={tivlyLogo} alt="Tivly" className="w-full h-full object-contain p-1" />
              </div>
              <div>
                <DialogTitle className="font-semibold text-foreground">Tivly Enterprise</DialogTitle>
                {companyName && (
                  <p className="text-xs text-muted-foreground">{companyName}</p>
                )}
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleClose}
              className="h-8 w-8 rounded-full"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Amount display */}
          <div className="text-center py-2">
            <p className="text-3xl font-bold text-foreground">
              {formatAmountSEK(amount)} kr
            </p>
            <Badge variant="secondary" className="mt-2">
              <CreditCard className="h-3 w-3 mr-1.5" />
              {formatBillingType(invoiceType)}
            </Badge>
          </div>
        </div>

        <div className="p-6">
          {paymentSuccess ? (
            /* Success State */
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">
                Betalning genomförd!
              </h3>
              <p className="text-muted-foreground text-sm mb-6">
                Tack för din betalning. Ett kvitto skickas till din e-post.
              </p>
              <Button onClick={handleClose} className="w-full">
                Stäng
              </Button>
            </div>
          ) : (
            <>
              {/* Cost breakdown */}
              <div className="mb-6 p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">Kostnadssammanställning</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Belopp exkl. moms</span>
                    <span className="text-foreground">{netKronor > 0 ? netKronor.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'} kr</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Moms (25%)</span>
                    <span className="text-foreground">{vatKronor > 0 ? vatKronor.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'} kr</span>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex justify-between font-semibold">
                    <span className="text-foreground">Totalt att betala</span>
                    <span className="text-primary">{formatAmountSEK(amount)} kr</span>
                  </div>
                </div>
              </div>

              {/* Error message */}
              {paymentError && (
                <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  {paymentError}
                </div>
              )}

              {/* Stripe Payment Form */}
              {stripePromise && clientSecret && (
                <Elements 
                  stripe={stripePromise} 
                  options={{
                    clientSecret,
                    appearance: {
                      theme: 'stripe',
                      variables: {
                        colorPrimary: 'hsl(173, 80%, 40%)',
                        borderRadius: '8px',
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                      },
                      rules: {
                        '.Label': {
                          color: 'hsl(var(--foreground))',
                          marginBottom: '8px',
                        },
                        '.Input': {
                          borderColor: 'hsl(var(--border))',
                          boxShadow: 'none',
                        },
                        '.Input:focus': {
                          borderColor: 'hsl(173, 80%, 40%)',
                          boxShadow: '0 0 0 1px hsl(173, 80%, 40%)',
                        },
                        '.Tab': {
                          borderColor: 'hsl(var(--border))',
                        },
                        '.Tab--selected': {
                          borderColor: 'hsl(173, 80%, 40%)',
                          color: 'hsl(173, 80%, 40%)',
                        },
                      },
                    },
                    loader: 'auto',
                  }}
                >
                  <PaymentFormContent 
                    onSuccess={handlePaymentSuccess}
                    onError={setPaymentError}
                    isProcessing={isProcessing}
                    setIsProcessing={setIsProcessing}
                    amount={amount}
                  />
                </Elements>
              )}

              {/* Terms disclaimer */}
              <Separator className="my-6" />
              <p className="text-xs text-muted-foreground text-center">
                Genom att slutföra betalningen godkänner du{' '}
                <a 
                  href="https://www.tivly.se/enterprise-villkor" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Tivly Enterprise-villkor
                </a>
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
