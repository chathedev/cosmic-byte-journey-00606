import { AlertCircle, CreditCard, Clock, Mail, Loader2, CheckCircle2, Shield, Building2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api';
import { EnterpriseMembership } from '@/contexts/SubscriptionContext';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import tivlyLogo from '@/assets/tivly-logo.png';

const STRIPE_PUBLISHABLE_KEY = 'pk_live_51RBmwME0yFmyBl81G1NTIqm31T3hPUmYvdYQl5QLa3WKwrJhqNpHKYCLpLNjg0RfN9xZiS89s5t1z0SnDzk1lBQy00BjPV4ERK';

interface EnterpriseAccessOverlayProps {
  membership: EnterpriseMembership;
  isAdmin?: boolean;
}

type AccessState = 
  | { type: 'allowed' }
  | { type: 'trial_expired'; companyName: string }
  | { type: 'unpaid_invoice'; companyName: string; invoiceId?: string; invoiceUrl?: string; amountDue?: number }
  | { type: 'canceled_active'; companyName: string; cancelAt: Date }
  | { type: 'canceled_expired'; companyName: string }
  | { type: 'no_billing'; companyName: string };

function determineAccessState(membership: EnterpriseMembership): AccessState {
  const company = membership.company;
  if (!company) return { type: 'allowed' };

  const companyName = company.name;
  const trial = company.trial;
  const billing = company.billing;
  const preferences = company.preferences;

  // Special perk enabled = bypass all checks
  if (preferences?.specialPerkEnabled) {
    return { type: 'allowed' };
  }

  // Check trial status first (if trial is enabled)
  if (trial?.enabled) {
    // If manually disabled, trial locks are removed
    if (trial.manuallyDisabled) {
      return { type: 'allowed' };
    }
    // If trial expired, block access
    if (trial.expired) {
      return { type: 'trial_expired', companyName };
    }
    // Trial active and not expired = allowed
    return { type: 'allowed' };
  }

  // Subscription status has priority over invoice state.
  // If the subscription is canceled/ended, access should be blocked (unless special perk).
  const activeSub = billing?.activeSubscription;
  if (activeSub) {
    const now = new Date();
    const subStatus = (activeSub.status || '').toLowerCase();
    const periodEnd = activeSub.currentPeriodEnd ? new Date(activeSub.currentPeriodEnd) : null;
    const scheduledCancel = !!activeSub.cancelAtPeriodEnd && !!periodEnd && now < periodEnd;

    // If backend reports the subscription has ended, always block immediately.
    if (activeSub.endedAt) {
      const endedAt = new Date(activeSub.endedAt);
      if (Number.isNaN(endedAt.getTime()) || endedAt <= now) {
        return { type: 'canceled_expired', companyName };
      }
    }

    // Fully canceled/ended subscription
    if (subStatus === 'canceled' || subStatus === 'ended') {
      // Exception: cancel at period end and still within the paid period => allow with banner
      if (scheduledCancel) {
        return { type: 'canceled_active', companyName, cancelAt: periodEnd! };
      }
      return { type: 'canceled_expired', companyName };
    }

    // Active subscription
    if (subStatus === 'active' || subStatus === 'trialing') {
      if (scheduledCancel) {
        return { type: 'canceled_active', companyName, cancelAt: periodEnd! };
      }
      return { type: 'allowed' };
    }
  }

  // Canceled billing without an active subscription object
  if (billing?.status === 'canceled') {
    return { type: 'canceled_expired', companyName };
  }

  // Unpaid invoice blocks access
  if (billing?.status === 'unpaid' || billing?.latestInvoice?.status === 'open') {
    return {
      type: 'unpaid_invoice',
      companyName,
      invoiceId: billing.latestInvoice?.id,
      invoiceUrl: billing.latestInvoice?.invoiceUrl,
      amountDue: billing.latestInvoice?.amountDue,
    };
  }

  // Active/paid billing grants access
  if (billing?.status === 'active' || billing?.status === 'paid') {
    return { type: 'allowed' };
  }

  // Fallback: paid latest invoice grants access (only reached if not canceled/unpaid)
  if (billing?.latestInvoice?.status === 'paid') {
    return { type: 'allowed' };
  }

  // No billing at all and no trial = show contact overlay
  // But only if trial was set up before (endsAt exists) OR status is inactive
  if (!billing || billing.status === 'none') {
    if (trial?.endsAt || company.status === 'inactive') {
      return { type: 'no_billing', companyName };
    }
    // New company with no trial setup yet - allow access
    return { type: 'allowed' };
  }

  // All good - default to allowed
  return { type: 'allowed' };
}

type LiveBillingStatusResponse = {
  success: boolean;
  companyId: string;
  subscription: null | {
    id: string;
    status: string;
    collectionMethod?: string;
    autoChargeEnabled?: boolean;
    currentPeriodStart?: string | null;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean;
    cancelAt?: string | null;
    canceledAt?: string | null;
    endedAt?: string | null;
    trialEnd?: string | null;
    paymentMethodId?: string | null;
    paymentMethodSource?: string | null;
  };
  latestInvoice: null | {
    id: string;
    status: string;
    hostedInvoiceUrl?: string;
    amountDue?: number;
    amountPaid?: number;
    amountRemaining?: number;
    currency?: string;
    collectionMethod?: string;
    dueDate?: string | null;
    paidAt?: string | null;
    createdAt?: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
  };
  timestamp: string;
};

type Company = NonNullable<EnterpriseMembership['company']>;

type CompanyBilling = NonNullable<Company['billing']>;

function mapLiveToCompanyBilling(live: LiveBillingStatusResponse | null): Company['billing'] | undefined {
  if (!live) return undefined;

  const sub = live.subscription;
  const inv = live.latestInvoice;

  if (!sub && !inv) {
    return { status: 'none' } as CompanyBilling;
  }

  const invoiceUrl = inv?.hostedInvoiceUrl;
  const invoiceStatus = (inv?.status || '').toLowerCase();
  const subscriptionStatus = (sub?.status || '').toLowerCase();

  const hasPaidInvoice =
    invoiceStatus === 'paid' ||
    (typeof inv?.amountRemaining === 'number' && inv.amountRemaining === 0 && (inv.amountPaid || 0) > 0);
  const hasOpenInvoice =
    invoiceStatus === 'open' ||
    invoiceStatus === 'unpaid' ||
    (typeof inv?.amountRemaining === 'number' && inv.amountRemaining > 0);

  let status: CompanyBilling['status'] = 'none';

  if (subscriptionStatus === 'active' || subscriptionStatus === 'trialing') {
    status = 'active';
  } else if (subscriptionStatus === 'canceled' || subscriptionStatus === 'ended') {
    status = 'canceled';
  } else if (hasPaidInvoice) {
    status = 'paid';
  } else if (hasOpenInvoice) {
    status = 'unpaid';
  }

  return {
    status,
    latestInvoice: inv
      ? {
          id: inv.id,
          status: inv.status,
          billingType: sub ? 'subscription' : 'one_time',
          subscriptionId: sub?.id,
          subscriptionStatus: sub?.status,
          cancelAtPeriodEnd: sub?.cancelAtPeriodEnd,
          cancelAt: sub?.cancelAt ?? null,
          currentPeriodEnd: inv.periodEnd ?? sub?.currentPeriodEnd ?? undefined,
          amountDue: typeof inv.amountRemaining === 'number' ? inv.amountRemaining : inv.amountDue,
          invoiceUrl,
        }
      : undefined,
    activeSubscription: sub
      ? {
          id: sub.id,
          status: sub.status,
          cancelAtPeriodEnd: !!sub.cancelAtPeriodEnd,
          cancelAt: sub.cancelAt ?? null,
          currentPeriodEnd: sub.currentPeriodEnd ?? null,
          canceledAt: sub.canceledAt ?? null,
          endedAt: sub.endedAt ?? null,
        }
      : undefined,
  } as CompanyBilling;
}

// Inline Payment Form Component
function InlinePaymentForm({ 
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
  amount: number | undefined;
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
        className="w-full h-12 text-base font-medium"
        disabled={!stripe || !elements || isProcessing}
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Bearbetar betalning...
          </>
        ) : (
          <>
            Betala {typeof amount === 'number' ? amount.toLocaleString('sv-SE') : '—'} kr
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

export const EnterpriseAccessOverlay = ({ membership, isAdmin }: EnterpriseAccessOverlayProps) => {
  const companyId = membership.company?.id;
  const [liveBilling, setLiveBilling] = useState<LiveBillingStatusResponse | null>(null);
  const [isCheckingBilling, setIsCheckingBilling] = useState(false);
  const [billingCheckError, setBillingCheckError] = useState<string | null>(null);
  const [hasInitialCheck, setHasInitialCheck] = useState(false);

  // Payment form states
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [isLoadingPayment, setIsLoadingPayment] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);

  useEffect(() => {
    setStripePromise(loadStripe(STRIPE_PUBLISHABLE_KEY));
  }, []);

  const companyBillingFromLive = useMemo(() => mapLiveToCompanyBilling(liveBilling), [liveBilling]);

  const effectiveMembership = useMemo<EnterpriseMembership>(() => {
    if (!membership.company || !companyBillingFromLive) return membership;
    return {
      ...membership,
      company: {
        ...membership.company,
        billing: companyBillingFromLive,
      },
    };
  }, [membership, companyBillingFromLive]);

  const accessState = determineAccessState(effectiveMembership);

  const checkBillingNow = useCallback(async () => {
    if (!companyId) return;
    try {
      setIsCheckingBilling(true);
      const data = (await apiClient.getEnterpriseCompanyBillingSubscription(companyId)) as LiveBillingStatusResponse;
      setLiveBilling(data);
      setBillingCheckError(null);
      setHasInitialCheck(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Okänt fel';
      setBillingCheckError(message);
      setHasInitialCheck(true);
    } finally {
      setIsCheckingBilling(false);
    }
  }, [companyId]);

  // Auto-refresh billing status for members (e.g. right after an invoice is paid)
  useEffect(() => {
    if (!companyId || isAdmin) return;

    // Always do an initial check when mounted
    checkBillingNow();

    // Only poll while access is blocked
    if (accessState.type === 'allowed' || accessState.type === 'canceled_active') {
      return;
    }

    const id = window.setInterval(checkBillingNow, 3000);
    return () => window.clearInterval(id);
  }, [companyId, isAdmin, accessState.type, checkBillingNow]);

  // Handle "Betala nu" button click
  const handlePayNow = async () => {
    const invoiceId = accessState.type === 'unpaid_invoice' ? accessState.invoiceId : null;
    
    if (!invoiceId) {
      // Fallback to hosted URL if no invoice ID
      if (accessState.type === 'unpaid_invoice' && accessState.invoiceUrl) {
        window.open(accessState.invoiceUrl, '_blank');
      }
      return;
    }

    setIsLoadingPayment(true);
    setPaymentError(null);

    try {
      const response = await apiClient.getEnterpriseInvoiceDetail(invoiceId);
      
      if (response.success && response.invoice?.paymentIntentClientSecret) {
        setClientSecret(response.invoice.paymentIntentClientSecret);
        // Safely get amount with fallback
        const amt = typeof response.invoice.amountSek === 'number' 
          ? response.invoice.amountSek 
          : (accessState.type === 'unpaid_invoice' && typeof accessState.amountDue === 'number' ? accessState.amountDue : 0);
        setPaymentAmount(amt);
        setShowPaymentForm(true);
      } else if (response.invoice?.hostedInvoiceUrl || response.invoice?.stripeInvoiceUrl) {
        // Fallback to hosted URL
        window.open(response.invoice.hostedInvoiceUrl || response.invoice.stripeInvoiceUrl, '_blank');
      } else {
        setPaymentError('Kunde inte ladda betalningsformuläret. Försök igen.');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ett fel uppstod';
      setPaymentError(message);
    } finally {
      setIsLoadingPayment(false);
    }
  };

  const handlePaymentSuccess = () => {
    setPaymentSuccess(true);
    setIsProcessing(false);
    // Trigger billing check to update state
    setTimeout(() => {
      checkBillingNow();
    }, 1500);
  };

  const handleBackToOverlay = () => {
    setShowPaymentForm(false);
    setClientSecret(null);
    setPaymentError(null);
  };

  // Admins bypass all overlays
  if (isAdmin) {
    if (accessState.type !== 'allowed' && accessState.type !== 'canceled_active') {
      // Show admin banner for blocked states
      return (
        <div className="fixed top-0 left-0 right-0 z-[9998] bg-amber-500/90 text-amber-950 px-4 py-2 text-center text-sm font-medium backdrop-blur-sm">
          <AlertCircle className="w-4 h-4 inline-block mr-2" />
          Företagsåtkomst blockerad för användare ({accessState.type.replace(/_/g, ' ')})
        </div>
      );
    }
    return null;
  }

  // No overlay needed
  if (accessState.type === 'allowed') {
    return null;
  }

  // Canceled but still active - show info banner, don't block
  if (accessState.type === 'canceled_active') {
    const formattedDate = format(accessState.cancelAt, 'd MMMM yyyy', { locale: sv });
    return (
      <div className="fixed top-0 left-0 right-0 z-[9998] bg-amber-500/90 text-amber-950 px-4 py-2 text-center text-sm font-medium backdrop-blur-sm">
        <Clock className="w-4 h-4 inline-block mr-2" />
        Prenumerationen avslutas {formattedDate}
      </div>
    );
  }

  // Calculate VAT breakdown for payment form - with safe fallbacks
  const safePaymentAmount = typeof paymentAmount === 'number' && paymentAmount > 0 ? paymentAmount : 0;
  const netAmount = Math.round(safePaymentAmount / 1.25);
  const vatAmount = safePaymentAmount - netAmount;

  // Blocking overlays - minimalistic design matching MaintenanceOverlay
  const overlayContent = () => {
    switch (accessState.type) {
      case 'trial_expired':
        return {
          icon: Clock,
          title: 'Testperioden har löpt ut',
          message: `Testperioden för ${accessState.companyName} har löpt ut.`,
          action: 'Kontakta din företagsadministratör för att förnya tillgången.',
        };

      case 'unpaid_invoice':
        return {
          icon: CreditCard,
          title: 'Obetald faktura',
          message: `Det finns en obetald faktura för ${accessState.companyName}.`,
          action: accessState.invoiceId || accessState.invoiceUrl
            ? 'Betala fakturan för att fortsätta använda tjänsten.'
            : 'Kontakta din företagsadministratör för betalning.',
          showPayButton: !!(accessState.invoiceId || accessState.invoiceUrl),
        };

      case 'canceled_expired':
        return {
          icon: AlertCircle,
          title: 'Prenumerationen avslutad',
          message: `Prenumerationen för ${accessState.companyName} har avslutats.`,
          action: 'Kontakta din företagsadministratör för att återaktivera.',
        };

      case 'no_billing':
        return {
          icon: Mail,
          title: 'Ingen aktiv prenumeration',
          message: `Det finns ingen aktiv prenumeration för ${accessState.companyName}.`,
          action: 'Kontakta din företagsadministratör för att aktivera.',
        };
    }
  };

  const content = overlayContent();
  if (!content) return null;

  const IconComponent = content.icon;

  // Payment success screen
  if (paymentSuccess) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-6 max-w-sm">
          <div className="w-16 h-16 mx-auto rounded-full bg-green-500/10 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold tracking-tight">Betalning genomförd!</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Tack för din betalning. Ett kvitto skickas till din e-post.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Sidan uppdateras automatiskt...
            </p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  }

  // Payment form screen
  if (showPaymentForm && clientSecret && stripePromise) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center p-6 overflow-y-auto">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="bg-muted/50 border border-border rounded-t-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary overflow-hidden flex items-center justify-center">
                  <img src={tivlyLogo} alt="Tivly" className="w-full h-full object-contain p-1" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">Tivly Enterprise</h2>
                  {accessState.type === 'unpaid_invoice' && (
                    <p className="text-xs text-muted-foreground">{accessState.companyName}</p>
                  )}
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleBackToOverlay}
                className="h-8 w-8 rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Amount display */}
            <div className="text-center py-2">
              <p className="text-3xl font-bold text-foreground">
                {safePaymentAmount > 0 ? safePaymentAmount.toLocaleString('sv-SE') : '—'} kr
              </p>
              <Badge variant="secondary" className="mt-2">
                <CreditCard className="h-3 w-3 mr-1.5" />
                Obetald faktura
              </Badge>
            </div>
          </div>

          {/* Payment Form */}
          <div className="bg-background border-x border-b border-border rounded-b-xl p-6">
            {/* Cost breakdown */}
            <div className="mb-6 p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Kostnadssammanställning</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Belopp exkl. moms</span>
                  <span className="text-foreground">{netAmount > 0 ? netAmount.toLocaleString('sv-SE') : '—'} kr</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Moms (25%)</span>
                  <span className="text-foreground">{vatAmount > 0 ? vatAmount.toLocaleString('sv-SE') : '—'} kr</span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between font-semibold">
                  <span className="text-foreground">Totalt att betala</span>
                  <span className="text-primary">{safePaymentAmount > 0 ? safePaymentAmount.toLocaleString('sv-SE') : '—'} kr</span>
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
              <InlinePaymentForm 
                onSuccess={handlePaymentSuccess}
                onError={setPaymentError}
                isProcessing={isProcessing}
                setIsProcessing={setIsProcessing}
                amount={paymentAmount}
              />
            </Elements>

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
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center p-6">
      <div className="text-center space-y-6 max-w-sm">
        <div className="w-14 h-14 mx-auto rounded-full bg-muted flex items-center justify-center">
          <IconComponent className="w-7 h-7 text-muted-foreground" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">{content.title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{content.message}</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{content.action}</p>
        </div>

        {/* Error message */}
        {paymentError && (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {paymentError}
          </div>
        )}

        {content.showPayButton && (
          <Button
            onClick={handlePayNow}
            disabled={isLoadingPayment}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium"
          >
            {isLoadingPayment ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Laddar betalning...
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4" />
                Betala nu
              </>
            )}
          </Button>
        )}

        <div className="pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Alla möten och data är säkrade och kommer att vara tillgängliga igen när tillgången förnyas.
          </p>
        </div>
      </div>
    </div>
  );
};
