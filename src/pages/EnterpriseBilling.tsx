import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { enterpriseBillingApi, BillingOverview, SubscriptionDetail } from "@/lib/enterpriseBillingApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  CreditCard, ExternalLink, CheckCircle, Clock, AlertCircle, 
  XCircle, FileText, AlertTriangle, Shield, ArrowLeft 
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { getCommercialPlanLabel } from "@/lib/commercialPlan";

const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return '–';
  return new Date(dateStr).toLocaleDateString('sv-SE', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
};

const getStatusLabel = (status: string) => {
  const map: Record<string, { label: string; className: string }> = {
    active: { label: 'Aktiv', className: 'bg-green-500/10 text-green-600 border-green-500/20' },
    trialing: { label: 'Trial', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
    canceled: { label: 'Avslutad', className: 'bg-muted text-muted-foreground' },
    past_due: { label: 'Förfallen', className: 'bg-red-500/10 text-red-600 border-red-500/20' },
    unpaid: { label: 'Obetald', className: 'bg-red-500/10 text-red-600 border-red-500/20' },
    incomplete: { label: 'Ofullständig', className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' },
  };
  return map[status] || { label: status, className: 'bg-muted text-muted-foreground' };
};

const getInvoiceStatusBadge = (status: string) => {
  switch (status.toLowerCase()) {
    case 'paid':
      return <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle className="h-3 w-3 mr-1" /> Betald</Badge>;
    case 'open':
    case 'draft':
      return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20"><Clock className="h-3 w-3 mr-1" /> Öppen</Badge>;
    case 'void':
      return <Badge className="bg-muted text-muted-foreground"><XCircle className="h-3 w-3 mr-1" /> Annullerad</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export default function EnterpriseBilling() {
  const { user, isLoading: authLoading } = useAuth();
  const { enterpriseMembership, isLoading: subLoading } = useSubscription();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [billing, setBilling] = useState<BillingOverview | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const companyId = enterpriseMembership?.company?.id;
  const canManage = billing?.viewer?.canManageBilling || subscription?.viewer?.canManageBilling || false;

  const fetchData = useCallback(async () => {
    if (!companyId) return;
    try {
      setLoading(true);
      const [billingData, subData] = await Promise.all([
        enterpriseBillingApi.getBillingOverview(companyId).catch(() => null),
        enterpriseBillingApi.getSubscription(companyId).catch(() => null),
      ]);
      if (billingData) setBilling(billingData);
      if (subData) setSubscription(subData);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Kunde inte hämta faktureringsdata');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (!authLoading && !subLoading && user && companyId) {
      fetchData();
    } else if (!authLoading && !subLoading) {
      setLoading(false);
    }
  }, [user, authLoading, subLoading, companyId, fetchData]);

  const handleOpenPortal = async () => {
    if (!companyId) return;
    try {
      setPortalLoading(true);
      const res = await enterpriseBillingApi.openPortal(companyId);
      if (res.portalUrl) {
        window.open(res.portalUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err: any) {
      toast({ title: 'Fel', description: err.message || 'Kunde inte öppna billingportalen', variant: 'destructive' });
    } finally {
      setPortalLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!companyId) return;
    try {
      setCancelling(true);
      const res = await enterpriseBillingApi.cancelSubscription(companyId, true);
      // Update local state
      if (subscription?.subscription) {
        setSubscription(prev => prev ? {
          ...prev,
          subscription: prev.subscription ? {
            ...prev.subscription,
            cancelAtPeriodEnd: res.subscription.cancelAtPeriodEnd,
            cancelAt: res.subscription.cancelAt,
            canceledAt: res.subscription.canceledAt,
            status: res.subscription.status,
          } : null,
        } : null);
      }
      toast({ title: 'Abonnemang uppsagt', description: 'Abonnemanget avslutas vid periodens slut.' });
      setShowCancelDialog(false);
    } catch (err: any) {
      toast({ title: 'Fel', description: err.message || 'Kunde inte säga upp abonnemanget', variant: 'destructive' });
    } finally {
      setCancelling(false);
    }
  };

  if (!authLoading && !user) return null;

  if (!subLoading && !enterpriseMembership?.isMember) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Ingen åtkomst</h2>
            <p className="text-muted-foreground text-sm">Denna sida är endast för team- och enterprise-kunder.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sub = subscription?.subscription;
  const latestInvoice = subscription?.latestInvoice;
  const hasBilling = !!(sub || billing?.activeSubscriptionId || (billing?.billingHistoryCount && billing.billingHistoryCount > 0));
  const showEmptyState = !loading && !hasBilling;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-4 mb-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Tillbaka
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Fakturering</h1>
              {enterpriseMembership?.company?.name && (
                <p className="text-muted-foreground text-sm mt-1">{enterpriseMembership.company.name}</p>
              )}
            </div>
            <Badge variant="outline" className="bg-primary/10 border-primary/20 text-primary">
              {enterpriseMembership?.company?.planType === 'enterprise' ? 'Enterprise' : 'Team'}
            </Badge>
          </div>
        </div>

        {/* Cancel banner */}
        {sub?.cancelAtPeriodEnd && (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
            <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0" />
            <div className="text-sm">
              <span className="font-medium text-yellow-700 dark:text-yellow-500">Abonnemanget avslutas vid periodens slut.</span>
              <span className="text-muted-foreground ml-1">Tillgång finns kvar fram till {formatDate(sub.currentPeriodEnd)}.</span>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Card key={i}><CardContent className="p-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : showEmptyState ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-1">Ingen faktureringsinformation tillgänglig</h3>
              <p className="text-muted-foreground text-sm">Det finns ingen aktiv prenumeration eller faktureringshistorik för detta bolag.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Current Plan */}
            {sub && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4" /> Aktuell plan
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge className={getStatusLabel(sub.status).className}>{getStatusLabel(sub.status).label}</Badge>
                  </div>
                  {sub.status === 'trialing' && sub.trialEnd && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Trial aktiv till</span>
                      <span className="text-sm font-medium">{formatDate(sub.trialEnd)}</span>
                    </div>
                  )}
                  {sub.status === 'trialing' && sub.autoChargeEnabled && (
                    <div className="flex items-center gap-2 text-xs text-green-600 bg-green-500/5 px-3 py-1.5 rounded">
                      <CheckCircle className="h-3 w-3" /> Auto-debitering klar — övergång sker automatiskt
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Period slutar</span>
                    <span className="text-sm font-medium">{formatDate(sub.currentPeriodEnd)}</span>
                  </div>
                  {sub.startedAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Startad</span>
                      <span className="text-sm">{formatDate(sub.startedAt)}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Payment Method */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="h-4 w-4" /> Betalmetod
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    {sub?.paymentMethodId ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="text-sm">Kort sparat</span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Inget kort sparat</span>
                    )}
                  </div>
                  {canManage && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleOpenPortal} 
                      disabled={portalLoading}
                      className="gap-1.5"
                    >
                      {portalLoading ? 'Öppnar...' : 'Hantera i billingportalen'}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Latest Invoice */}
            {latestInvoice && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4" /> Senaste faktura
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {((latestInvoice.amountDue || latestInvoice.amountPaid || 0) / 100).toLocaleString('sv-SE')} {(latestInvoice.currency || 'sek').toUpperCase()}
                        </span>
                        {getInvoiceStatusBadge(latestInvoice.status)}
                      </div>
                      <p className="text-xs text-muted-foreground">{formatDate(latestInvoice.created)}</p>
                    </div>
                    {latestInvoice.hostedInvoiceUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(latestInvoice.hostedInvoiceUrl!, '_blank')}
                        className="gap-1.5"
                      >
                        Visa faktura <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Billing History */}
            {billing?.billingHistory && billing.billingHistory.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Faktureringshistorik</CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => navigate('/billing/invoices')}>
                      Visa alla
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {billing.billingHistory.slice(0, 5).map((entry: any, i: number) => (
                      <div key={entry.id || i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{(entry.amountSek || 0).toLocaleString('sv-SE')} kr</span>
                          {getInvoiceStatusBadge(entry.status)}
                        </div>
                        <span className="text-xs text-muted-foreground">{formatDate(entry.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Cancel Subscription */}
            {canManage && sub && !sub.cancelAtPeriodEnd && sub.status !== 'canceled' && (
              <Card className="border-destructive/20">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Säg upp abonnemang</p>
                      <p className="text-xs text-muted-foreground">Abonnemanget avslutas vid periodens slut</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setShowCancelDialog(true)} className="text-destructive border-destructive/30 hover:bg-destructive/10">
                      Säg upp
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Permission notice for non-admins */}
        {!loading && hasBilling && !canManage && (
          <p className="text-xs text-muted-foreground text-center">
            Bara ägare och admins kan hantera betalmetoder och prenumerationer.
          </p>
        )}

        <div className="pt-6 border-t border-border text-center">
          <p className="text-xs text-muted-foreground">
            Frågor om fakturering? Kontakta{' '}
            <a href="mailto:support@tivly.se" className="text-primary hover:underline">support@tivly.se</a>
          </p>
        </div>
      </div>

      {/* Cancel Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Säg upp abonnemang</AlertDialogTitle>
            <AlertDialogDescription>
              Vill du säga upp abonnemanget vid periodens slut? Du har kvar tillgång fram till{' '}
              <span className="font-medium">{formatDate(sub?.currentPeriodEnd)}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={cancelling} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {cancelling ? 'Avslutar...' : 'Bekräfta uppsägning'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
