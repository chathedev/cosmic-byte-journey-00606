import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { apiClient } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, ExternalLink, CheckCircle, Clock, AlertCircle, XCircle } from "lucide-react";
import tivlyLogo from "@/assets/tivly-logo.png";

interface Invoice {
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
  paymentIntentStatus?: string;
}

const getStatusBadge = (status: string) => {
  switch (status.toLowerCase()) {
    case 'paid':
      return <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle className="h-3 w-3 mr-1" /> Betald</Badge>;
    case 'open':
    case 'draft':
      return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20"><Clock className="h-3 w-3 mr-1" /> Öppen</Badge>;
    case 'uncollectible':
      return <Badge className="bg-red-500/10 text-red-600 border-red-500/20"><AlertCircle className="h-3 w-3 mr-1" /> Ej indrivbar</Badge>;
    case 'void':
      return <Badge className="bg-muted text-muted-foreground"><XCircle className="h-3 w-3 mr-1" /> Annullerad</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const formatBillingType = (type: string) => {
  switch (type) {
    case 'one_time': return 'Engångsbetalning';
    case 'monthly': return 'Månadsvis';
    case 'yearly': return 'Årsvis';
    default: return type;
  }
};

export default function BillingInvoices() {
  const { user, isLoading: authLoading } = useAuth();
  const { enterpriseMembership, isLoading: subLoading } = useSubscription();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInvoices = async () => {
      if (!enterpriseMembership?.isMember || !enterpriseMembership.company?.id) {
        return;
      }

      try {
        setLoading(true);
        // Use enterprise/me endpoint to get billing history for the member
        const response = await apiClient.getMyEnterpriseMembership();
        const billingHistory = (response as any)?.company?.billingHistory || [];
        
        // Sort by date descending
        const sorted = billingHistory.sort((a: any, b: any) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        
        setInvoices(sorted);
      } catch (err: any) {
        console.error('Failed to fetch invoices:', err);
        setError(err.message || 'Kunde inte hämta fakturor');
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading && !subLoading && user) {
      fetchInvoices();
    }
  }, [user, authLoading, subLoading, enterpriseMembership]);

  // Not logged in
  if (!authLoading && !user) {
    return null; // Will be redirected by parent
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
              Denna sida är endast för enterprise-kunder. Kontakta support om du tror att detta är ett fel.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary overflow-hidden flex items-center justify-center">
              <img src={tivlyLogo} alt="Tivly" className="w-full h-full object-contain p-1" />
            </div>
            <div>
              <h1 className="font-semibold text-foreground">Fakturering</h1>
              {enterpriseMembership?.company?.name && (
                <p className="text-xs text-muted-foreground">{enterpriseMembership.company.name}</p>
              )}
            </div>
          </div>
          <Badge variant="outline" className="bg-primary/10 border-primary/20 text-primary">
            Enterprise
          </Badge>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-foreground">Dina fakturor</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Hantera och betala dina enterprise-fakturor
          </p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-4 w-48" />
                    </div>
                    <Skeleton className="h-9 w-24" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <p className="text-destructive">{error}</p>
            </CardContent>
          </Card>
        ) : invoices.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-1">Inga fakturor</h3>
              <p className="text-muted-foreground text-sm">
                Du har inga fakturor ännu.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {invoices.map((invoice) => {
              const isPaid = invoice.status.toLowerCase() === 'paid';
              const canPay = ['open', 'draft'].includes(invoice.status.toLowerCase());
              
              return (
                <Card 
                  key={invoice.id} 
                  className={`transition-all hover:shadow-md ${canPay ? 'cursor-pointer hover:border-primary/50' : ''}`}
                  onClick={() => canPay && navigate(`/invoices/${invoice.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className={`p-2 rounded-lg ${isPaid ? 'bg-green-500/10' : 'bg-primary/10'}`}>
                          <FileText className={`h-5 w-5 ${isPaid ? 'text-green-600' : 'text-primary'}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-foreground">
                              {invoice.amountSek.toLocaleString('sv-SE')} kr
                            </span>
                            {getStatusBadge(invoice.status)}
                          </div>
                          <div className="text-sm text-muted-foreground mt-0.5">
                            {formatBillingType(invoice.type)} • {new Date(invoice.createdAt).toLocaleDateString('sv-SE', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </div>
                          {invoice.dueAt && !isPaid && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Förfaller: {new Date(invoice.dueAt).toLocaleDateString('sv-SE')}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="shrink-0">
                        {canPay ? (
                          <Button size="sm" className="gap-1.5">
                            Betala
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        ) : isPaid ? (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="gap-1.5"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/invoices/${invoice.id}`);
                            }}
                          >
                            Visa
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-border text-center">
          <p className="text-xs text-muted-foreground">
            Frågor om fakturering? Kontakta{' '}
            <a href="mailto:support@tivly.se" className="text-primary hover:underline">
              support@tivly.se
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
