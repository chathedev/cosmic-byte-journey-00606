import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transcript } = await req.json();

    if (!transcript || transcript.trim().length < 10) {
      return new Response(
        JSON.stringify({ title: `Möte ${new Date().toLocaleDateString('sv-SE')}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      // Fallback to simple title
      const words = transcript.trim().split(/\s+/).slice(0, 8).join(' ');
      const fallbackTitle = words.length > 50 ? words.substring(0, 47) + '...' : words;
      return new Response(
        JSON.stringify({ title: fallbackTitle }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use first 500 words for context
    const context = transcript.split(/\s+/).slice(0, 500).join(' ');

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Du är en AI som skapar korta, beskrivande titlar för mötesprotokoll på svenska. Titeln ska vara 3-8 ord lång och fånga mötets huvudämne. Svara ENDAST med titeln, inget annat.\n\nSkapa en kort, beskrivande titel för detta möte baserat på transkriptionen:\n\n${context}`
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 50,
          }
        }),
      }
    );

    if (!response.ok) {
      // Fallback
      const words = transcript.trim().split(/\s+/).slice(0, 8).join(' ');
      const fallbackTitle = words.length > 50 ? words.substring(0, 47) + '...' : words;
      return new Response(
        JSON.stringify({ title: fallbackTitle }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    let title = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    
    // Clean up the title
    title = title.replace(/^["']|["']$/g, ''); // Remove quotes
    title = title.replace(/^Titel:\s*/i, ''); // Remove "Titel:" prefix
    title = title.trim();

    // Ensure reasonable length
    if (title.length > 100) {
      title = title.substring(0, 97) + '...';
    }

    // Fallback if empty
    if (!title) {
      const words = transcript.trim().split(/\s+/).slice(0, 8).join(' ');
      title = words.length > 50 ? words.substring(0, 47) + '...' : words;
    }

    return new Response(
      JSON.stringify({ title }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    // Fallback on error
    return new Response(
      JSON.stringify({ title: `Möte ${new Date().toLocaleDateString('sv-SE')}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
