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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "Du är en AI som skapar korta, beskrivande titlar för mötesprotokoll på svenska. Titeln ska vara 3-8 ord lång och fånga mötets huvudämne. Svara ENDAST med titeln, inget annat."
          },
          {
            role: "user",
            content: `Skapa en kort, beskrivande titel för detta möte baserat på transkriptionen:\n\n${context}`
          }
        ],
      }),
    });

    if (!response.ok) {
      console.error("AI Gateway error:", response.status, await response.text());
      // Fallback
      const words = transcript.trim().split(/\s+/).slice(0, 8).join(' ');
      const fallbackTitle = words.length > 50 ? words.substring(0, 47) + '...' : words;
      return new Response(
        JSON.stringify({ title: fallbackTitle }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    let title = data.choices?.[0]?.message?.content?.trim() || '';
    
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

    console.log('✅ Generated title:', title);

    return new Response(
      JSON.stringify({ title }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating title:", error);
    // Fallback on error
    return new Response(
      JSON.stringify({ title: `Möte ${new Date().toLocaleDateString('sv-SE')}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
