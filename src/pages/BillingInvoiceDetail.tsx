import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { apiClient } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowLeft, 
  FileText, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  XCircle, 
  Shield,
  Loader2
} from "lucide-react";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import tivlyLogo from "@/assets/tivly-logo.png";

// Get Stripe publishable key from backend or use default
const STRIPE_PUBLISHABLE_KEY = 'pk_live_51RBmwME0yFmyBl81G1NTIqm31T3hPUmYvdYQl5QLa3WKwrJhqNpHKYCLpLNjg0RfN9xZiS89s5t1z0SnDzk1lBQy00BjPV4ERK';

interface InvoiceDetail {
  id: string;
  type: 'one_time' | 'monthly' | 'yearly';
  amountSek: number;
  oneTimeAmountSek?: number;
  status: string;
  createdAt: string;
  dueAt?: string;
  hostedInvoiceUrl?: string;
  hostedInvoicePath?: string;
  stripeInvoiceUrl?: string;
  paymentIntentClientSecret?: string;
  paymentIntentId?: string;
  paymentIntentStatus?: string;
  subscriptionId?: string;
  companyName?: string;
  combineOneTime?: boolean;
}

const getStatusInfo = (status: string) => {
  switch (status.toLowerCase()) {
    case 'paid':
      return { icon: CheckCircle, label: 'Betald', color: 'text-green-600', bg: 'bg-green-500/10' };
    case 'open':
    case 'draft':
      return { icon: Clock, label: 'Väntar på betalning', color: 'text-yellow-600', bg: 'bg-yellow-500/10' };
    case 'uncollectible':
      return { icon: AlertCircle, label: 'Ej indrivbar', color: 'text-red-600', bg: 'bg-red-500/10' };
    case 'void':
      return { icon: XCircle, label: 'Annullerad', color: 'text-muted-foreground', bg: 'bg-muted' };
    default:
      return { icon: FileText, label: status, color: 'text-foreground', bg: 'bg-muted' };
  }
};

const formatBillingType = (type: string) => {
  switch (type) {
    case 'one_time': return 'Engångsbetalning';
    case 'monthly': return 'Månadsabonnemang';
    case 'yearly': return 'Årsabonnemang';
    default: return type;
  }
};

// Payment Form Component
function PaymentForm({ 
  onSuccess, 
  onError,
  isProcessing,
  setIsProcessing 
}: { 
  onSuccess: () => void; 
  onError: (msg: string) => void;
  isProcessing: boolean;
  setIsProcessing: (v: boolean) => void;
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
        // Payment requires additional action or is processing
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
        }}
      />
      
      <Button 
        type="submit" 
        className="w-full h-12 text-base font-medium"
        disabled={!stripe || !elements || isProcessing}
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Bearbetar...
          </>
        ) : (
          'Slutför betalning'
        )}
      </Button>
      
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Shield className="h-3.5 w-3.5" />
        <span>Säker betalning med kryptering</span>
      </div>
    </form>
  );
}

