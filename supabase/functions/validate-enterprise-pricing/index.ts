import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Enterprise pricing tiers (internal)
const PRICING_TIERS = {
  entry: { min: 1, max: 5, price: 2000, name: 'Entry' },
  growth: { min: 6, max: 10, price: 3900, name: 'Growth' },
  core: { min: 11, max: 20, price: 6900, name: 'Core' },
  scale: { min: 21, max: Infinity, price: 14900, name: 'Scale' },
};

const MIN_PRICE = 2000;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { companyName, monthlyAmount, oneTimeAmount } = await req.json();

    console.log('[validate-enterprise-pricing] Checking:', { companyName, monthlyAmount, oneTimeAmount });

    // Quick local validation first
    let isValid = monthlyAmount >= MIN_PRICE;
    let suggestedAmount: number | undefined;
    let pricingTier = 'Entry';

    // Determine tier based on amount
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

    let suggestion: string;

    if (!isValid) {
      suggestion = `Priset ${monthlyAmount.toLocaleString('sv-SE')} kr/mån är under minimum (2 000 kr). Enterprise-kunder ska aldrig betala mindre än 2 000 kr/mån. Rekommenderar ${MIN_PRICE.toLocaleString('sv-SE')} kr/mån.`;
    } else {
      // Try to get a more detailed suggestion from AI
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      
      if (LOVABLE_API_KEY) {
        try {
          const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              messages: [
                {
                  role: 'system',
                  content: `Du är en prisvalideringsassistent för Tivly Enterprise. 
                  
Prissättning:
- Entry (1-5 användare): 2 000 kr/mån
- Growth (6-10 användare): 3 900 kr/mån  
- Core (11-20 användare): 6 900 kr/mån
- Scale (20+ användare): Från 14 900 kr/mån

VIKTIGT: Gå aldrig under 2 000 kr/mån för Enterprise.

Svara kort och koncist på svenska (max 1-2 meningar). Bekräfta att priset ser bra ut och vilken nivå det passar.`
                },
                {
                  role: 'user',
                  content: `Företag: ${companyName}
Månadspris: ${monthlyAmount} kr
${oneTimeAmount ? `Engångsbelopp: ${oneTimeAmount} kr` : ''}

Är detta pris rimligt? Vilken prisnivå passar det?`
                }
              ],
              max_tokens: 150,
            }),
          });

          if (aiResponse.ok) {
            const data = await aiResponse.json();
            const aiSuggestion = data.choices?.[0]?.message?.content;
            if (aiSuggestion) {
              suggestion = aiSuggestion;
            } else {
              suggestion = `${monthlyAmount.toLocaleString('sv-SE')} kr/mån (${pricingTier}-nivå) ser bra ut för ${companyName}.`;
            }
          } else {
            console.warn('[validate-enterprise-pricing] AI request failed, using fallback');
            suggestion = `${monthlyAmount.toLocaleString('sv-SE')} kr/mån (${pricingTier}-nivå) ser bra ut för ${companyName}.`;
          }
        } catch (aiError) {
          console.error('[validate-enterprise-pricing] AI error:', aiError);
          suggestion = `${monthlyAmount.toLocaleString('sv-SE')} kr/mån (${pricingTier}-nivå) ser bra ut för ${companyName}.`;
        }
      } else {
        suggestion = `${monthlyAmount.toLocaleString('sv-SE')} kr/mån (${pricingTier}-nivå) ser bra ut för ${companyName}.`;
      }
    }

    const result = {
      suggestion,
      isValid,
      suggestedAmount,
      pricingTier,
    };

    console.log('[validate-enterprise-pricing] Result:', result);

    return new Response(JSON.stringify(result), {
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
