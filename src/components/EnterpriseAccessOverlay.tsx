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

// Enterprise billing uses the Tivly Enterprise Stripe account
const STRIPE_PUBLISHABLE_KEY = 'pk_live_51QH6igLnfTyXNYdEPTKgwYTUNqaCdfAxxKm3muIlm6GmLVvguCeN71I6udCVwiMouKam1BSyvJ4EyELKDjAsdIUo00iMqzDhqu';

// Helper to convert öre (cents) to kronor and format
// Stripe amounts are in smallest currency unit (öre for SEK)
const formatAmountSEK = (amountInOre: number | undefined | null): string => {
  if (typeof amountInOre !== 'number' || amountInOre <= 0) return '—';
  const kronor = amountInOre / 100;
  return kronor.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Convert öre to kronor (for calculations)
const oreToKronor = (amountInOre: number | undefined | null): number => {
  if (typeof amountInOre !== 'number') return 0;
  return amountInOre / 100;
};

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
    hostedInvoicePath?: string;
    stripeInvoiceUrl?: string;
    paymentIntentClientSecret?: string;
    paymentIntentId?: string;
    paymentIntentStatus?: string;
    amountDue?: number;
    amountPaid?: number;
    amountRemaining?: number;
    amountSek?: number;
    currency?: string;
    collectionMethod?: string;
    dueDate?: string | null;
    paidAt?: string | null;
    createdAt?: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
    billingType?: 'one_time' | 'monthly' | 'yearly';
    companyName?: string;
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
  const [isElementReady, setIsElementReady] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!stripe || !elements || !isElementReady) {
      console.warn('Stripe not ready:', { stripe: !!stripe, elements: !!elements, isElementReady });
      return;
    }

    setIsProcessing(true);

    try {
      // First submit the elements to validate them
      const { error: submitError } = await elements.submit();
      if (submitError) {
        onError(submitError.message || 'Vänligen fyll i betalningsuppgifterna');
        setIsProcessing(false);
        return;
      }

      // Then confirm the payment
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
      } else if (paymentIntent?.status === 'requires_action') {
        // 3D Secure or other authentication required - handled by Stripe
        // Will redirect if needed
      } else {
        setIsProcessing(false);
      }
    } catch (err: any) {
      console.error('Payment error:', err);
      onError(err.message || 'Ett fel uppstod vid betalningen');
      setIsProcessing(false);
    }
  };

  const isReady = stripe && elements && isElementReady;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="min-h-[200px]">
        <PaymentElement 
          onReady={() => {
            console.log('PaymentElement ready');
            setIsElementReady(true);
          }}
          onLoadError={(error) => {
            console.error('PaymentElement load error:', error);
            onError('Kunde inte ladda betalningsformuläret. Försök igen.');
          }}
          options={{
            layout: 'tabs',
            wallets: {
              applePay: 'auto',
              googlePay: 'auto',
            },
            paymentMethodOrder: ['card', 'apple_pay', 'google_pay', 'klarna'],
          }}
        />
        {!isElementReady && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Laddar betalningsformulär...</span>
          </div>
        )}
      </div>
      
      <Button 
        type="submit" 
        className="w-full h-12 text-base font-medium"
        disabled={!isReady || isProcessing}
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Bearbetar betalning...
          </>
        ) : !isReady ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Laddar...
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

  // Handle "Betala nu" button click - Uses Tivly-hosted approach with embedded Stripe Elements
  const handlePayNow = async () => {
    setIsLoadingPayment(true);
    setPaymentError(null);

    try {
      // Strategy 1: Try subscription endpoint first (has latest invoice with paymentIntentClientSecret)
      if (companyId && liveBilling?.latestInvoice?.paymentIntentClientSecret) {
        const inv = liveBilling.latestInvoice;
        setClientSecret(inv.paymentIntentClientSecret);
        const amt = inv.amountSek ?? inv.amountRemaining ?? inv.amountDue ?? 
          (accessState.type === 'unpaid_invoice' ? accessState.amountDue : 0) ?? 0;
        setPaymentAmount(amt);
        setShowPaymentForm(true);
        setIsLoadingPayment(false);
        return;
      }

      // Strategy 2: Fetch fresh data from subscription endpoint
      if (companyId) {
        try {
          const subResponse = await apiClient.getEnterpriseCompanyBillingSubscription(companyId) as LiveBillingStatusResponse;
          if (subResponse.latestInvoice?.paymentIntentClientSecret) {
            setClientSecret(subResponse.latestInvoice.paymentIntentClientSecret);
            const amt = subResponse.latestInvoice.amountSek ?? 
              subResponse.latestInvoice.amountRemaining ?? 
              subResponse.latestInvoice.amountDue ?? 0;
            setPaymentAmount(amt);
            setLiveBilling(subResponse);
            setShowPaymentForm(true);
            setIsLoadingPayment(false);
            return;
          }
        } catch (subError) {
          console.warn('Subscription endpoint failed, trying invoice detail:', subError);
        }
      }

      // Strategy 3: Try invoice detail endpoint
      const invoiceId = accessState.type === 'unpaid_invoice' ? accessState.invoiceId : liveBilling?.latestInvoice?.id;
      
      if (invoiceId) {
        const response = await apiClient.getEnterpriseInvoiceDetail(invoiceId);
        
        if (response.success && response.invoice?.paymentIntentClientSecret) {
          setClientSecret(response.invoice.paymentIntentClientSecret);
          const amt = response.invoice.amountSek ?? 
            (accessState.type === 'unpaid_invoice' ? accessState.amountDue : 0) ?? 0;
          setPaymentAmount(amt);
          setShowPaymentForm(true);
          setIsLoadingPayment(false);
          return;
        }
      }

      // No payment intent available - show error
      setPaymentError('Betalningsuppgifter kunde inte hämtas. Kontakta support.');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Ett fel uppstod vid hämtning av betalning';
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

  // Show a blank loading screen while checking billing status for the first time
  // This prevents the dashboard from flashing before the check completes
  if (!hasInitialCheck && companyId) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 overflow-hidden flex items-center justify-center">
            <img src={tivlyLogo} alt="Tivly" className="w-full h-full object-contain p-3" />
          </div>
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Kontrollerar åtkomst...</span>
          </div>
        </div>
      </div>
    );
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

  // Calculate VAT breakdown for payment form - amounts are in öre, convert to kronor
  const safePaymentAmountKronor = oreToKronor(paymentAmount);
  const netAmountKronor = safePaymentAmountKronor / 1.25;
  const vatAmountKronor = safePaymentAmountKronor - netAmountKronor;

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
      <div className="fixed inset-0 z-[9999] bg-background overflow-y-auto">
        <div className="min-h-full flex items-center justify-center p-6">
          <div className="text-center space-y-6 max-w-sm w-full">
            <div className="w-20 h-20 mx-auto rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            </div>
            <div className="space-y-3">
              <h1 className="text-2xl font-semibold tracking-tight">Betalning genomförd!</h1>
              <p className="text-muted-foreground leading-relaxed">
                Tack för din betalning. Ett kvitto skickas till din e-post.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 py-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Uppdaterar...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Payment form screen - fully scrollable
  if (showPaymentForm && clientSecret && stripePromise) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background overflow-y-auto">
        <div className="min-h-full py-8 px-4 sm:px-6">
          <div className="w-full max-w-md mx-auto">
            {/* Back button */}
            <button
              onClick={handleBackToOverlay}
              className="mb-6 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
              <span>Tillbaka</span>
            </button>

            {/* Header Card */}
            <div className="bg-gradient-to-br from-primary/5 via-primary/10 to-primary/5 border border-border rounded-2xl p-6 mb-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-xl bg-primary/10 overflow-hidden flex items-center justify-center shadow-sm">
                  <img src={tivlyLogo} alt="Tivly" className="w-full h-full object-contain p-2" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-foreground">Tivly Enterprise</h1>
                  {accessState.type === 'unpaid_invoice' && (
                    <p className="text-sm text-muted-foreground">{accessState.companyName}</p>
                  )}
                </div>
              </div>

              {/* Amount display */}
              <div className="text-center py-4 px-6 bg-background/60 rounded-xl backdrop-blur-sm">
                <p className="text-sm text-muted-foreground mb-1">Att betala</p>
                <p className="text-4xl font-bold text-foreground tracking-tight">
                  {formatAmountSEK(paymentAmount)}
                  <span className="text-2xl font-medium ml-1">kr</span>
                </p>
                <Badge variant="secondary" className="mt-3">
                  <CreditCard className="h-3 w-3 mr-1.5" />
                  {liveBilling?.latestInvoice?.billingType === 'monthly' ? 'Månadsbetalning' :
                   liveBilling?.latestInvoice?.billingType === 'yearly' ? 'Årsbetalning' :
                   liveBilling?.latestInvoice?.billingType === 'one_time' ? 'Engångsbetalning' :
                   'Faktura'}
                </Badge>
              </div>
            </div>

            {/* Cost breakdown */}
            <div className="bg-muted/30 border border-border rounded-xl p-5 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">Sammanställning</span>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Belopp exkl. moms</span>
                  <span className="text-foreground font-medium">{netAmountKronor > 0 ? netAmountKronor.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'} kr</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Moms (25%)</span>
                  <span className="text-foreground font-medium">{vatAmountKronor > 0 ? vatAmountKronor.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'} kr</span>
                </div>
                <Separator className="my-3" />
                <div className="flex justify-between text-base font-semibold">
                  <span className="text-foreground">Totalt</span>
                  <span className="text-primary">{formatAmountSEK(paymentAmount)} kr</span>
                </div>
              </div>
            </div>

            {/* Error message */}
            {paymentError && (
              <div className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-3">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <span>{paymentError}</span>
              </div>
            )}

            {/* Stripe Payment Form */}
            <div className="bg-background border border-border rounded-xl p-6 mb-6">
              <h2 className="text-sm font-medium text-foreground mb-4">Betalningsuppgifter</h2>
              <Elements 
                stripe={stripePromise} 
                options={{
                  clientSecret,
                  appearance: {
                    theme: 'stripe',
                    variables: {
                      colorPrimary: 'hsl(173, 80%, 40%)',
                      borderRadius: '10px',
                      fontFamily: 'system-ui, -apple-system, sans-serif',
                      spacingUnit: '4px',
                    },
                    rules: {
                      '.Label': {
                        color: 'hsl(var(--foreground))',
                        marginBottom: '8px',
                        fontSize: '14px',
                      },
                      '.Input': {
                        borderColor: 'hsl(var(--border))',
                        boxShadow: 'none',
                        padding: '12px',
                      },
                      '.Input:focus': {
                        borderColor: 'hsl(173, 80%, 40%)',
                        boxShadow: '0 0 0 2px hsl(173, 80%, 40%, 0.15)',
                      },
                      '.Tab': {
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '8px',
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
            </div>

            {/* Terms and security footer */}
            <div className="text-center space-y-4 pb-8">
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Shield className="h-4 w-4" />
                <span>Säker och krypterad betalning via Stripe</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Genom att slutföra betalningen godkänner du{' '}
                <a 
                  href="https://www.tivly.se/enterprise-villkor" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-medium"
                >
                  Tivly Enterprise-villkor
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Enhanced unpaid invoice / blocked access screen
  return (
    <div className="fixed inset-0 z-[9999] bg-background overflow-y-auto">
      <div className="min-h-full flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 overflow-hidden flex items-center justify-center shadow-sm">
              <img src={tivlyLogo} alt="Tivly" className="w-full h-full object-contain p-3" />
            </div>
          </div>

          {/* Main card */}
          <div className="bg-gradient-to-br from-muted/50 via-muted/30 to-muted/50 border border-border rounded-2xl p-8 text-center">
            {/* Icon */}
            <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center mb-6">
              <IconComponent className="w-8 h-8 text-amber-500" />
            </div>

            {/* Content */}
            <div className="space-y-3 mb-8">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{content.title}</h1>
              <p className="text-muted-foreground leading-relaxed">{content.message}</p>
              
              {/* Show amount if available - amounts are in öre */}
              {accessState.type === 'unpaid_invoice' && accessState.amountDue && accessState.amountDue > 0 && (
                <div className="py-4 px-6 bg-background/60 rounded-xl mt-4">
                  <p className="text-sm text-muted-foreground mb-1">Belopp att betala</p>
                  <p className="text-3xl font-bold text-foreground">
                    {formatAmountSEK(accessState.amountDue)}
                    <span className="text-lg font-medium ml-1">kr</span>
                  </p>
                </div>
              )}
            </div>

            {/* Error message */}
            {paymentError && (
              <div className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-3 text-left">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <span>{paymentError}</span>
              </div>
            )}

            {/* Action button */}
            {content.showPayButton && (
              <Button
                onClick={handlePayNow}
                disabled={isLoadingPayment}
                size="lg"
                className="w-full h-14 text-base font-medium rounded-xl shadow-lg shadow-primary/20"
              >
                {isLoadingPayment ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Laddar betalning...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5 mr-2" />
                    Betala nu
                  </>
                )}
              </Button>
            )}

            {/* Action text if no button */}
            {!content.showPayButton && (
              <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
                {content.action}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="mt-8 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted/50 text-xs text-muted-foreground">
              <Shield className="h-3.5 w-3.5" />
              <span>Alla möten och data är säkrade</span>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Kontakta{' '}
              <a href="mailto:support@tivly.se" className="text-primary hover:underline">
                support@tivly.se
              </a>
              {' '}vid frågor
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
