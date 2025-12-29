import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Check, X, Loader2, Building2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";

const BACKEND_URL = 'https://api.tivly.se';

interface InvoiceAISuggestionProps {
  companyName: string;
  onAccept: (suggestion: AISuggestion) => void;
  onDecline: () => void;
}

export interface AISuggestion {
  monthlyAmount: number;
  oneTimeAmount?: number;
  pricingTier: string;
  reasoning: string;
  companyInfo?: string;
  valuation?: string;
}

type Stage = 'analyzing' | 'suggesting' | 'done' | 'error';

export function InvoiceAISuggestion({
  companyName,
  onAccept,
  onDecline,
}: InvoiceAISuggestionProps) {
  const [stage, setStage] = useState<Stage>('analyzing');
  const [suggestion, setSuggestion] = useState<AISuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    analyzePricing();
  }, [companyName]);

  const analyzePricing = async () => {
    setStage('analyzing');
    setError(null);
    
    try {
      // Tivly backend expects the app user JWT stored by apiClient
      const token = apiClient.getAuthToken();
      const isJwt = !!token && token.split('.').length === 3;
      console.log('[InvoiceAISuggestion] auth', { hasToken: !!token, isJwt });

      if (!token) {
        setError('Du behöver vara inloggad för att få AI-förslag');
        setStage('error');
        return;
      }

      const prompt = `Du är en prisrådgivare för Tivly Enterprise. Analysera företagsnamn och föreslå prissättning.

VIKTIGT: Föreslå ALDRIG under 2 000 kr/mån.

PRISSÄTTNING:
- Entry (1-5 användare): 2 000 kr/mån - För små team, startups
- Growth (6-10 användare): 3 900 kr/mån - Växande företag
- Core (11-20 användare): 6 900 kr/mån - Medelstora företag
- Scale (20+ användare): 14 900 kr/mån - Stora organisationer

Svara ENDAST med JSON (ingen markdown):
{
  "suggestedAmount": <nummer>,
  "pricingTier": "<Entry|Growth|Core|Scale>",
  "reasoning": "<kort förklaring på svenska, max 2 meningar>",
  "companyInfo": "<kort info om företaget om känt, annars null>",
  "approxValuation": "<ca värdering, t.ex. '500 MSEK' eller null>"
}

Analysera och föreslå prissättning för: ${companyName}`;

      const response = await fetch(`${BACKEND_URL}/ai/gemini`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt,
          model: 'gemini-2.5-flash-lite',
          costUsd: 0.0003,
        }),
      });

      if (!response.ok) {
        console.error('[InvoiceAISuggestion] /ai/gemini failed', { status: response.status });
        if (response.status === 401) {
          setError('Inloggningen gick inte att verifiera (401). Logga in igen.');
          setStage('error');
          return;
        }
        throw new Error(`AI request failed (${response.status})`);
      }

      const data = await response.json();
      const content = data.text || data.response;
      
      if (content) {
        const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
        const parsed = JSON.parse(cleanContent);
        
        const suggestedMonthly = Math.max(2000, Number(parsed.suggestedAmount) || 2000);

        setSuggestion({
          monthlyAmount: suggestedMonthly,
          oneTimeAmount: parsed.oneTimeAmount,
          pricingTier: parsed.pricingTier || 'Entry',
          reasoning: parsed.reasoning || `Föreslår ${parsed.pricingTier}-nivå för ${companyName}.`,
          companyInfo: parsed.companyInfo,
          valuation: parsed.approxValuation || undefined,
        });
        setStage('suggesting');
      } else {
        throw new Error('No content in response');
      }
    } catch (err: any) {
      console.error('AI pricing analysis failed:', err);
      setError('Kunde inte analysera företaget');
      // Fallback suggestion
      setSuggestion({
        monthlyAmount: 2000,
        pricingTier: 'Entry',
        reasoning: `Föreslår Entry-nivå (2 000 kr/mån) för ${companyName}.`,
      });
      setStage('suggesting');
    }
  };

  const handleAccept = () => {
    if (suggestion) {
      setStage('done');
      onAccept(suggestion);
    }
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stage}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2 }}
        className="rounded-xl border bg-gradient-to-br from-card to-card/80 overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">AI-prisförslag</p>
            <p className="text-[10px] text-muted-foreground">Baserat på företagsanalys</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {stage === 'analyzing' && (
            <div className="flex flex-col items-center py-6 space-y-3">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
                <div className="relative p-3 rounded-full bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">Analyserar {companyName}...</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Föreslår prissättning</span>
                </div>
              </div>
            </div>
          )}

          {stage === 'suggesting' && suggestion && (
            <div className="space-y-4">
              {/* Company insight */}
              {(suggestion.companyInfo || suggestion.valuation) && (
                <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2 space-y-1">
                  {suggestion.companyInfo && <div>{suggestion.companyInfo}</div>}
                  {suggestion.valuation && (
                    <div>
                      Värdering (ca): <span className="font-medium text-foreground">{suggestion.valuation}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Price suggestion */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
                <div className="p-2 rounded-full bg-primary/10">
                  <TrendingUp className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-bold">
                      {suggestion.monthlyAmount.toLocaleString('sv-SE')}
                    </span>
                    <span className="text-sm text-muted-foreground">kr/mån</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {suggestion.pricingTier}-nivå
                    {suggestion.oneTimeAmount && suggestion.oneTimeAmount > 0 && (
                      <span> + {suggestion.oneTimeAmount.toLocaleString('sv-SE')} kr engång</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Reasoning */}
              <p className="text-sm text-muted-foreground leading-relaxed">
                {suggestion.reasoning}
              </p>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleAccept}
                  size="sm"
                  className="flex-1 gap-1.5"
                >
                  <Check className="h-3.5 w-3.5" />
                  Acceptera
                </Button>
                <Button
                  onClick={onDecline}
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5"
                >
                  <X className="h-3.5 w-3.5" />
                  Manuellt
                </Button>
              </div>
            </div>
          )}

          {stage === 'error' && (
            <div className="py-4 text-center">
              <p className="text-sm text-destructive mb-3">{error}</p>
              <Button onClick={analyzePricing} variant="outline" size="sm">
                Försök igen
              </Button>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
