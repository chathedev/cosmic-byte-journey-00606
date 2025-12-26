import { AlertCircle, CreditCard, Clock, Mail } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api';
import { EnterpriseMembership } from '@/contexts/SubscriptionContext';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

interface EnterpriseAccessOverlayProps {
  membership: EnterpriseMembership;
  isAdmin?: boolean;
}

type AccessState = 
  | { type: 'allowed' }
  | { type: 'trial_expired'; companyName: string }
  | { type: 'unpaid_invoice'; companyName: string; invoiceUrl?: string; amountDue?: number }
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
  
  // Check billing status - PAID INVOICE = ALLOWED
  // If billing status is 'active' or 'paid', or latest invoice is paid = access granted
  if (billing?.status === 'active' || billing?.status === 'paid') {
    return { type: 'allowed' };
  }
  
  // Check if latest invoice is paid - this means they have valid billing
  if (billing?.latestInvoice?.status === 'paid') {
    return { type: 'allowed' };
  }
  
  // Check for active subscription (even without cancelAtPeriodEnd)
  if (billing?.activeSubscription?.status === 'active') {
    // Check if it's canceled but still in grace period
    if (billing.activeSubscription.cancelAtPeriodEnd && billing.activeSubscription.currentPeriodEnd) {
      const periodEnd = new Date(billing.activeSubscription.currentPeriodEnd);
      const now = new Date();
      
      if (now < periodEnd) {
        // Still within the paid period - allow access but show as canceled_active
        return { type: 'canceled_active', companyName, cancelAt: periodEnd };
      } else {
        // Past the period end - block access
        return { type: 'canceled_expired', companyName };
      }
    }
    // Active subscription without cancel = allowed
    return { type: 'allowed' };
  }
  
  // Check for canceled subscription that's still in grace period
  if (billing?.activeSubscription?.cancelAtPeriodEnd && billing.activeSubscription.currentPeriodEnd) {
    const periodEnd = new Date(billing.activeSubscription.currentPeriodEnd);
    const now = new Date();
    
    if (now < periodEnd) {
      return { type: 'canceled_active', companyName, cancelAt: periodEnd };
    } else {
      return { type: 'canceled_expired', companyName };
    }
  }
  
  // Check for canceled subscription without active period
  if (billing?.status === 'canceled') {
    return { type: 'canceled_expired', companyName };
  }
  
  // Check for unpaid invoice
  if (billing?.status === 'unpaid' || billing?.latestInvoice?.status === 'open') {
    return { 
      type: 'unpaid_invoice', 
      companyName,
      invoiceUrl: billing.latestInvoice?.invoiceUrl,
      amountDue: billing.latestInvoice?.amountDue
    };
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

  const hasPaidInvoice = invoiceStatus === 'paid' || (typeof inv?.amountRemaining === 'number' && inv.amountRemaining === 0 && (inv.amountPaid || 0) > 0);
  const hasOpenInvoice = invoiceStatus === 'open' || invoiceStatus === 'unpaid' || (typeof inv?.amountRemaining === 'number' && inv.amountRemaining > 0);

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
        }
      : undefined,
  } as CompanyBilling;
}

export const EnterpriseAccessOverlay = ({ membership, isAdmin }: EnterpriseAccessOverlayProps) => {
  const companyId = membership.company?.id;
  const [liveBilling, setLiveBilling] = useState<LiveBillingStatusResponse | null>(null);
  const [isCheckingBilling, setIsCheckingBilling] = useState(false);
  const [billingCheckError, setBillingCheckError] = useState<string | null>(null);

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
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Okänt fel';
      setBillingCheckError(message);
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
          title: isCheckingBilling ? 'Kontrollerar faktureringsstatus…' : 'Obetald faktura',
          message: isCheckingBilling
            ? `Kontrollerar fakturering för ${accessState.companyName}…`
            : `Det finns en obetald faktura för ${accessState.companyName}.`,
          action: accessState.invoiceUrl
            ? 'Betala fakturan för att fortsätta använda tjänsten.'
            : 'Kontakta din företagsadministratör för betalning.',
          actionButton: accessState.invoiceUrl
            ? {
                label: 'Betala nu',
                url: accessState.invoiceUrl,
              }
            : undefined,
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
          icon: isCheckingBilling ? Clock : Mail,
          title: isCheckingBilling ? 'Kontrollerar faktureringsstatus…' : 'Ingen aktiv prenumeration',
          message: isCheckingBilling
            ? `Kontrollerar fakturering för ${accessState.companyName}…`
            : `Det finns ingen aktiv prenumeration för ${accessState.companyName}.`,
          action: isCheckingBilling
            ? 'Detta uppdateras automatiskt var 3:e sekund.'
            : 'Kontakta din företagsadministratör för att aktivera.',
        };
    }
  };

  const content = overlayContent();
  if (!content) return null;

  const IconComponent = content.icon;

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

        {content.actionButton && (
          <a
            href={content.actionButton.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <CreditCard className="w-4 h-4" />
            {content.actionButton.label}
          </a>
        )}

        {companyId && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={checkBillingNow}
              disabled={isCheckingBilling}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-colors disabled:opacity-60"
            >
              {isCheckingBilling ? 'Uppdaterar…' : 'Uppdatera status'}
            </button>
            <p className="text-xs text-muted-foreground">Auto-uppdateras var 3:e sekund.</p>
            {billingCheckError && (
              <p className="text-xs text-muted-foreground">
                Kunde inte hämta faktureringsstatus just nu. Försöker igen automatiskt.
              </p>
            )}
          </div>
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
