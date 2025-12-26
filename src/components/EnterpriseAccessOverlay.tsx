import { AlertCircle, CreditCard, Clock, Mail, Check } from 'lucide-react';
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

export const EnterpriseAccessOverlay = ({ membership, isAdmin }: EnterpriseAccessOverlayProps) => {
  const accessState = determineAccessState(membership);
  
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
          title: 'Obetald faktura',
          message: `Det finns en obetald faktura för ${accessState.companyName}.`,
          action: accessState.invoiceUrl 
            ? 'Betala fakturan för att fortsätta använda tjänsten.'
            : 'Kontakta din företagsadministratör för betalning.',
          actionButton: accessState.invoiceUrl ? {
            label: 'Betala nu',
            url: accessState.invoiceUrl,
          } : undefined,
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
  
  return (
    <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center p-6">
      <div className="text-center space-y-6 max-w-sm">
        <div className="w-14 h-14 mx-auto rounded-full bg-muted flex items-center justify-center">
          <IconComponent className="w-7 h-7 text-muted-foreground" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">{content.title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {content.message}
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {content.action}
          </p>
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
        
        <div className="pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Alla möten och data är säkrade och kommer att vara tillgängliga igen när tillgången förnyas.
          </p>
        </div>
      </div>
    </div>
  );
};
