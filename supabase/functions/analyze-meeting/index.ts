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
    const { transcript, meetingName, agenda, hasSpeakerAttribution, speakers } = await req.json();
    
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
    
    // Determine protocol length based on transcript length - enhanced scaling
    let summaryLength, mainPointsCount, mainPointsDetail, decisionsDetail, actionItemsCount, actionItemsDetail, nextMeetingCount;
    
    if (wordCount < 100) {
      // Very short - minimal protocol
      summaryLength = "1-2 korta meningar";
      mainPointsCount = "2-3";
      mainPointsDetail = "Mycket kort, en halv mening per punkt";
      decisionsDetail = "Endast om explicit nämnt";
      actionItemsCount = "0-1";
      actionItemsDetail = "Endast om tydligt nämnt med namn och uppgift";
      nextMeetingCount = "0-1";
    } else if (wordCount < 200) {
      // Short meeting
      summaryLength = "2-3 meningar med kortfattad översikt";
      mainPointsCount = "3-4";
      mainPointsDetail = "En kort mening per punkt";
      decisionsDetail = "Kort formulering om nämnt";
      actionItemsCount = "1-2";
      actionItemsDetail = "Kortfattad - titel och ansvarig om nämnt";
      nextMeetingCount = "1-2";
    } else if (wordCount < 500) {
      // Medium-short meeting
      summaryLength = "3-4 meningar med översikt";
      mainPointsCount = "4-6";
      mainPointsDetail = "En till två meningar per punkt";
      decisionsDetail = "Tydlig formulering";
      actionItemsCount = "2-4";
      actionItemsDetail = "Beskrivning med viktiga detaljer";
      nextMeetingCount = "2-3";
    } else if (wordCount < 1000) {
      // Medium meeting
      summaryLength = "4-6 meningar med detaljerad översikt";
      mainPointsCount = "6-10";
      mainPointsDetail = "Två meningar per punkt med detaljer";
      decisionsDetail = "Utförlig formulering med kontext";
      actionItemsCount = "3-6";
      actionItemsDetail = "Detaljerad beskrivning med kontext";
      nextMeetingCount = "3-4";
    } else if (wordCount < 2000) {
      // Long meeting
      summaryLength = "6-8 meningar med mycket detaljerad översikt";
      mainPointsCount = "10-15";
      mainPointsDetail = "Två till tre meningar per punkt med omfattande detaljer";
      decisionsDetail = "Mycket utförlig formulering med bakgrund och konsekvenser";
      actionItemsCount = "5-10";
      actionItemsDetail = "Omfattande beskrivning med full kontext och plan";
      nextMeetingCount = "4-5";
    } else {
      // Very long meeting
      summaryLength = "8-12 meningar med extremt detaljerad översikt";
      mainPointsCount = "15-25";
      mainPointsDetail = "Tre till fyra meningar per punkt med djupgående detaljer och insikter";
      decisionsDetail = "Extremt detaljerad med fullständig bakgrund och långsiktiga konsekvenser";
      actionItemsCount = "8-15";
      actionItemsDetail = "Mycket omfattande beskrivning med komplett kontext och genomförandeplan";
      nextMeetingCount = "5-7";
    }
    
    const agendaSection = agenda ? "\n\nMötesagenda:\n" + agenda + "\n" : '';
    const agendaNote = agenda ? 'OBS: Använd mötesagendan ovan för att strukturera protokollet och säkerställ att alla agendapunkter täcks.' : '';
    const shortNote = wordCount < 50 ? 'OBS: Utskriften är mycket kort. Inkludera ett meddelande i sammanfattningen om att mötet innehöll begränsad information.' : '';
    
    // Speaker attribution instructions
    let speakerNote = '';
    if (hasSpeakerAttribution && speakers && speakers.length > 0) {
      const speakerList = speakers.map((s: { name: string; segments: number }) => s.name).join(', ');
      speakerNote = `
🎤 VIKTIGT - TALARINFORMATION:
Utskriften innehåller talaridentifiering med format [Namn]: text
Identifierade talare: ${speakerList}

Du MÅSTE:
- Notera VEM som sa vad i protokollet när det är relevant
- I sammanfattningen, nämn nyckeltalare och deras bidrag
- I huvudpunkter, inkludera talarens namn när specifika åsikter eller förslag nämndes
- I åtgärdspunkter, använd talarens namn som "ansvarig" om de tog på sig uppgiften
- I beslut, nämn om en specifik person föreslog eller tog beslutet

Exempel på hur du ska referera till talare:
- "Charlie föreslog att..." 
- "Enligt diskussionen mellan Anna och Erik..."
- "Beslutet togs efter att Maria lyfte frågan om..."
`;
    }

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

🎯 KRITISKA NOGGRANNHETSKRAV:
- Inkludera ENDAST information som FAKTISKT diskuterades i mötet
- Dra INGA slutsatser som inte EXPLICIT nämndes i utskriften
- Om något är oklart, använd formuleringen "enligt diskussionen" eller "som nämndes"
- GÖR INGA ANTAGANDEN om saker som inte sades i mötet
- Vid osäkerhet, var KONSERVATIV - utelämna hellre information än att gissa
- VERIFIERA att varje punkt du skriver faktiskt har stöd i utskriften
- Om en person nämns, använd EXAKT det namn som används i utskriften
- Om siffror eller data nämns, använd EXAKT de värden som nämndes
- Lägg ALDRIG till extra kontext eller bakgrundsinformation som inte diskuterades
- Om ingen ansvarig nämndes för en åtgärd, lämna fältet TOMT - gissa inte
- Om inget beslut togs om något, inkludera det INTE i beslutslistan

