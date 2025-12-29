import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const { companyName, monthlyAmount, oneTimeAmount, analyzeCompany } = await req.json();

    console.log('[validate-enterprise-pricing] Request:', { companyName, monthlyAmount, analyzeCompany });

    // If analyzing company, use AI to suggest pricing
    if (analyzeCompany && companyName) {
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      
      if (!LOVABLE_API_KEY) {
        console.warn('[validate-enterprise-pricing] No LOVABLE_API_KEY, using fallback');
        return new Response(JSON.stringify({
          suggestedAmount: 2000,
          pricingTier: 'Entry',
          suggestion: `Föreslår Entry-nivå (2 000 kr/mån) för ${companyName}.`,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      try {
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash-lite',
            messages: [
              {
                role: 'system',
                content: `Du är en prisrådgivare för Tivly Enterprise. Analysera företagsnamn och föreslå prissättning.

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
}`
              },
              {
                role: 'user',
                content: `Analysera och föreslå prissättning för: ${companyName}`
              }
            ],
            max_tokens: 200,
            temperature: 0.3,
          }),
        });

        if (aiResponse.ok) {
          const data = await aiResponse.json();
          const content = data.choices?.[0]?.message?.content;
          
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