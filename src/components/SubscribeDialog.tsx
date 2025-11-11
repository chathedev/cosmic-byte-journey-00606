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
  const [selectedPlan, setSelectedPlan] = useState<'standard' | 'plus' | null>(null);
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

  const handleSubscribe = async (planName: 'standard' | 'plus') => {
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
      id: 'free',
      name: 'Testa Tivly',
      subtitle: '',
      price: '0',
      features: [
        '1 möte/månad',
        'AI-protokoll',
        'Transkribering',
        'Ingen autosparning (raderas efter 7 dagar)',
      ],
      highlighted: false,
      isPaid: false,
      cta: 'Kom igång',
    },
    {
      id: 'standard',
      name: 'Standard',
      subtitle: 'För de flesta',
      price: '99',
      features: [
        'Obegränsade möten',
        'AI-protokoll',
        'Transkribering',
        'Action items & mötesförslag med AI',
        'Smart prioritering',
        'Export till Word/PDF',
        'Autosparning',
        'E-postsupport',
        'Prioriterad bearbetning',
      ],
      highlighted: true,
      isPaid: true,
      cta: 'Välj Standard',
    },
  ];

  if (selectedPlan) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Betalningsuppgifter</DialogTitle>
            <DialogDescription>
              Slutför din {selectedPlan === 'standard' ? 'Tivly Standard' : 'Tivly Plus'} prenumeration
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Total Amount */}
            <div className="bg-muted/50 rounded-lg p-4 border border-border">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Totalt att betala</span>
                <span className="text-2xl font-bold text-foreground">
                  {selectedPlan === 'standard' ? '99' : '199'} kr
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Välj din plan</DialogTitle>
          {userPlan && (
            <DialogDescription className="text-xs">
              Aktiv: <span className="font-medium capitalize">{userPlan.plan === 'free' ? 'Gratis' : userPlan.plan}</span>
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-4 py-4">
          {plans.map((plan) => (
            <Card
              key={plan.id}
              className={`relative transition-all ${
                plan.highlighted ? 'border-primary shadow-lg ring-2 ring-primary/20' : 'border-border'
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <span className="bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-semibold shadow-md">
                    Populär
                  </span>
                </div>
              )}
              
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                {plan.subtitle && (
                  <CardDescription className="text-sm">{plan.subtitle}</CardDescription>
                )}
                <div className="mt-2">
                  <span className="text-3xl font-bold">{plan.price} kr</span>
                  <span className="text-sm text-muted-foreground"> /mån</span>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <ul className="space-y-2.5">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm text-muted-foreground leading-snug">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => plan.isPaid && handleSubscribe(plan.id as 'standard')}
                  disabled={isLoading || userPlan?.plan === plan.id || !plan.isPaid}
                  className="w-full"
                  variant={plan.highlighted ? 'default' : 'outline'}
                  size="lg"
                >
                  {userPlan?.plan === plan.id ? (
                    'Aktiv plan'
                  ) : !plan.isPaid ? (
                    plan.cta
                  ) : isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Laddar...
                    </>
                  ) : (
                    plan.cta
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Enterprise CTA */}
        <div className="mt-6 p-6 rounded-lg border border-border bg-gradient-to-br from-muted/50 to-muted/20 backdrop-blur">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-center md:text-left">
              <h3 className="text-lg font-semibold mb-1">Enterprise</h3>
              <p className="text-sm text-muted-foreground mb-2">För företag & organisationer</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Allt i Standard</li>
                <li>• Team-dashboard</li>
                <li>• Roller & delade projekt</li>
                <li>• Anpassade AI-funktioner</li>
                <li>• Prioriterad support</li>
                <li>• Dedikerad kontaktperson</li>
              </ul>
            </div>
            <div className="flex flex-col items-center gap-2">
              <span className="text-sm font-medium whitespace-nowrap">Pris på förfrågan</span>
              <Button 
                variant="outline" 
                size="lg"
                onClick={() => window.location.href = 'mailto:enterprise@tivly.se?subject=Enterprise%20Plan%20Förfrågan'}
                className="whitespace-nowrap"
              >
                Kontakta oss
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
