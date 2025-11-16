import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transcript, meetingName, agenda } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const wordCount = transcript.trim().split(/\s+/).length;
    
    const agendaSection = agenda ? "\n\nMötesagenda:\n" + agenda + "\n" : '';
    const agendaNote = agenda ? 'OBS: Använd mötesagendan ovan för att strukturera protokollet och säkerställ att alla agendapunkter täcks.' : '';
    const shortNote = wordCount < 50 ? 'OBS: Utskriften är mycket kort. Inkludera ett meddelande i sammanfattningen om att mötet innehöll begränsad information.' : '';

    const promptContent = `Du är en professionell mötessekreterare. Din uppgift är att ANALYSERA och SYNTETISERA mötesutskriften nedan till ett DETALJERAT protokoll som täcker det viktigaste från mötet.

🚫 ABSOLUT FÖRBJUDET:
- Kopiera NÅGON mening direkt från utskriften
- Klistra in fraser ordagrant från transkriptionen
- Upprepa meningar eller stycken från originaltexten
- Lista punkter som är direkta citat

✅ DU MÅSTE:
- OMFORMULERA allt innehåll med egna ord
- SYNTETISERA information från flera delar av mötet
- SKRIVA professionella, välformulerade meningar
- SAMMANFATTA och PARAFRASERA diskussionerna
- INKLUDERA VIKTIGA DETALJER från mötet

Möte: ${meetingName || 'Namnlöst möte'}
Längd: ${wordCount} ord${agendaSection}

Utskrift:
${transcript}

Skapa ett professionellt och DETALJERAT protokoll:

1. SAMMANFATTNING (4-6 meningar):
   - OMSKRIVNING OBLIGATORISK: Varje mening måste vara omformulerad med egna ord
   - Beskriv mötets SYFTE, HUVUDSAKLIGA DISKUSSIONER och RESULTAT
   - Använd professionell sekreterar-ton
   - Sammanfatta HELHETEN med viktiga detaljer
   
   EXEMPEL PÅ FEL: "Vi ska idag diskutera tre viktiga punkter" (direkt citat)
   EXEMPEL PÅ RÄTT: "Mötet behandlade tre centrala frågeställningar kring projektets utveckling och budget, där särskild vikt lades vid resursallokering"

2. HUVUDPUNKTER (8-12 punkter):
   - INGEN PUNKT får vara ett direkt citat från transkriptionen
   - SYNTETISERA diskussioner till omfattande, professionella sammanfattningar
   - Varje punkt: 1-2 fullständiga, välformulerade meningar
   - Fokusera på SUBSTANS: vad diskuterades, vilka insikter framkom, vad beslutades
   - Täck ALLA VIKTIGA DISKUSSIONER från mötet
   
   EXEMPEL PÅ FEL: "För det första behöver vi gå igenom projektets nuvarande status" (direkt citat)
   EXEMPEL PÅ RÄTT: "Projektets nuläge genomgicks med fokus på leveranser och eventuella flaskhalsar. Teamet identifierade tre kritiska områden som kräver omedelbara åtgärder."

3. BESLUT:
   - Lista ALLA konkreta beslut, omskrivna professionellt
   - Inkludera kontext bakom varje beslut
   - Varje beslut: 1-2 meningar
   - Om inga beslut: "Inga formella beslut fattades under mötet"

4. ÅTGÄRDSPUNKTER:
   - Skapa specifika uppgifter baserat på diskussionen
   - Inkludera: titel, beskrivning, ansvarig, deadline, prioritet
   - Prioritet: critical, high, medium, low

5. NÄSTA MÖTE - FÖRSLAG (4-6 punkter):
   - Konkreta uppföljningsämnen
   - Baserat på olösta frågor och beslut

${agendaNote}
${shortNote}

🔴 KVALITETSKONTROLL - INNAN DU SVARAR:
1. Läs igenom din sammanfattning - innehåller den NÅGON mening från transkriptionen? → SKRIV OM
2. Läs igenom huvudpunkterna - är NÅGON punkt ett direkt citat? → OMFORMULERA
3. Har du PARAFRASERAT och SYNTETISERAT informationen? → Om nej, gör om

Svara i JSON-format på samma språk som transkriptionen.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + LOVABLE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "Du är en professionell mötessekreterare som skapar välformulerade och strukturerade mötesprotokoll. Du analyserar mötestranskriberingar och syntetiserar informationen till tydliga, koncisa och professionella sammanfattningar. Svara ALLTID på samma språk som transkriptionen är skriven på (svenska eller engelska)."
          },
          {
            role: "user",
            content: promptContent
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_protocol",
              description: "Skapa ett mötesprotokoll",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  summary: { type: "string" },
                  mainPoints: {
                    type: "array",
                    items: { type: "string" }
                  },
                  decisions: {
                    type: "array",
                    items: { type: "string" }
                  },
                  actionItems: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        description: { type: "string" },
                        owner: { type: "string" },
                        deadline: { type: "string" },
                        priority: { type: "string", enum: ["critical", "high", "medium", "low"] }
                      },
                      required: ["title", "priority"],
                      additionalProperties: false
                    }
                  },
                  nextMeetingSuggestions: {
                    type: "array",
                    items: { type: "string" }
                  }
                },
                required: ["title", "summary", "mainPoints", "decisions", "actionItems", "nextMeetingSuggestions"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "create_protocol" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required, please add credits to your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI gateway error: " + response.status);
    }

    const result = await response.json();
    console.log("AI response:", JSON.stringify(result));

    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    const content = toolCall?.function?.arguments ? JSON.parse(toolCall.function.arguments) : null;

    if (!content) {
      throw new Error("Failed to parse AI response");
    }

    return new Response(
      JSON.stringify({
        title: content.title || meetingName || 'Mötesprotokoll',
        summary: content.summary || '',
        mainPoints: content.mainPoints || [],
        decisions: content.decisions || [],
        actionItems: content.actionItems || [],
        nextMeetingSuggestions: content.nextMeetingSuggestions || []
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in analyze-meeting function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
