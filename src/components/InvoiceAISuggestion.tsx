import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Check, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface InvoiceAISuggestionProps {
  companyName: string;
  monthlyAmount: number;
  oneTimeAmount?: number;
  isFirstInvoice: boolean;
  onAccept: () => void;
  onAdjust?: (suggestedAmount: number) => void;
}

interface AIResponse {
  suggestion: string;
  isValid: boolean;
  suggestedAmount?: number;
  pricingTier?: string;
}

export function InvoiceAISuggestion({
  companyName,
  monthlyAmount,
  oneTimeAmount,
  isFirstInvoice,
  onAccept,
  onAdjust,
}: InvoiceAISuggestionProps) {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<AIResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isFirstInvoice && monthlyAmount > 0) {
      checkPricing();
    }
  }, [isFirstInvoice, monthlyAmount]);

  const checkPricing = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke('validate-enterprise-pricing', {
        body: {
          companyName,
          monthlyAmount,
          oneTimeAmount: oneTimeAmount || 0,
        },
      });

      if (fnError) throw fnError;
      setResponse(data);
    } catch (err: any) {
      console.error('AI pricing check failed:', err);
      setError('Kunde inte validera prissättning');
      // Fallback to local validation
      setResponse(validateLocally(monthlyAmount));
    } finally {
      setLoading(false);
    }
  };

  const validateLocally = (amount: number): AIResponse => {
    const minPrice = 2000;
    
    if (amount < minPrice) {
      return {
        suggestion: `Priset ${amount.toLocaleString('sv-SE')} kr/mån är under minimum (2 000 kr). Rekommenderar minst 2 000 kr/mån för Enterprise.`,
        isValid: false,
        suggestedAmount: minPrice,
        pricingTier: 'Entry',
      };
    }
    
    let tier = 'Entry';
    if (amount >= 14900) tier = 'Scale';
    else if (amount >= 6900) tier = 'Core';
    else if (amount >= 3900) tier = 'Growth';
    
    return {
      suggestion: `${amount.toLocaleString('sv-SE')} kr/mån (${tier}-nivå) ser bra ut för ${companyName}.`,
      isValid: true,
      pricingTier: tier,
    };
  };

  if (!isFirstInvoice || monthlyAmount <= 0) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="rounded-lg border bg-card p-4 space-y-3"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>AI-validering</span>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Kontrollerar prissättning...</span>
          </div>
        ) : error ? (
          <div className="text-sm text-muted-foreground">{error}</div>
        ) : response ? (
          <div className="space-y-3">
            <div className={`flex items-start gap-2 text-sm ${response.isValid ? 'text-foreground' : 'text-amber-600 dark:text-amber-400'}`}>
              {response.isValid ? (
                <Check className="h-4 w-4 mt-0.5 text-green-600 dark:text-green-400 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              )}
              <span>{response.suggestion}</span>
            </div>

            {response.pricingTier && (
              <div className="text-xs text-muted-foreground">
                Prisnivå: <span className="font-medium">{response.pricingTier}</span>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              {response.isValid ? (
                <Button size="sm" onClick={onAccept} className="text-xs">
                  <Check className="h-3 w-3 mr-1" />
                  Ser bra ut, skapa
                </Button>
              ) : (
                <>
                  {response.suggestedAmount && onAdjust && (
                    <Button
                      size="sm"
                      onClick={() => onAdjust(response.suggestedAmount!)}
                      className="text-xs"
                    >
                      Justera till {response.suggestedAmount.toLocaleString('sv-SE')} kr
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={onAccept} className="text-xs">
                    Skapa ändå
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : null}
      </motion.div>
    </AnimatePresence>
  );
}
