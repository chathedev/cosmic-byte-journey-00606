import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BACKEND_URL = 'https://api.tivly.se';

// Default cost estimates per model (USD) - used when costUsd is not provided
const MODEL_COSTS: Record<string, number> = {
  'gemini-2.5-flash': 0.001,
  'gemini-2.5-flash-lite': 0.0005,
  'gemini-2.5-pro': 0.005,
  'gemini-1.5-flash': 0.001,
  'gemini-1.5-pro': 0.003,
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header from the request
    const authHeader = req.headers.get('authorization');
    
    if (!authHeader) {
      console.error('[ai-gemini] No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const model = body.model || 'gemini-2.5-flash';
    
    // Use provided costUsd or fallback to model default
    const costUsd = body.costUsd ?? MODEL_COSTS[model] ?? 0.001;
    
    console.log('[ai-gemini] Proxying request to backend:', { 
      model, 
      promptLength: body.prompt?.length,
      costUsd,
    });

    // Forward the request to api.tivly.se with cost tracking
    const response = await fetch(`${BACKEND_URL}/ai/gemini`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify({
        ...body,
        model,
        costUsd, // Always include cost for tracking
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[ai-gemini] Backend error:', response.status, data);
      return new Response(
        JSON.stringify(data),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log recorded cost for debugging
    if (data.recordedCostUsd) {
      console.log(`[ai-gemini] Cost recorded: $${data.recordedCostUsd} for model ${model}`);
    }

    console.log('[ai-gemini] Success, model:', data.model);
    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Internal server error';
    console.error('[ai-gemini] Error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
