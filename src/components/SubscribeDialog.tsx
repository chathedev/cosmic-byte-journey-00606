import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { subscriptionService } from '@/lib/subscription';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, Loader2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { loadStripe, Stripe, StripeElements } from '@stripe/stripe-js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const STRIPE_PUBLISHABLE_KEY = 'pk_live_51QH6igLnfTyXNYdEPTKgwYTUNqaCdfAxxKm3muIlm6GmLVvguCeN71I6udCVwiMouKam1BSyvJ4EyELKDjAsdIUo00iMqzDhqu';

interface SubscribeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SubscribeDialog({ open, onOpenChange }: SubscribeDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { refreshPlan, userPlan } = useSubscription();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'pro' | 'plus' | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const cardElementRef = useRef<any>(null);

  useEffect(() => {
    setFullName(user?.displayName || '');
    setEmail(user?.email || '');
  }, [user]);

  useEffect(() => {
    if (!open) {
      // Cleanup on close
      if (cardElementRef.current) {
        try { cardElementRef.current.unmount(); cardElementRef.current.destroy?.(); } catch {}
        cardElementRef.current = null;
      }
      elementsRef.current = null;
      stripeRef.current = null;
      setSelectedPlan(null);
      setClientSecret(null);
      setPublishableKey(null);
    }
  }, [open]);

  const handleSubscribe = async (planName: 'pro' | 'plus') => {
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
      setPublishableKey(STRIPE_PUBLISHABLE_KEY);

      const stripe = await loadStripe(STRIPE_PUBLISHABLE_KEY);
      if (!stripe) throw new Error('Stripe kunde inte laddas');
      stripeRef.current = stripe;

      if (cardElementRef.current) {
        try { cardElementRef.current.unmount(); cardElementRef.current.destroy?.(); } catch {}
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
      cta: 'Kom igång',
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

  if (selectedPlan) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Betalningsuppgifter</DialogTitle>
            <DialogDescription>
              Slutför din {selectedPlan === 'pro' ? 'Tivly Pro' : 'Tivly Plus'} prenumeration
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Total Amount */}
            <div className="bg-muted/50 rounded-lg p-4 border border-border">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Totalt att betala</span>
                <span className="text-2xl font-bold text-foreground">
                  {selectedPlan === 'pro' ? '99' : '199'} kr
                  <span className="text-sm font-normal text-muted-foreground"> / månad</span>
                </span>
              </div>
            </div>

            {/* Payment Element */}
            <div>
              <div id="payment-element-dialog" className="min-h-[200px]" />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  try { cardElementRef.current?.unmount(); cardElementRef.current?.destroy?.(); } catch {}
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
                className="flex-1"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Välj din plan</DialogTitle>
          {userPlan && (
            <DialogDescription className="text-xs">
              Aktiv: <span className="font-medium capitalize">{userPlan.plan === 'free' ? 'Gratis' : userPlan.plan === 'pro' ? 'Pro' : userPlan.plan}</span>
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-6">
          {plans.map((plan) => (
            <Card 
              key={plan.name} 
              className={cn(
                "relative overflow-hidden flex flex-col transition-all",
                'highlight' in plan && plan.highlight && "border-primary shadow-lg scale-105"
              )}
            >
              {'highlight' in plan && plan.highlight && (
                <div className="absolute top-0 left-0 right-0 bg-primary text-primary-foreground text-xs font-medium text-center py-1">
                  Mest populär
                </div>
              )}
              <CardHeader className={cn("space-y-3", 'highlight' in plan && plan.highlight && "pt-10")}>
                <CardTitle className="text-xl font-semibold">{plan.name}</CardTitle>
                <div className="space-y-1">
                  <div className="text-2xl font-bold text-foreground">{plan.price}</div>
                  {plan.period && <div className="text-xs text-muted-foreground">{plan.period}</div>}
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col pt-4">
                <ul className="space-y-2.5 mb-6 flex-1">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <span className={cn(
                        "mt-0.5 shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-xs",
                        feature.included 
                          ? "bg-primary/10 text-primary" 
                          : "bg-muted text-muted-foreground"
                      )}>
                        {feature.included ? '✓' : '−'}
                      </span>
                      <span className={cn(
                        "leading-tight",
                        feature.included ? "text-foreground" : "text-muted-foreground"
                      )}>
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>
                {'planId' in plan ? (
                  <Button
                    onClick={() => handleSubscribe(plan.planId)}
                    disabled={isLoading}
                    variant={plan.variant}
                    className="w-full"
                    size="lg"
                  >
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {plan.cta}
                  </Button>
                ) : plan.name === 'Enterprise' ? (
                  <Button 
                    onClick={() => window.open('mailto:kontakt@tivly.se', '_blank')}
                    variant={plan.variant} 
                    className="w-full" 
                    size="lg"
                  >
                    {plan.cta}
                  </Button>
                ) : (
                  <Button 
                    variant={plan.variant} 
                    className="w-full" 
                    size="lg"
                    disabled
                  >
                    {plan.cta}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

      </DialogContent>
    </Dialog>
  );
}
