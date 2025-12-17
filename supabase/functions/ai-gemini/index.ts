import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPPORTED_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite", 
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro"
];

const DEFAULT_MODEL = "gemini-2.5-flash-lite";
const ENTERPRISE_MODEL = "gemini-2.5-flash";

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "api_key_missing", message: "Gemini API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get auth header and verify user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "unauthorized", message: "Authorization header required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client to check user
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "unauthorized", message: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body = await req.json();
    const { prompt, model: requestedModel, temperature, maxOutputTokens, isEnterprise } = body;

    if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
      return new Response(
        JSON.stringify({ error: "prompt_required", message: "A non-empty prompt is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine model: use requested model, or enterprise default, or regular default
    let model = requestedModel;
    if (!model) {
      model = isEnterprise ? ENTERPRISE_MODEL : DEFAULT_MODEL;
    }

    // Validate model
    if (!SUPPORTED_MODELS.includes(model)) {
      return new Response(
        JSON.stringify({ 
          error: "invalid_model", 
          message: `Model must be one of: ${SUPPORTED_MODELS.join(", ")}` 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate temperature
    const temp = temperature !== undefined ? Number(temperature) : 0.7;
    if (isNaN(temp) || temp < 0 || temp > 1) {
      return new Response(
        JSON.stringify({ error: "invalid_temperature", message: "Temperature must be between 0 and 1" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate maxOutputTokens
    const maxTokens = maxOutputTokens !== undefined ? Number(maxOutputTokens) : 8192;
    if (isNaN(maxTokens) || maxTokens < 1 || maxTokens > 65536) {
      return new Response(
        JSON.stringify({ error: "invalid_max_tokens", message: "maxOutputTokens must be between 1 and 65536" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`AI Gemini request - User: ${user.id}, Model: ${model}, Enterprise: ${isEnterprise}, Prompt length: ${prompt.length}`);

    // Call Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: temp,
          maxOutputTokens: maxTokens,
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error(`Gemini API error: ${geminiResponse.status} - ${errorText}`);
      
      let errorMessage = "Gemini API request failed";
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }

      return new Response(
        JSON.stringify({ 
          error: "gemini_error", 
          message: errorMessage,
          status: geminiResponse.status 
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiData = await geminiResponse.json();
    
    // Extract text from response for convenience
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

    console.log(`AI Gemini success - Model: ${model}, Response length: ${text.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        model,
        text,
        response: geminiData,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("AI Gemini function error:", error);
    return new Response(
      JSON.stringify({ 
        error: "internal_error", 
        message: error instanceof Error ? error.message : "Unknown error occurred" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
