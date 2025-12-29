import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BACKEND_URL = 'https://api.tivly.se';

// Enterprise pricing tiers
const PRICING_TIERS = {
  entry: { min: 1, max: 5, price: 2000, name: 'Entry' },
  growth: { min: 6, max: 10, price: 3900, name: 'Growth' },
  core: { min: 11, max: 20, price: 6900, name: 'Core' },
  scale: { min: 21, max: Infinity, price: 14900, name: 'Scale' },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    const { companyName, monthlyAmount, oneTimeAmount, analyzeCompany } = await req.json();

    console.log('[validate-enterprise-pricing] Request:', { companyName, monthlyAmount, analyzeCompany });

    // If analyzing company, use AI to suggest pricing
    if (analyzeCompany && companyName) {
      try {
        const prompt = `Du är en prisrådgivare för Tivly Enterprise. Analysera företagsnamn och föreslå prissättning.

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
  "companyInfo": "<kort info om företaget om känt, annars null>"
}

Analysera och föreslå prissättning för: ${companyName}`;

        const aiResponse = await fetch(`${BACKEND_URL}/ai/gemini`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authHeader ? { 'Authorization': authHeader } : {}),
          },
          body: JSON.stringify({
            prompt,
            model: 'gemini-2.5-flash-lite',
            costUsd: 0.0003,
          }),
        });

        if (aiResponse.ok) {
          const data = await aiResponse.json();
          const content = data.text || data.response;
          
          if (content) {
            try {
              // Clean JSON response
              const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
              const parsed = JSON.parse(cleanContent);
              
              console.log('[validate-enterprise-pricing] AI response:', parsed);
              
              return new Response(JSON.stringify({
                suggestedAmount: parsed.suggestedAmount || 2000,
                pricingTier: parsed.pricingTier || 'Entry',
                suggestion: parsed.reasoning || `Föreslår ${parsed.pricingTier}-nivå för ${companyName}.`,
                companyInfo: parsed.companyInfo || null,
              }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            } catch (parseErr) {
              console.error('[validate-enterprise-pricing] JSON parse error:', parseErr, content);
            }
          }
        } else {
          console.error('[validate-enterprise-pricing] AI request failed:', aiResponse.status);
        }
      } catch (aiError) {
        console.error('[validate-enterprise-pricing] AI error:', aiError);
      }

      // Fallback
      return new Response(JSON.stringify({
        suggestedAmount: 2000,
        pricingTier: 'Entry',
        suggestion: `Föreslår Entry-nivå (2 000 kr/mån) för ${companyName}.`,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate existing amount
    const MIN_PRICE = 2000;
    let isValid = monthlyAmount >= MIN_PRICE;
    let suggestedAmount: number | undefined;
    let pricingTier = 'Entry';

    if (monthlyAmount >= PRICING_TIERS.scale.price) {
      pricingTier = 'Scale';
    } else if (monthlyAmount >= PRICING_TIERS.core.price) {
      pricingTier = 'Core';
    } else if (monthlyAmount >= PRICING_TIERS.growth.price) {
      pricingTier = 'Growth';
    } else if (monthlyAmount >= MIN_PRICE) {
      pricingTier = 'Entry';
    } else {
      suggestedAmount = MIN_PRICE;
    }

    const suggestion = isValid
      ? `${monthlyAmount.toLocaleString('sv-SE')} kr/mån (${pricingTier}-nivå) ser bra ut för ${companyName}.`
      : `Priset ${monthlyAmount.toLocaleString('sv-SE')} kr/mån är under minimum (2 000 kr). Rekommenderar ${MIN_PRICE.toLocaleString('sv-SE')} kr/mån.`;

    return new Response(JSON.stringify({
      suggestion,
      isValid,
      suggestedAmount,
      pricingTier,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Internal server error';
    console.error('[validate-enterprise-pricing] Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});