export default function BillingInvoiceDetail() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const { enterpriseMembership, isLoading: subLoading } = useSubscription();
  const navigate = useNavigate();
  
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Initialize Stripe
  useEffect(() => {
    setStripePromise(loadStripe(STRIPE_PUBLISHABLE_KEY));
  }, []);

  // Fetch invoice details
  const fetchInvoice = useCallback(async () => {
    if (!enterpriseMembership?.isMember || !enterpriseMembership.company?.id || !invoiceId) {
      return;
    }

    try {
      setLoading(true);
      // Get billing history from enterprise membership
        const response = await apiClient.getMyEnterpriseMembership();
      const billingHistory = (response as any)?.company?.billingHistory || [];
      
      // Find the specific invoice
      const found = billingHistory.find((inv: any) => inv.id === invoiceId);
      
      if (found) {
        setInvoice({
          ...found,
          companyName: enterpriseMembership.company?.name,
        });
      } else {
        setError('Fakturan hittades inte');
      }
    } catch (err: any) {
      console.error('Failed to fetch invoice:', err);
      setError(err.message || 'Kunde inte hämta faktura');
    } finally {
      setLoading(false);
    }
  }, [enterpriseMembership, invoiceId]);

  useEffect(() => {
    if (!authLoading && !subLoading && user) {
      fetchInvoice();
    }
  }, [user, authLoading, subLoading, fetchInvoice]);

  // Poll for payment status after payment
  useEffect(() => {
    if (!paymentSuccess || !invoice) return;

    const pollStatus = async () => {
      try {
        const response = await apiClient.getMyEnterpriseMembership();
        const billingHistory = (response as any)?.company?.billingHistory || [];
        const updated = billingHistory.find((inv: any) => inv.id === invoiceId);
        
        if (updated && updated.status.toLowerCase() === 'paid') {
          setInvoice(prev => prev ? { ...prev, status: 'paid' } : null);
        }
      } catch (err) {
        console.error('Failed to poll status:', err);
      }
    };

    const interval = setInterval(pollStatus, 2000);
    pollStatus();
    
    return () => clearInterval(interval);
  }, [paymentSuccess, invoice, invoiceId]);

  const handlePaymentSuccess = () => {
    setPaymentSuccess(true);
    setIsProcessing(false);
  };

  const handlePaymentError = (msg: string) => {
    setPaymentError(msg);
    setIsProcessing(false);
  };

  // Not logged in
  if (!authLoading && !user) {
    return null;
  }

  // Not enterprise member
  if (!subLoading && !enterpriseMembership?.isMember) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Ingen åtkomst</h2>
            <p className="text-muted-foreground text-sm">
              Denna sida är endast för enterprise-kunder.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusInfo = invoice ? getStatusInfo(invoice.status) : null;
  const isPaid = invoice?.status.toLowerCase() === 'paid';
  const canPay = invoice && ['open', 'draft'].includes(invoice.status.toLowerCase()) && invoice.paymentIntentClientSecret;

  // Calculate VAT breakdown (amounts are VAT-inclusive)
  const netAmount = invoice ? Math.round(invoice.amountSek / 1.25) : 0;
  const vatAmount = invoice ? invoice.amountSek - netAmount : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate('/invoices')}
              className="shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary overflow-hidden flex items-center justify-center">
                <img src={tivlyLogo} alt="Tivly" className="w-full h-full object-contain p-0.5" />
              </div>
              <span className="font-semibold text-foreground">Faktura</span>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-8">
        {loading ? (
          <Card>
            <CardContent className="p-6 space-y-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="pt-6 text-center py-12">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <p className="text-destructive">{error}</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => navigate('/invoices')}
              >
                Tillbaka till fakturor
              </Button>
            </CardContent>
          </Card>
        ) : invoice ? (
          <div className="space-y-6">
            {/* Invoice Summary Card */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-2xl">
                      {invoice.amountSek.toLocaleString('sv-SE')} kr
                    </CardTitle>
                    <p className="text-muted-foreground text-sm mt-1">
                      {invoice.companyName || 'Enterprise'}
                    </p>
                  </div>
                  {statusInfo && (
                    <Badge className={`${statusInfo.bg} ${statusInfo.color} border-0`}>
                      <statusInfo.icon className="h-3.5 w-3.5 mr-1.5" />
                      {statusInfo.label}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Separator />
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Typ</span>
                    <p className="font-medium">{formatBillingType(invoice.type)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Fakturadatum</span>
                    <p className="font-medium">
                      {new Date(invoice.createdAt).toLocaleDateString('sv-SE', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                  {invoice.dueAt && (
                    <div>
                      <span className="text-muted-foreground">Förfallodatum</span>
                      <p className="font-medium">
                        {new Date(invoice.dueAt).toLocaleDateString('sv-SE', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Amount breakdown */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Belopp exkl. moms</span>
                    <span>{netAmount.toLocaleString('sv-SE')} kr</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Moms (25%)</span>
                    <span>{vatAmount.toLocaleString('sv-SE')} kr</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-semibold">
                    <span>Totalt inkl. moms</span>
                    <span>{invoice.amountSek.toLocaleString('sv-SE')} kr</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payment Section */}
            {paymentSuccess ? (
              <Card className="border-green-500/30 bg-green-500/5">
                <CardContent className="pt-6 text-center py-8">
                  <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-green-600 mb-2">Betalning genomförd!</h3>
                  <p className="text-muted-foreground">
                    Tack för din betalning. Du får ett kvitto via e-post.
                  </p>
                </CardContent>
              </Card>
            ) : isPaid ? (
              <Card className="border-green-500/30 bg-green-500/5">
                <CardContent className="pt-6 text-center py-8">
                  <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-green-600 mb-2">Fakturan är betald</h3>
                  <p className="text-muted-foreground">
                    Denna faktura har redan betalats.
                  </p>
                </CardContent>
              </Card>
            ) : canPay && stripePromise ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Betala faktura</CardTitle>
                </CardHeader>
                <CardContent>
                  {paymentError && (
                    <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                      {paymentError}
                    </div>
                  )}
                  
                  <Elements 
                    stripe={stripePromise} 
                    options={{
                      clientSecret: invoice.paymentIntentClientSecret,
                      appearance: {
                        theme: 'stripe',
                        variables: {
                          colorPrimary: 'hsl(173, 80%, 40%)',
                          borderRadius: '8px',
                        },
                      },
                      loader: 'auto',
                    }}
                  >
                    <PaymentForm 
                      onSuccess={handlePaymentSuccess}
                      onError={handlePaymentError}
                      isProcessing={isProcessing}
                      setIsProcessing={setIsProcessing}
                    />
                  </Elements>
                </CardContent>
              </Card>
            ) : invoice.status.toLowerCase() === 'void' || invoice.status.toLowerCase() === 'uncollectible' ? (
              <Card className="border-muted">
                <CardContent className="pt-6 text-center py-8">
                  <XCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-muted-foreground">Fakturan kan inte betalas</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Kontakta support om du har frågor.
                  </p>
                </CardContent>
              </Card>
            ) : null}

            {/* Terms */}
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
          </div>
        ) : null}
      </main>
    </div>
  );
}
