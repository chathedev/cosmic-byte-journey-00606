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

    const promptContent = `Analysera följande mötesutskrift och skapa ett professionellt mötesprotokoll.

Möte: ${meetingName || 'Namnlöst möte'}
Längd: ${wordCount} ord${agendaSection}

Utskrift:
${transcript}

Skapa ett detaljerat och välskrivet protokoll med följande delar:

1. SAMMANFATTNING (3-5 meningar):
   - VIKTIGT: KOPIERA INTE texten från utskriften
   - Syntetisera och sammanfatta mötets övergripande syfte och resultat
   - Skriv med professionell ton och välformulerade meningar
   - Ge en överblick av vad som diskuterades och huvudsakliga slutsatser

2. HUVUDPUNKTER (6-10 punkter):
   - VIKTIGT: Skriv OM och SAMMANFATTA innehållet, kopiera inte ordagrant
   - Formulera varje punkt som en tydlig, fullständig mening
   - Fokusera på viktiga diskussioner, insikter och konkreta ämnen
   - Varje punkt ska innehålla substans och kontext
   - Använd professionellt språk och god struktur

3. BESLUT:
   - Lista konkreta beslut som fattades under mötet
   - Om inga explicita beslut fattades, markera detta tydligt

4. ÅTGÄRDSPUNKTER:
   - Skapa specifika, handlingsbara uppgifter från diskussionen
   - För varje uppgift, inkludera titel, beskrivning, ansvarig, deadline och prioritet
   - Prioritet: critical (blockerar arbete), high (viktigt), medium (standard), low (önskvärt)
   - Deadline: Realistisk deadline baserat på prioritet

5. NÄSTA MÖTE - FÖRSLAG (3-5 punkter):
   - Föreslå konkreta ämnen baserat på olösta frågor
   - Inkludera uppföljning av beslut och åtgärdspunkter
   - Håll förslagen specifika och handlingsbara

${agendaNote}
${shortNote}

KRITISKT VIKTIGT:
- SAMMANFATTA och OMFORMULERA - kopiera ALDRIG text ordagrant från utskriften
- Använd professionell, välskriven svenska (eller engelska om utskriften är på engelska)
- Varje del ska kännas som den skrivits av en professionell sekreterare
- Skapa substans och värde i varje punkt

Svara i JSON-format (använd svenska språket om utskriften är på svenska).`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + LOVABLE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
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
