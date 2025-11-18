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
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
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

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: promptContent }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
            responseMimeType: "application/json"
          }
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      return new Response(
        JSON.stringify({
          error: "Kunde inte analysera mötet",
          details: errorText,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("Gemini API response received:", JSON.stringify(data).substring(0, 200));
    
    // Parse the JSON content from the Gemini response
    let result;
    try {
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      console.log("Raw AI content:", content.substring(0, 200));
      
      // Clean up markdown code blocks if present
      let cleanedContent = content.trim();
      if (cleanedContent.startsWith('```json')) {
        cleanedContent = cleanedContent.replace(/^```json\n/, '').replace(/\n```$/, '');
      } else if (cleanedContent.startsWith('```')) {
        cleanedContent = cleanedContent.replace(/^```\n/, '').replace(/\n```$/, '');
      }
      
      const parsed = JSON.parse(cleanedContent);
      
      // Support both English and Swedish JSON structures
      const protocol = parsed.protokoll || parsed.protocol || parsed;

      const title = protocol.title || protocol.titel || meetingName || 'Mötesprotokoll';
      const summary = protocol.summary || protocol.sammanfattning || protocol.sammandrag || '';
      
      // Normalize main points - ensure it's always an array of strings
      let mainPoints = protocol.mainPoints || protocol.huvudpunkter || protocol.punkter || [];
      if (!Array.isArray(mainPoints)) {
        mainPoints = [];
      }
      mainPoints = mainPoints.filter((p: any) => typeof p === 'string' && p.trim() !== '');
      
      // Normalize decisions - ensure it's always an array of strings
      let decisions = protocol.decisions || protocol.beslut || [];
      if (!Array.isArray(decisions)) {
        decisions = [];
      }
      decisions = decisions.filter((d: any) => typeof d === 'string' && d.trim() !== '');
      
      // Normalize action items
      const actionItemsRaw = protocol.actionItems || protocol.åtgärdspunkter || protocol.atgardsPunkter || [];
      const actionItems = Array.isArray(actionItemsRaw)
        ? actionItemsRaw.map((item: any) => {
            // Handle both object and string formats
            if (typeof item === 'string') {
              return {
                title: item,
                description: '',
                owner: '',
                deadline: '',
                priority: 'medium' as const,
              };
            }
            return {
              title: item.title || item.titel || '',
              description: item.description || item.beskrivning || '',
              owner: item.owner || item.ansvarig || '',
              deadline: item.deadline || item.sistaDatum || item.deadlineDatum || '',
              priority: (item.priority || item.prioritet || 'medium') as 'critical' | 'high' | 'medium' | 'low',
            };
          }).filter((item: any) => item.title.trim() !== '')
        : [];

      // Normalize next meeting suggestions
      let nextMeetingSuggestions = protocol.nextMeetingSuggestions || protocol.nästaMöteFörslag || protocol.nextMeetingTopics || [];
      if (!Array.isArray(nextMeetingSuggestions)) {
        nextMeetingSuggestions = [];
      }
      nextMeetingSuggestions = nextMeetingSuggestions.filter((s: any) => typeof s === 'string' && s.trim() !== '');

      console.log("Parsed & normalized AI response:", {
        hasTitle: !!title,
        hasSummary: !!summary,
        summaryLength: summary.length,
        mainPointsCount: mainPoints.length,
        decisionsCount: decisions.length,
        actionItemsCount: actionItems.length,
        nextMeetingSuggestionsCount: nextMeetingSuggestions.length,
      });
      
      // Validate that we have actual content
      if (!summary || summary.trim() === '') {
        console.error("AI returned empty summary after normalization");
        return new Response(
          JSON.stringify({ 
            error: "AI genererade inget innehåll. Försök igen eller använd en längre transkription." 
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (mainPoints.length === 0) {
        console.error("AI returned no main points after normalization");
        return new Response(
          JSON.stringify({ 
            error: "AI kunde inte generera huvudpunkter. Försök igen." 
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      result = {
        title,
        summary,
        mainPoints,
        decisions,
        actionItems,
        nextMeetingSuggestions,
      };
    } catch (parseError) {
      console.error("Parse/normalization error:", parseError);
      return new Response(
        JSON.stringify({ error: "Kunde inte tolka AI-svaret. Försök igen." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Returning result with summary length:", result.summary.length);
    
    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
