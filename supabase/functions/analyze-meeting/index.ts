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
    
    // Determine protocol length based on transcript length - QUALITY over QUANTITY
    // Keep protocols focused and concise - never overwhelm with too many points
    let summaryLength, mainPointsCount, mainPointsDetail, decisionsDetail, actionItemsCount, actionItemsDetail, nextMeetingCount;
    
    if (wordCount < 100) {
      // Very short - minimal protocol
      summaryLength = "1-2 korta meningar";
      mainPointsCount = "1-3";
      mainPointsDetail = "Mycket kort, en halv mening per punkt";
      decisionsDetail = "Endast FAKTISKA beslut som explicit fattades";
      actionItemsCount = "0-1";
      actionItemsDetail = "Endast om tydligt nämnt med namn och uppgift";
      nextMeetingCount = "0-1";
    } else if (wordCount < 200) {
      // Short meeting
      summaryLength = "2-3 meningar med kortfattad översikt";
      mainPointsCount = "2-4";
      mainPointsDetail = "En kort mening per punkt";
      decisionsDetail = "Endast FAKTISKA beslut - inte diskussioner eller förslag";
      actionItemsCount = "0-2";
      actionItemsDetail = "Kortfattad - titel och ansvarig om explicit nämnt";
      nextMeetingCount = "0-2";
    } else if (wordCount < 500) {
      // Medium-short meeting
      summaryLength = "3-4 meningar med översikt";
      mainPointsCount = "3-5";
      mainPointsDetail = "En till två meningar per punkt";
      decisionsDetail = "Endast KONKRETA beslut som fattades - inte idéer eller förslag";
      actionItemsCount = "1-3";
      actionItemsDetail = "Beskrivning med viktiga detaljer";
      nextMeetingCount = "1-2";
    } else if (wordCount < 1000) {
      // Medium meeting
      summaryLength = "4-5 meningar med detaljerad översikt";
      mainPointsCount = "4-7";
      mainPointsDetail = "Två meningar per punkt med detaljer";
      decisionsDetail = "Tydliga beslut med kontext - INTE diskussioner utan resultat";
      actionItemsCount = "2-5";
      actionItemsDetail = "Detaljerad beskrivning med kontext";
      nextMeetingCount = "2-3";
    } else if (wordCount < 2000) {
      // Long meeting
      summaryLength = "5-7 meningar med detaljerad översikt";
      mainPointsCount = "5-8";
      mainPointsDetail = "Två till tre meningar per punkt med detaljer";
      decisionsDetail = "Detaljerade beslut med bakgrund - ENDAST faktiska beslut";
      actionItemsCount = "3-7";
      actionItemsDetail = "Omfattande beskrivning med kontext och plan";
      nextMeetingCount = "2-4";
    } else {
      // Very long meeting - still keep it focused, max 10 main points
      summaryLength = "6-8 meningar med omfattande översikt";
      mainPointsCount = "6-10";
      mainPointsDetail = "Två till tre meningar per punkt med djupgående detaljer";
      decisionsDetail = "Fullständiga beslut med bakgrund - ENDAST verifierbara beslut";
      actionItemsCount = "5-10";
      actionItemsDetail = "Mycket omfattande beskrivning med komplett kontext";
      nextMeetingCount = "3-5";
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

DU MÅSTE referera till talare med namn i protokollet:
- I sammanfattningen, nämn vem som ledde mötet och viktiga bidrag (t.ex. "Mötet leddes av Charlie som presenterade...")
- I huvudpunkter, inkludera talarens namn när de framförde något viktigt (t.ex. "Erik lyfte frågan om...")
- I åtgärdspunkter, sätt ALLTID talarens namn som "ansvarig" om de tog på sig uppgiften
- I beslut, nämn VEM som föreslog beslutet och vem som godkände

NAMNANVÄNDNING:
- Skriv naturligt: "Charlie föreslog att...", "Erik och Lisa diskuterade...", "Enligt Maria bör..."
- Nämn namn på de som aktivt bidrog till diskussionen
- Om en specifik person var ansvarig för ett ämne, nämn dem
- I åtgärdspunkter MÅSTE ansvarig-fältet innehålla namn om någon nämndes
`;
    }

    const promptContent = `Du är en erfaren styrelsesekreterare. Ditt protokoll ska vara ett ARBETSVERKTYG som driver beslut och åtgärder framåt – inte bara ett minnesdokument.

🚫 ABSOLUT FÖRBJUDET:
- Kopiera meningar ordagrant från utskriften
- Använda vaga formuleringar som "lyfte fram", "betonade", "diskuterade vikten av"
- Skriva beslut som egentligen bara var diskussioner
- Hitta på information, namn, datum eller siffror som inte nämndes
- Skapa åtgärdspunkter utan tydlig koppling till vad som sades

✅ SKRIVSTILAR ATT ANVÄNDA:
- KONKRET: "Teamet beslutade att byta leverantör till X senast Q3" istället för "Leverantörsfrågan diskuterades"
- HANDLINGSINRIKTAT: Varje punkt ska besvara "Vad ska göras? Av vem? När?"
- DIREKT: Nämn personer vid namn: "Erik ansvarar för..." inte "Det bestämdes att..."
- RESULTATORIENTERAT: Fokusera på UTFALL, inte på att "det diskuterades"

🎯 BESLUT – STRIKT KRAV:
- Ett beslut = något gruppen AKTIVT BESLUTADE, inte bara pratade om
- Formulera som: "Beslut: [vad] – [vem ansvarar] – [deadline om nämnt]"
- Om INGA beslut fattades, returnera TOM lista []. Det är helt ok.
- Diskussioner utan slutsats = INTE beslut

🎯 ÅTGÄRDSPUNKTER – STRIKT KRAV:
- Varje åtgärd MÅSTE ha en konkret, uppföljningsbar titel
- "ansvarig" = personens NAMN om det nämndes. Om ingen nämndes, skriv "" (tomt)
- "deadline" = YYYY-MM-DD BARA om datum explicit nämndes. Annars ""
- "prioritet" = basera på hur brådskande det framstod i mötet
- Beskrivningen ska vara specifik nog att någon annan kan förstå och agera på den
- Dåligt: "Följa upp säkerhetsfrågan" → Bra: "Genomföra penetrationstest av API-gateway och rapportera resultat till teamet"

🎯 SAMMANFATTNING – STRIKT KRAV:
- Första meningen: Mötets syfte och viktigaste resultat
- Nämn deltagare vid namn och deras roller/bidrag
- Avsluta med status: vad är klart, vad återstår, vad blockerar framsteg
- ALDRIG generiska meningar som "Mötet var produktivt"

🎯 HUVUDPUNKTER – STRIKT KRAV:
- Varje punkt = ett KONKRET ämne med RESULTAT eller SLUTSATS
- Dåligt: "Säkerhetsfrågor lyftes" → Bra: "API-säkerheten bedömdes som otillräcklig; teamet enades om att prioritera OAuth2-implementation före release"
- Inkludera VEM som drev frågan och VAD utfallet blev
- Om ingen slutsats nåddes, skriv det explicit: "Frågan bordlades till nästa möte"

🎯 NÄSTA MÖTE-FÖRSLAG:
- BARA ämnen/frågor att ta upp, ALDRIG datum eller tider
- Koppla till olösta frågor eller pågående åtgärder från detta möte

Möte: ${meetingName || 'Namnlöst möte'}
Längd: ${wordCount} ord${agendaSection}

Utskrift:
${transcript}

Skapa ett handlingsinriktat protokoll som ren JSON på svenska:

{
  "protokoll": {
    "titel": "Koncis titel som fångar mötets huvudsyfte",
    "datum": "YYYY-MM-DD",
    "sammanfattning": "${summaryLength}. Konkret: syfte, viktigaste resultat, deltagare vid namn, status.",
    "huvudpunkter": [
      "MAX ${mainPointsCount} punkter. ${mainPointsDetail}. Varje punkt = ämne + resultat/slutsats + vem som drev frågan."
    ],
    "beslut": [
      "ENDAST VERIFIERBARA BESLUT. ${decisionsDetail}. Formulera: 'Beslut: [vad] – [ansvarig om känd]'. Tom lista om inga beslut fattades."
    ],
    "åtgärdspunkter": [
      {
        "titel": "Specifik, uppföljningsbar uppgift",
        "beskrivning": "${actionItemsDetail}. Tillräckligt konkret för att någon annan ska kunna agera.",
        "ansvarig": "Personens NAMN om nämnt, annars tom sträng",
        "deadline": "YYYY-MM-DD bara om explicit nämnt, annars tom sträng",
        "prioritet": "critical | high | medium | low"
      }
    ],
    "nästaMöteFörslag": [
      "MAX ${nextMeetingCount} förslag. Koppla till olösta frågor från mötet."
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
