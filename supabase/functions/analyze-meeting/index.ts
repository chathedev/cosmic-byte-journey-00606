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
    const authHeader = req.headers.get('authorization') || '';
    const { transcript, meetingName, agenda, hasSpeakerAttribution, speakers, isEnterprise, userPlan } = await req.json();
    
    console.log('📥 analyze-meeting request:', {
      hasTranscript: !!transcript,
      transcriptLength: transcript?.length || 0,
      transcriptWords: transcript?.trim().split(/\s+/).length || 0,
      meetingName,
      hasAgenda: !!agenda,
      hasSpeakerAttribution: !!hasSpeakerAttribution,
      speakersCount: speakers?.length || 0
    });
    
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    
    if (!GEMINI_API_KEY) {
      console.error('❌ GEMINI_API_KEY not configured');
      throw new Error("GEMINI_API_KEY is not configured");
    }

    if (!transcript || transcript.trim().length < 10) {
      console.error('❌ Transcript too short or missing:', transcript?.length || 0);
      return new Response(
        JSON.stringify({
          error: "Transkriptionen är för kort eller saknas",
          details: "Minst 10 tecken krävs för att generera ett protokoll"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const wordCount = transcript.trim().split(/\s+/).length;
    console.log('📊 Processing transcript:', { wordCount, chars: transcript.length });
    
    // Determine protocol length based on transcript length AND user tier
    // Enterprise gets richer, more detailed protocols
    const isEnterpriseTier = isEnterprise === true || userPlan === 'enterprise';
    const tierMultiplier = isEnterpriseTier ? 1.5 : 1; // Enterprise gets ~50% more detail
    
    let summaryLength, mainPointsCount, actionItemsCount, nextMeetingCount;
    
    if (wordCount < 50) {
      summaryLength = "1-2 meningar";
      mainPointsCount = "1-2";
      actionItemsCount = "0-1";
      nextMeetingCount = "0-1";
    } else if (wordCount < 200) {
      summaryLength = "2-4 meningar";
      mainPointsCount = "2-4";
      actionItemsCount = "0-2";
      nextMeetingCount = "0-2";
    } else if (wordCount < 500) {
      summaryLength = "3-5 meningar";
      mainPointsCount = "3-6";
      actionItemsCount = "0-4";
      nextMeetingCount = "1-3";
    } else if (wordCount < 1000) {
      summaryLength = "4-8 meningar";
      mainPointsCount = "4-8";
      actionItemsCount = "0-6";
      nextMeetingCount = "2-4";
    } else if (wordCount < 2000) {
      summaryLength = "6-10 meningar";
      mainPointsCount = "6-12";
      actionItemsCount = "0-8";
      nextMeetingCount = "2-5";
    } else {
      summaryLength = "8-14 meningar";
      mainPointsCount = "8-16";
      actionItemsCount = "0-12";
      nextMeetingCount = "3-6";
    }
    
    const agendaSection = agenda ? "\n\nMötesagenda:\n" + agenda + "\n" : '';
    const agendaNote = agenda ? 'OBS: Använd mötesagendan ovan för att strukturera protokollet och säkerställ att alla agendapunkter täcks.' : '';
    const shortNote = wordCount < 50 ? 'OBS: Utskriften är mycket kort. Inkludera ett meddelande i sammanfattningen om att mötet innehöll begränsad information.' : '';
    
    // Speaker attribution instructions - ALWAYS include names when available
    let speakerNote = '';
    if (hasSpeakerAttribution && speakers && speakers.length > 0) {
      const speakerList = speakers.map((s: { name: string; segments: number }) => s.name).join(', ');
      speakerNote = `
🎤 TALARINFORMATION - ANVÄND NAMN AKTIVT:
Identifierade talare i mötet: ${speakerList}

DU MÅSTE referera till talare med namn i ALLA delar av protokollet:
- I sammanfattningen, nämn vem som ledde mötet, vem som presenterade vad, och viktiga bidrag (t.ex. "Mötet leddes av Charlie som presenterade kvartalsrapporten. Erik ansvarade för den tekniska genomgången.")
- I VARJE huvudpunkt, inkludera talarens namn och vad de sa/föreslog/beslutade (t.ex. "Erik presenterade tre alternativ för servermigrering och rekommenderade...")
- I åtgärdspunkter, sätt ALLTID talarens namn som "ansvarig" om de tog på sig uppgiften eller nämndes i samband med den
- I beslut, nämn VEM som föreslog beslutet, vem som stödde det, och vem som ansvarar för genomförande

NAMNANVÄNDNING - OBLIGATORISKT:
- Skriv naturligt med namn: "Charlie föreslog att...", "Erik och Lisa diskuterade...", "Enligt Maria bör..."
- VARJE huvudpunkt bör om möjligt nämna minst en person vid namn
- Om en specifik person var ansvarig för ett ämne, nämn dem ALLTID
- I åtgärdspunkter MÅSTE ansvarig-fältet innehålla namn om någon nämndes
- Om flera personer deltog i en diskussion, nämn de viktigaste bidragsgivarna
- Använd formuleringen "[Namn] ansvarar för..." eller "[Namn] ska leverera..." i huvudpunkter
`;
    }

    const promptContent = `Du är en protokollsekreterare. Du skriver STRIKT FAKTABASERADE protokoll.

═══ ABSOLUT GRUNDREGEL ═══
ENDAST information som UTTRYCKLIGEN SÄGS i transkriptet får inkluderas i protokollet.
- Inga antaganden, tolkningar, kompletteringar eller spekulationer.
- Om något INTE sades → det ska INTE finnas i protokollet.
- Om beslut, ansvar eller åtgärder INTE uttalades tydligt → skapa dem INTE.
- Om information saknas → utelämna den. Fyll ALDRIG i.
- Protokollets längd ska PROPORTIONELLT matcha transkriptets längd. Kort transkript = kort protokoll. Långt transkript = längre protokoll.
- Protokollet ska kunna användas som FORMELL DOKUMENTATION utan tillagd eller spekulativ information.

═══ FÖRBJUDET ═══
- HITTA INTE PÅ information som inte finns i transkriptet
- LÄGG INTE TILL kontext, bakgrund eller detaljer som inte nämndes
- SKAPA INTE beslut som inte explicit fattades
- SKAPA INTE åtgärdspunkter som ingen sa att de skulle göra
- TILLSKRIV INTE ansvar som inte uttalades
- UTÖKA INTE korta möten med utfyllnad — om mötet var 30 sekunder, skriv ett protokoll som reflekterar det
- ANVÄND INTE formuleringar som "lyfte fram", "betonade", "poängterade", "underströk", "diskuterade vikten av"
- ANVÄND INTE passiva konstruktioner: "det beslutades" → skriv istället vem som beslutade
- GISSA INTE deadlines — om inget datum nämndes, skriv ""

═══ SKRIVSTIL ═══
Formuleringar ska vara juridiskt hållbara, neutrala och sakliga.
Skriv formellt men koncist. Varje mening ska vara förankrad i vad som faktiskt sades.

SAMMANFATTNING:
- Sammanfatta EXAKT vad som sades, inget mer.
- Om mötet var kort och innehöll lite information, skriv en kort sammanfattning.
- ALDRIG längre än vad innehållet motiverar.

HUVUDPUNKTER:
- Varje punkt MÅSTE vara direkt kopplad till något som UTTALADES i transkriptet.
- Om bara 2 saker diskuterades → skriv 2 punkter, inte 8.
- Inkludera namn, organisationer, siffror och specifika detaljer BARA om de nämndes.

BESLUT:
- BARA beslut som EXPLICIT fattades med tydligt ja/godkännande.
- Om inga beslut fattades → returnera tom lista []. Det är helt korrekt.

ÅTGÄRDSPUNKTER:
- BARA åtgärder där någon UTTRYCKLIGEN sa att de ska göra något.
- "ansvarig": BARA om en person NAMNGIVITS som ansvarig. Annars "".
- "deadline": BARA om ett datum/tidsram UTTALADES. Annars "".
- "prioritet": Härledd från sammanhanget, men konservativt.
- Om inga åtgärder uttalades → returnera tom lista [].

NÄSTA MÖTE-FÖRSLAG:
- Koppla BARA till olösta frågor som FAKTISKT diskuterades.
- Om inget behöver följas upp → tom lista [].

═══ SKALNING ═══
Protokollets omfattning ska EXAKT matcha transkriptets innehåll:
- <50 ord: 1-2 meningar sammanfattning, 1-2 huvudpunkter, troligen inga beslut/åtgärder
- 50-200 ord: 2-4 meningar, 2-4 huvudpunkter
- 200-500 ord: 3-5 meningar, 3-6 huvudpunkter
- 500-1000 ord: 4-8 meningar, 4-8 huvudpunkter
- 1000+ ord: Skala proportionellt men ALDRIG mer substans än vad som sades

═══ KVALITETSKONTROLL ═══
Innan du svarar, kontrollera:
1. Finns VARJE påstående i protokollet ORDAGRANT eller tydligt uttryckt i transkriptet? Om inte → TA BORT det.
2. Har du LAGT TILL information som inte sades? Om ja → TA BORT det.
3. Är protokollet PROPORTIONELLT till transkriptets längd? Om protokollet är längre/mer detaljerat än vad transkriptet motiverar → KORTA NER.
4. Är beslut och åtgärder FAKTISKT uttalade i mötet? Om du är osäker → inkludera dem INTE.
5. Klarar VARJE formulering det juridiska testet: "Kan detta presenteras som formell dokumentation?"

Dagens datum: ${new Date().toISOString().split('T')[0]}
VIKTIGT: Alla datum i protokollet (inklusive deadlines) MÅSTE vara i framtiden relativt dagens datum. Använd ALDRIG år som redan passerat.

Möte: ${meetingName || 'Namnlöst möte'}
Längd: ${wordCount} ord${agendaSection}

Utskrift:
${transcript}

JSON-struktur (svara ENBART med detta):

{
  "protokoll": {
    "titel": "Kort, specifik titel baserad på vad som FAKTISKT diskuterades",
    "datum": "YYYY-MM-DD",
    "sammanfattning": "${summaryLength}. BARA vad som sades. Inga tillägg.",
    "huvudpunkter": [
      "MAX ${mainPointsCount} punkter. BARA saker som UTTRYCKLIGEN diskuterades. Varje punkt måste vara förankrad i transkriptet."
    ],
    "beslut": [
      "BARA beslut som EXPLICIT fattades. Tom lista [] om inga beslut uttalades."
    ],
    "åtgärdspunkter": [
      {
        "titel": "VERB-inledd, baserad på vad som SADES",
        "beskrivning": "Vad som UTTALADES ska göras. Inga tillägg.",
        "ansvarig": "NAMN bara om uttryckligen nämnt, annars tom sträng",
        "deadline": "YYYY-MM-DD bara om uttalat, annars tom sträng",
        "prioritet": "critical | high | medium | low"
      }
    ],
    "nästaMöteFörslag": [
      "MAX ${nextMeetingCount}. BARA kopplade till faktiskt diskuterade olösta frågor. Tom lista om inget behöver följas upp."
    ]
  }
}

${speakerNote}
${agendaNote}
${shortNote}

Svara ENDAST med giltig JSON, utan extra text, utan markdown, utan förklaringar.`;

    // Model selection: all plans route through api.tivly.se/ai/gemini
    const isEnterpriseUser = isEnterprise === true || userPlan === 'enterprise';
    const isPaid = userPlan && userPlan !== 'free';

    // Pick provider + model per plan
    const provider = isEnterpriseUser ? 'openai' : 'gemini';
    const model = isEnterpriseUser
      ? 'gpt-4.1'
      : isPaid
        ? 'gemini-2.5-flash'
        : 'gemini-2.5-flash-lite';
    const costUsd = isEnterpriseUser ? 0.05 : isPaid ? 0.001 : 0.0005;

    const BACKEND_URL = 'https://api.tivly.se';
    console.log(`🤖 Model selection: ${isEnterpriseUser ? 'ENTERPRISE' : isPaid ? 'PAID' : 'FREE'} → ${provider}/${model} via api.tivly.se`);

    const response = await fetch(`${BACKEND_URL}/ai/gemini`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
      },
      body: JSON.stringify({
        provider,
        model,
        prompt: promptContent,
        temperature: 0.1,
        maxOutputTokens: 16384,
        costUsd,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ AI API error via backend (${provider}/${model}):`, {
        status: response.status,
        statusText: response.statusText,
        error: errorText.substring(0, 500)
      });
      return new Response(
        JSON.stringify({
          error: "Kunde inte analysera mötet",
          details: `AI API error: ${response.status}`,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const backendData = await response.json();
    console.log(`✅ ${provider}/${model} response received via backend`);

    // Backend returns responseText — wrap in Gemini-compatible format for downstream parsing
    const responseText = backendData.responseText || '';
    let data: any = {
      candidates: [{
        content: {
          parts: [{ text: responseText }]
        }
      }]
    };
    
    // Parse the JSON content from the Gemini response
    let result;
    try {
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      console.log("📝 Raw AI content length:", content.length);
      
      // Clean up markdown code blocks if present
      let cleanedContent = content.trim();
      if (cleanedContent.startsWith('```json')) {
        cleanedContent = cleanedContent.replace(/^```json\n/, '').replace(/\n```$/, '');
      } else if (cleanedContent.startsWith('```')) {
        cleanedContent = cleanedContent.replace(/^```\n/, '').replace(/\n```$/, '');
      }

      // Extra safety: try to cut out the JSON object if there is extra text around it
      const firstBrace = cleanedContent.indexOf('{');
      const lastBrace = cleanedContent.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanedContent = cleanedContent.slice(firstBrace, lastBrace + 1);
      }
      
      let parsed: any;
      try {
        parsed = JSON.parse(cleanedContent);
      } catch (innerErr) {
        console.error('❌ JSON parse failed, content preview:', cleanedContent.substring(0, 200));
        throw new Error('AI returnerade ogiltigt format');
      }
      
      // Support both English and Swedish JSON structures
      const protocol = parsed.protokoll || parsed.protocol || parsed;
      
      // Debug: log actual keys from AI response
      console.log('🔑 Parsed keys (top-level):', Object.keys(parsed));
      console.log('🔑 Protocol keys:', Object.keys(protocol));

      const title = protocol.title || protocol.titel || meetingName || 'Mötesprotokoll';
      const summary = protocol.summary || protocol.sammanfattning || protocol.sammandrag || '';
      
      // Normalize main points - check all possible Swedish/English key variations
      let mainPoints = protocol.mainPoints || protocol.huvudpunkter || protocol.punkter 
        || protocol.main_points || protocol.Huvudpunkter || protocol.MainPoints || [];
      if (!Array.isArray(mainPoints)) {
        mainPoints = typeof mainPoints === 'string' ? [mainPoints] : [];
      }
      console.log('📋 Raw mainPoints count:', mainPoints.length, 'types:', mainPoints.slice(0, 3).map((p: any) => typeof p));
      mainPoints = mainPoints
        .map((p: any) => {
          if (typeof p === 'string') return p;
          // Handle object-style points: {punkt: "...", ämne: "...", text: "..."}
          if (typeof p === 'object' && p !== null) {
            return p.punkt || p.text || p.ämne || p.description || p.beskrivning || p.content || p.title || p.titel || JSON.stringify(p);
          }
          return String(p);
        })
        .filter((p: string) => p.trim() !== '' && p !== '{}');
      
      // Normalize decisions - ensure it's always an array of strings
      let decisions = protocol.decisions || protocol.beslut || [];
      if (!Array.isArray(decisions)) {
        decisions = [];
      }
      decisions = decisions
        .map((d: any) => (typeof d === 'string' ? d : ''))
        .filter((d: string) => d.trim() !== '');
      
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
      nextMeetingSuggestions = nextMeetingSuggestions
        .map((s: any) => (typeof s === 'string' ? s : ''))
        .filter((s: string) => s.trim() !== '');

      console.log("✅ Parsed & normalized AI response:", {
        title,
        hasSummary: !!summary,
        summaryLength: summary.length,
        summaryPreview: summary.substring(0, 100),
        mainPointsCount: mainPoints.length,
        decisionsCount: decisions.length,
        actionItemsCount: actionItems.length,
        nextMeetingSuggestionsCount: nextMeetingSuggestions.length,
      });
      
      // Fallbacks: use minimal factual statements, never fabricate
      const safeSummary = summary && summary.trim().length > 0
        ? summary
        : `Protokoll för ${meetingName || 'möte'}.`;

      let safeMainPoints = mainPoints;
      if (mainPoints.length === 0 && safeSummary.length > 10) {
        safeMainPoints = [safeSummary];
      } else if (mainPoints.length === 0) {
        safeMainPoints = [`Protokoll för ${meetingName || 'möte'}.`];
      }

      result = {
        title,
        summary: safeSummary,
        mainPoints: safeMainPoints,
        decisions,
        actionItems,
        nextMeetingSuggestions,
      };
      
      console.log('✅ Returning protocol:', {
        title: result.title,
        summaryLength: result.summary.length,
        mainPointsCount: result.mainPoints.length,
        decisionsCount: result.decisions.length,
        actionItemsCount: result.actionItems.length
      });
    } catch (parseError) {
      console.error("❌ Parse/normalization error:", parseError);
      console.error('Stack:', parseError instanceof Error ? parseError.stack : 'No stack');

      result = {
        title: meetingName || 'Mötesprotokoll',
        summary: `Protokoll för ${meetingName || 'möte'}. AI-parsning misslyckades.`,
        mainPoints: [`Protokoll kunde inte genereras automatiskt.`],
        decisions: [],
        actionItems: [],
        nextMeetingSuggestions: [],
      };
      
      console.log('⚠️ Using fallback protocol due to parse error');
    }

    // Final validation - minimal factual fallbacks only
    if (!result.summary || result.summary.trim().length < 5) {
      result.summary = `Protokoll för ${meetingName || 'möte'}.`;
    }
    
    if (!Array.isArray(result.mainPoints) || result.mainPoints.length === 0) {
      result.mainPoints = [`Protokoll för ${meetingName || 'möte'}.`];
    }

    console.log("✅ Returning protocol:", {
      title: result.title,
      summaryLength: result.summary.length,
      summaryPreview: result.summary.substring(0, 100),
      mainPointsCount: result.mainPoints.length,
    });
    
    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error('❌ Unexpected error in analyze-meeting:', error);
    console.error('Error type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack');
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Ett oväntat fel uppstod",
        details: error instanceof Error ? error.stack?.substring(0, 500) : 'No details'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
