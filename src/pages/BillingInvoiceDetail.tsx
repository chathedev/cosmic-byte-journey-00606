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
  CreditCard,
  RefreshCw
} from "lucide-react";
import { InvoicePaymentDialog } from "@/components/InvoicePaymentDialog";

interface InvoiceDetail {
  id: string;
  invoiceId: string;
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

// Helper to convert öre (cents) to kronor and format
// Stripe amounts are in smallest currency unit (öre for SEK)
const formatAmountSEK = (amountInOre: number | undefined | null): string => {
  if (typeof amountInOre !== 'number' || amountInOre <= 0) return '0,00';
  const kronor = amountInOre / 100;
  return kronor.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Convert öre to kronor (for calculations)
const oreToKronor = (amountInOre: number | undefined | null): number => {
  if (typeof amountInOre !== 'number') return 0;
  return amountInOre / 100;
};

// Format date safely
const formatDate = (dateStr: string | undefined | null): string => {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('sv-SE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch {
    return '—';
  }
};

export default function BillingInvoiceDetail() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const { enterpriseMembership, isLoading: subLoading } = useSubscription();
  const navigate = useNavigate();
  
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

  // Fetch invoice details from member-safe endpoint
  const fetchInvoice = useCallback(async (showRefreshState = false) => {
    if (!enterpriseMembership?.isMember || !invoiceId) {
      return;
    }

    try {
      if (showRefreshState) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      
      // Use member-safe endpoint to get fresh paymentIntentClientSecret
      const response = await apiClient.getEnterpriseInvoiceDetail(invoiceId);
      
      if (response.success && response.invoice) {
        const inv = response.invoice as any;
        // API may return amountSek or amountDue/amountPaid (in öre)
        // Use amountSek if present, otherwise use amountDue or amountPaid
        const amount = inv.amountSek ?? inv.amountDue ?? inv.amountPaid ?? 0;
        
        setInvoice({
          id: inv.id,
          invoiceId: inv.invoiceId || invoiceId,
          type: inv.billingType || 'monthly',
          amountSek: amount,
          oneTimeAmountSek: inv.oneTimeAmountSek,
          status: inv.status || 'unknown',
          createdAt: inv.createdAt || inv.paidAt || new Date().toISOString(),
          dueAt: inv.dueAt || inv.dueDate,
          hostedInvoiceUrl: inv.hostedInvoiceUrl,
          hostedInvoicePath: inv.hostedInvoicePath,
          stripeInvoiceUrl: inv.stripeInvoiceUrl,
          paymentIntentClientSecret: inv.paymentIntentClientSecret,
          paymentIntentId: inv.paymentIntentId,
          paymentIntentStatus: inv.paymentIntentStatus,
          subscriptionId: inv.subscriptionId,
          companyName: inv.companyName || enterpriseMembership.company?.name,
          combineOneTime: inv.combineOneTime,
        });
      } else {
        setError('Fakturan hittades inte');
      }
    } catch (err: any) {
      console.error('Failed to fetch invoice:', err);
      setError(err.message || 'Kunde inte hämta faktura');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [enterpriseMembership, invoiceId]);

  useEffect(() => {
    if (!authLoading && !subLoading && user && enterpriseMembership?.isMember) {
      fetchInvoice();
    }
  }, [user, authLoading, subLoading, enterpriseMembership?.isMember, fetchInvoice]);

  const handlePaymentSuccess = async () => {
    // Refresh invoice data after successful payment
    await fetchInvoice(true);
    setPaymentDialogOpen(false);
  };

  const handleRefresh = () => {
    fetchInvoice(true);
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

  // Calculate VAT breakdown (amounts are in öre, VAT-inclusive)
  const totalKronor = oreToKronor(invoice?.amountSek);
  const netKronor = totalKronor / 1.25;
  const vatKronor = totalKronor - netKronor;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => navigate('/billing/invoices')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Tillbaka till fakturor
          </Button>
          {invoice && !loading && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Uppdatera
            </Button>
          )}
        </div>

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
                onClick={() => navigate('/billing/invoices')}
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
                      {formatAmountSEK(invoice.amountSek)} kr
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
                    <p className="font-medium">{formatDate(invoice.createdAt)}</p>
                  </div>
                  {invoice.dueAt && (
                    <div>
                      <span className="text-muted-foreground">Förfallodatum</span>
                      <p className="font-medium">{formatDate(invoice.dueAt)}</p>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Amount breakdown */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Belopp exkl. moms</span>
                    <span>{netKronor > 0 ? netKronor.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'} kr</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Moms (25%)</span>
                    <span>{vatKronor > 0 ? vatKronor.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'} kr</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-semibold">
                    <span>Totalt inkl. moms</span>
                    <span>{formatAmountSEK(invoice.amountSek)} kr</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payment Section */}
            {isPaid ? (
              <Card className="border-green-500/30 bg-green-500/5">
                <CardContent className="pt-6 text-center py-8">
                  <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-green-600 mb-2">Fakturan är betald</h3>
                  <p className="text-muted-foreground">
                    Denna faktura har redan betalats.
                  </p>
                </CardContent>
              </Card>
            ) : canPay ? (
              <Card>
                <CardContent className="pt-6 text-center py-8">
                  <CreditCard className="h-12 w-12 text-primary mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Redo att betala</h3>
                  <p className="text-muted-foreground text-sm mb-6">
                    Klicka på knappen nedan för att slutföra betalningen säkert.
                  </p>
                  <Button 
                    size="lg" 
                    className="gap-2 px-8"
                    onClick={() => setPaymentDialogOpen(true)}
                  >
                    <CreditCard className="h-4 w-4" />
                    Betala {formatAmountSEK(invoice.amountSek)} kr
                  </Button>
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
            ) : ['open', 'draft'].includes(invoice.status.toLowerCase()) && !invoice.paymentIntentClientSecret ? (
              <Card className="border-yellow-500/30 bg-yellow-500/5">
                <CardContent className="pt-6 text-center py-8">
                  <Clock className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-yellow-600 mb-2">Betalning förbereds</h3>
                  <p className="text-muted-foreground text-sm">
                    Fakturan bearbetas. Prova att uppdatera sidan om en stund.
                  </p>
                  <Button 
                    variant="outline"
                    size="sm"
                    className="mt-4 gap-2"
                    onClick={handleRefresh}
                    disabled={refreshing}
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                    Uppdatera status
                  </Button>
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
      </div>

      {/* Payment Dialog */}
      {invoice && canPay && (
        <InvoicePaymentDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          clientSecret={invoice.paymentIntentClientSecret!}
          amount={invoice.amountSek}
          companyName={invoice.companyName}
          invoiceType={invoice.type}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
}