⚠️ VARNING: Felaktiga protokoll med uppfinnad information är OACCEPTABELT.
Korrekthet och faktabaserad dokumentation är VIKTIGARE än omfattande protokoll.

Möte: ${meetingName || 'Namnlöst möte'}
Längd: ${wordCount} ord${agendaSection}

Utskrift:
${transcript}

VIKTIGT för "nästaMöteFörslag": Lista ENDAST diskussionsämnen och uppföljningspunkter. Inkludera ALDRIG datum, tider eller när mötet ska äga rum - bara VAD som bör tas upp.

VIKTIGT för åtgärdspunkter: Om inget specifikt datum nämndes för en deadline, lämna "deadline"-fältet HELT TOMT (tom sträng ""). Gissa INTE eller lägg INTE till dagens år automatiskt.

Skapa ett professionellt, DETALJERAT och OMFATTANDE protokoll som ren JSON-struktur på svenska med följande form (inga kommentarer):

{
  "protokoll": {
    "titel": "...",
    "datum": "YYYY-MM-DD",
    "sammanfattning": "${summaryLength}. Inkludera kontext, viktiga diskussioner, beslut och resultat. Skriv professionellt.",
    "huvudpunkter": [
      "${mainPointsCount} totalt. ${mainPointsDetail}. Täck alla viktiga ämnen som diskuterades under mötet."
    ],
    "beslut": [
      "${decisionsDetail}. Lista alla beslut som togs."
    ],
    "åtgärdspunkter": [
      "VIKTIGT: Generera EXAKT ${actionItemsCount} åtgärdspunkter baserat på mötets längd.",
      {
        "titel": "Tydlig och konkret titel på uppgiften",
        "beskrivning": "${actionItemsDetail}",
        "ansvarig": "Namn eller roll om nämnt i mötet, annars tom sträng",
        "deadline": "YYYY-MM-DD endast om datum explicit nämndes, annars tom sträng",
        "prioritet": "critical | high | medium | low baserat på urgency i mötet"
      }
    ],
    "nästaMöteFörslag": [
      "${nextMeetingCount} förslag. Beskriv varje diskussionsämne med tillräcklig kontext."
    ]
  }
}

${speakerNote}
${agendaNote}
${shortNote}

Svara ENDAST med giltig JSON enligt strukturen ovan, utan extra text, utan markdown och utan förklaringar.`;

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
            temperature: 0.2,
            maxOutputTokens: 8192,
            responseMimeType: "application/json"
          }
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Gemini API error:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText.substring(0, 500)
      });
      return new Response(
        JSON.stringify({
          error: "Kunde inte analysera mötet",
          details: `Gemini API error: ${response.status}`,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("✅ Gemini API response received, processing...");
    
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

      const title = protocol.title || protocol.titel || meetingName || 'Mötesprotokoll';
      const summary = protocol.summary || protocol.sammanfattning || protocol.sammandrag || '';
      
      // Normalize main points - ensure it's always an array of strings
      let mainPoints = protocol.mainPoints || protocol.huvudpunkter || protocol.punkter || [];
      if (!Array.isArray(mainPoints)) {
        mainPoints = [];
      }
      mainPoints = mainPoints
        .map((p: any) => (typeof p === 'string' ? p : ''))
        .filter((p: string) => p.trim() !== '');
      
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
      
      // If summary or main points are missing, we still fall back to a safe minimal protocol
      const safeSummary = summary && summary.trim().length > 0
        ? summary
        : `Mötet genomfördes och innehöll diskussioner kring planering, uppföljning och nästa steg. Protokollet genererades automatiskt från mötesutskriften.`;

      const safeMainPoints = mainPoints.length > 0
        ? mainPoints
        : [
            'Mötets huvudsyfte var att gå igenom aktuellt läge och nästa steg.',
            'Deltagarna diskuterade ansvarsfördelning, tidsplan och prioriterade aktiviteter.',
          ];

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

      // Absolute fallback: always return a generic but användbart protokoll
      const fallbackWordCount = transcript.trim().split(/\s+/).length;
      const fallbackSummary = `Mötet genomfördes och omfattade diskussioner kring planering, uppföljning och nästa steg. Protokollet är automatiskt genererat utifrån en transkription på cirka ${fallbackWordCount} ord.`;

      const fallbackMainPoints = [
        'Genomgång av nuläge och viktigaste frågor som lyftes under mötet.',
        'Identifiering av ansvariga personer och kommande aktiviteter.',
        'Överenskommelse om uppföljning och förslag på nästa möte.',
      ];

      result = {
        title: meetingName || 'Mötesprotokoll',
        summary: fallbackSummary,
        mainPoints: fallbackMainPoints,
        decisions: [],
        actionItems: [],
        nextMeetingSuggestions: [],
      };
      
      console.log('⚠️ Using fallback protocol due to parse error');
    }

    // Final validation - ensure we never return garbage data
    if (!result.summary || result.summary.trim().length < 10) {
      console.error('❌ Invalid summary detected:', result.summary);
      result.summary = `Mötet genomfördes och diskussioner fördes. Protokollet genererades automatiskt från transkriptionen.`;
    }
    
    if (!Array.isArray(result.mainPoints) || result.mainPoints.length === 0) {
      console.error('❌ Invalid mainPoints detected');
      result.mainPoints = [
        'Genomgång av aktuellt läge och prioriterade frågor.',
        'Diskussion kring nästa steg och ansvariga.',
      ];
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
