import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription, getPaymentDomain } from '@/contexts/SubscriptionContext';
import { subscriptionService } from '@/lib/subscription';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, Loader2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';
import { loadStripe, Stripe, StripeElements } from '@stripe/stripe-js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { getProducts, purchaseProduct, restorePurchases as nativeRestore } from '@/lib/nativeStoreKit';

const STRIPE_PUBLISHABLE_KEY = 'pk_live_51QH6igLnfTyXNYdEPTKgwYTUNqaCdfAxxKm3muIlm6GmLVvguCeN71I6udCVwiMouKam1BSyvJ4EyELKDjAsdIUo00iMqzDhqu';

interface SubscribeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SubscribeDialog({ open, onOpenChange }: SubscribeDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { refreshPlan, userPlan, paymentDomain } = useSubscription();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'pro' | 'plus' | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [storeKitError, setStoreKitError] = useState<string | null>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const cardElementRef = useRef<any>(null);
  
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isIOSDomain = hostname === 'io.tivly.se';
  const isWebDomain = hostname === 'app.tivly.se';

  useEffect(() => {
    setFullName(user?.displayName || '');
    setEmail(user?.email || '');
  }, [user]);

  useEffect(() => {
    if (isIOSDomain) {
      console.log('[Paywall] Using Native Apple StoreKit (io.tivly.se)');
    } else if (isWebDomain) {
      console.log('[Paywall] Using Stripe (app.tivly.se)');
    } else {
      console.log('[Paywall] Development mode - using Stripe fallback');
    }
  }, [isIOSDomain, isWebDomain]);

  useEffect(() => {
    if (!open) {
      if (cardElementRef.current) {
        try { cardElementRef.current.unmount(); cardElementRef.current.destroy?.(); } catch { }
        cardElementRef.current = null;
      }
      elementsRef.current = null;
      stripeRef.current = null;
      setSelectedPlan(null);
      setClientSecret(null);
      setStoreKitError(null);
    }
  }, [open]);

  // Handle Native Apple StoreKit purchase (io.tivly.se ONLY)
  const handleAppleIAPPurchase = async () => {
    if (!isIOSDomain) {
      console.warn('[Paywall] Blocked: purchase called on non-iOS domain');
      return;
    }
    
    console.log('[Paywall] 🍎 Native StoreKit purchase triggered');
    setIsLoading(true);
    setStoreKitError(null);
    
    try {
      const result = await purchaseProduct();
      
      if (result.cancelled) {
        console.log('[Paywall] User cancelled purchase');
        return;
      }
      
      if (result.pending) {
        sonnerToast.info("Köpet väntar på godkännande");
        return;
      }
      
      if (result.success) {
        console.log('[Paywall] ✅ Purchase successful');
        await refreshPlan();
        sonnerToast.success("Prenumerationen är nu aktiv!");
        onOpenChange(false);
      }
    } catch (error: any) {
      console.error('[Paywall] ❌ StoreKit purchase error:', error);
      setStoreKitError("Apple-köp misslyckades. Försök igen senare.");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle restore purchases (io.tivly.se ONLY)
  const handleRestorePurchases = async () => {
    if (!isIOSDomain) {
      console.warn('[Paywall] Blocked: restore called on non-iOS domain');
      sonnerToast.error("Återställning fungerar endast i iOS-appen.");
      return;
    }
    
    console.log('[Paywall] 🔄 Restore purchases via StoreKit');
    setIsLoading(true);
    
    try {
      const result = await nativeRestore();
      console.log('[Paywall] ✅ Restore result:', result);
      
      await refreshPlan();
      sonnerToast.success("Köp återställda!");
      onOpenChange(false);
    } catch (error) {
      console.error('[Paywall] ❌ Restore error:', error);
      sonnerToast.error("Kunde inte återställa köp. Försök igen.");
    } finally {
      setIsLoading(false);
    }
  };

  // Main subscribe handler - routes based on DOMAIN ONLY
  const handleSubscribe = async (planName: 'pro') => {
    console.log('[Paywall] 🔘 handleSubscribe called | plan:', planName, '| domain:', hostname);

    // io.tivly.se = Apple IAP via RevenueCat, NEVER Stripe
    if (isIOSDomain) {
      console.log('[Paywall] Routing to Apple IAP (io.tivly.se)');
      return handleAppleIAPPurchase();
    }

    // app.tivly.se or dev = Stripe checkout, NEVER RevenueCat
    console.log('[Paywall] Routing to Stripe (app.tivly.se)');
    if (!user) return;

    setIsLoading(true);
    setSelectedPlan(planName);

    try {
      const resp = await subscriptionService.createSubscriptionIntent({
        plan: planName,
      });

      // Extract clientSecret from response (various possible keys)
      const pickFirstString = (...vals: any[]): string | null => {
        for (const v of vals) {
          if (typeof v === 'string' && v.trim().length > 0) return v;
        }
        return null;
      };

      const normalizedClientSecret = pickFirstString(
        (resp as any).clientSecret,
        (resp as any).client_secret,
        (resp as any).paymentIntentClientSecret,
        (resp as any).intentClientSecret
      );

      if (!normalizedClientSecret || typeof normalizedClientSecret !== 'string' || !normalizedClientSecret.includes('_secret_')) {
        console.error('Invalid clientSecret from backend:', resp);
        throw new Error('Saknar giltigt clientSecret från backend.');
      }

      setClientSecret(normalizedClientSecret);

      const stripe = await loadStripe(STRIPE_PUBLISHABLE_KEY);
      if (!stripe) throw new Error('Stripe kunde inte laddas');
      stripeRef.current = stripe;

      if (cardElementRef.current) {
        try { cardElementRef.current.unmount(); cardElementRef.current.destroy?.(); } catch { }
        cardElementRef.current = null;
      }

      const elements = stripe.elements({ clientSecret: normalizedClientSecret });
      elementsRef.current = elements;

      const paymentElement = elements.create('payment', {
        layout: 'tabs',
        wallets: {
          applePay: 'auto',
          googlePay: 'auto',
        },
        paymentMethodOrder: ['klarna', 'link', 'card', 'google_pay', 'apple_pay'],
      });
      paymentElement.mount('#payment-element-dialog');
      cardElementRef.current = paymentElement;
    } catch (error: any) {
      console.error('Subscription error:', error);
      toast({
        title: 'Fel',
        description: error.message || 'Kunde inte starta betalning',
        variant: 'destructive',
      });
      setSelectedPlan(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (!stripeRef.current || !clientSecret || !elementsRef.current) return;
    setIsLoading(true);
    try {
      // Submit the Payment Element to get the payment method
      const { error: submitError } = await elementsRef.current.submit();
      if (submitError) {
        throw new Error(submitError.message || 'Kunde inte skicka betalningsinformation.');
      }

      // Confirm the payment using confirmPayment (handles Payment Element)
      const result = await stripeRef.current.confirmPayment({
        elements: elementsRef.current,
        confirmParams: {
          return_url: `${window.location.origin}/subscribe/success`,
          payment_method_data: {
            billing_details: {
              name: fullName || user?.displayName || undefined,
              email: email || user?.email || undefined,
            },
          },
        },
        redirect: 'if_required',
      });

      if (result.error) {
        throw new Error(result.error.message || 'Betalningen misslyckades.');
      }

      // Payment succeeded - wait a moment for webhook to process, then refresh plan
      toast({ title: 'Klart!', description: 'Din prenumeration är nu aktiv.' });

      // Wait for webhook to update backend
      await new Promise(resolve => setTimeout(resolve, 2000));
      await refreshPlan();

      onOpenChange(false);
      window.location.reload();
    } catch (error: any) {
      console.error('confirmPayment error:', error);
      toast({ title: 'Fel', description: error.message || 'Kunde inte genomföra betalning', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const plans = [
    {
      name: 'Free',
      price: '0 kr',
      period: '/mån',
      features: [
        { text: '1 möte per månad', included: true },
        { text: 'Transkribering', included: true },
        { text: 'AI-genererat mötesprotokoll', included: true },
        { text: 'Export 1 gång/månad', included: true },
        { text: 'Delning 1 gång/månad', included: true },
        { text: 'Möten sparas inte', included: false },
        { text: 'Ingen möteshistorik', included: false },
        { text: 'Inga avancerade AI-funktioner', included: false },
      ],
      cta: 'Nuvarande plan',
      variant: 'outline' as const,
    },
    {
      name: 'Pro',
      price: '99 kr',
      period: '/mån',
      features: [
        { text: '10 möten per månad', included: true },
        { text: 'Transkribering & AI-protokoll', included: true },
        { text: 'Action items', included: true },
        { text: 'Obegränsad export (Word & PDF)', included: true },
        { text: 'Obegränsad delning', included: true },
        { text: 'Sparade möten (30 dagar)', included: true },
        { text: 'Normal bearbetning', included: true },
        { text: 'Inga teamfunktioner', included: false },
        { text: 'Ingen prioriterad support', included: false },
      ],
      cta: 'Välj Pro',
      variant: 'default' as const,
      planId: 'pro' as const,
      highlight: true,
    },
    {
      name: 'Enterprise',
      price: 'Kontakta oss',
      period: '',
      features: [
        { text: 'Obegränsade möten', included: true },
        { text: 'Team-dashboard & flera användare', included: true },
        { text: 'Full historik', included: true },
        { text: 'Transkribering & AI-protokoll', included: true },
        { text: 'Obegränsad export & delning', included: true },
        { text: 'Avancerade AI-funktioner', included: true },
        { text: 'Egen subdomän', included: true },
        { text: 'Prioriterad bearbetning', included: true },
        { text: 'Dedikerad kontaktperson', included: true },
        { text: 'Onboarding & utbildning', included: true },
        { text: 'SLA vid behov', included: true },
      ],
      cta: 'Kontakta oss',
      variant: 'outline' as const,
    },
  ];

  // iOS domain (io.tivly.se) should never show the Stripe payment details screen
  if (selectedPlan && !isIOSDomain) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">Betalningsuppgifter</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Slutför din Tivly Pro prenumeration
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 animate-fade-in">
            {/* Total Amount */}
            <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg p-3 sm:p-4 border border-primary/20">
              <div className="flex items-center justify-between">
                <span className="text-xs sm:text-sm font-medium text-muted-foreground">Totalt</span>
                <div className="text-right">
                  <div className="text-xl sm:text-2xl font-bold text-foreground">99 kr</div>
                  <div className="text-xs text-muted-foreground">per månad</div>
                </div>
              </div>
            </div>

            {/* Payment Element */}
            <div id="payment-element-dialog" className="min-h-[180px]" />

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  try { cardElementRef.current?.unmount(); cardElementRef.current?.destroy?.(); } catch { }
                  cardElementRef.current = null;
                  setSelectedPlan(null);
                }}
                className="flex-1"
              >
                Tillbaka
              </Button>
              <Button
                onClick={handleConfirmPayment}
                disabled={isLoading || !clientSecret}
                size="sm"
                className="flex-1"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    Bearbetar...
                  </>
                ) : (
                  'Betala'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl">Välj din plan</DialogTitle>
          {userPlan && (
            <DialogDescription className="text-xs">
              Aktiv plan: <span className="font-medium capitalize text-foreground">{userPlan.plan === 'free' ? 'Free' : userPlan.plan === 'pro' ? 'Pro' : userPlan.plan}</span>
            </DialogDescription>
          )}
        </DialogHeader>

        {/* iOS error display */}
        {isIOSDomain && storeKitError && (
          <div className="mb-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <div className="flex items-center gap-2 text-destructive text-xs">
              <AlertTriangle className="h-4 w-4" />
              <span>{storeKitError}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 py-3">
          {plans.map((plan, index) => (
            <Card
              key={plan.name}
              className={cn(
                "relative overflow-hidden flex flex-col",
                'highlight' in plan && plan.highlight && "border-primary shadow-md sm:scale-[1.02]"
              )}
            >
              {'highlight' in plan && plan.highlight && (
                <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground text-[10px] font-medium text-center py-1">
                  Mest populär
                </div>
              )}
              <CardHeader className={cn("p-3 sm:p-4 space-y-1", 'highlight' in plan && plan.highlight && "pt-7 sm:pt-8")}>
                <CardTitle className="text-base sm:text-lg font-bold">{plan.name}</CardTitle>
                <div>
                  <span className="text-xl sm:text-2xl font-bold text-foreground">{plan.price}</span>
                  {plan.period && <span className="text-xs text-muted-foreground">{plan.period}</span>}
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col p-3 sm:p-4 pt-0">
                <ul className="space-y-1.5 mb-3 flex-1 text-xs">
                  {plan.features.slice(0, 6).map((feature, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className={cn(
                        "mt-0.5 shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold",
                        feature.included ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      )}>
                        {feature.included ? '✓' : '−'}
                      </span>
                      <span className={cn(
                        feature.included ? "text-foreground" : "text-muted-foreground"
                      )}>
                        {feature.text}
                      </span>
                    </li>
                  ))}
                  {plan.features.length > 6 && (
                    <li className="text-[10px] text-muted-foreground pl-6">
                      +{plan.features.length - 6} fler
                    </li>
                  )}
                </ul>
                {'planId' in plan ? (
                  <Button
                    onClick={() => handleSubscribe(plan.planId)}
                    disabled={isLoading}
                    variant={plan.variant}
                    className={cn("w-full", 'highlight' in plan && plan.highlight && "shadow-sm")}
                    size="sm"
                  >
                    {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : plan.cta}
                  </Button>
                ) : plan.name === 'Enterprise' ? (
                  <Button
                    onClick={() => window.open('mailto:kontakt@tivly.se', '_blank')}
                    variant={plan.variant}
                    className="w-full"
                    size="sm"
                  >
                    {plan.cta}
                  </Button>
                ) : (
                  <Button variant={plan.variant} className="w-full" size="sm" disabled>
                    {plan.cta}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* StoreKit Error Display for io.tivly.se */}
        {isIOSDomain && storeKitError && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mx-4 mb-4 animate-fade-in">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
              <div>
                <p className="text-sm font-medium text-destructive">{storeKitError}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Kontakta support om problemet kvarstår.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Restore Purchases button for io.tivly.se */}
        {isIOSDomain && (
          <div className="flex justify-center pb-4 animate-fade-in">
            <Button
              variant="ghost"
              onClick={handleRestorePurchases}
              disabled={isLoading}
              size="sm"
              className="text-xs text-muted-foreground hover:text-foreground transition-all duration-200"
            >
              Återställ tidigare köp
            </Button>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
