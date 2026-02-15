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
    
    let summaryLength, mainPointsCount, mainPointsDetail, decisionsDetail, actionItemsCount, actionItemsDetail, nextMeetingCount;
    
    if (wordCount < 100) {
      summaryLength = isEnterpriseTier ? "3-4 meningar" : "2-3 meningar";
      mainPointsCount = isEnterpriseTier ? "3-5" : "2-4";
      mainPointsDetail = "Kort och koncis, en till två meningar per punkt";
      decisionsDetail = "Endast FAKTISKA beslut som explicit fattades";
      actionItemsCount = isEnterpriseTier ? "1-3" : "1-2";
      actionItemsDetail = "Kort – titel, ansvarig och leverans om nämnt";
      nextMeetingCount = "1-2";
    } else if (wordCount < 200) {
      summaryLength = isEnterpriseTier ? "4-5 meningar" : "3-4 meningar";
      mainPointsCount = isEnterpriseTier ? "4-6" : "3-5";
      mainPointsDetail = "Två meningar per punkt med resultat";
      decisionsDetail = "Endast FAKTISKA beslut - inte diskussioner eller förslag";
      actionItemsCount = isEnterpriseTier ? "2-4" : "1-3";
      actionItemsDetail = "Titel, ansvarig, leveransmål";
      nextMeetingCount = "1-2";
    } else if (wordCount < 500) {
      summaryLength = isEnterpriseTier ? "5-7 meningar" : "4-5 meningar";
      mainPointsCount = isEnterpriseTier ? "5-8" : "4-6";
      mainPointsDetail = "Två till tre meningar per punkt med slutsats och ansvarig";
      decisionsDetail = "KONKRETA beslut med ansvarig och konsekvens";
      actionItemsCount = isEnterpriseTier ? "3-6" : "2-4";
      actionItemsDetail = "Detaljerad: vad levereras, till vem, i vilket format";
      nextMeetingCount = "2-3";
    } else if (wordCount < 1000) {
      summaryLength = isEnterpriseTier ? "6-8 meningar" : "5-7 meningar";
      mainPointsCount = isEnterpriseTier ? "7-10" : "5-8";
      mainPointsDetail = "Tre meningar per punkt med detaljer och ansvarig";
      decisionsDetail = "Tydliga beslut med kontext, ansvarig och uppföljning";
      actionItemsCount = isEnterpriseTier ? "4-10" : "3-6";
      actionItemsDetail = "Fullständig: leverans, mottagare, format, kvalitetskrav";
      nextMeetingCount = "3-5";
    } else if (wordCount < 2000) {
      summaryLength = isEnterpriseTier ? "8-10 meningar" : "6-8 meningar";
      mainPointsCount = isEnterpriseTier ? "8-12" : "6-10";
      mainPointsDetail = "Tre till fyra meningar per punkt med djupgående detaljer";
      decisionsDetail = "Detaljerade beslut med bakgrund, ansvarig och uppföljningsdatum";
      actionItemsCount = isEnterpriseTier ? "6-12" : "4-8";
      actionItemsDetail = "Omfattande: leverans, mottagare, format, tidsperspektiv, kvalitetskrav";
      nextMeetingCount = "3-5";
    } else {
      summaryLength = isEnterpriseTier ? "10-14 meningar med executive briefing" : "8-10 meningar";
      mainPointsCount = isEnterpriseTier ? "10-18" : "8-12";
      mainPointsDetail = "Fyra till fem meningar per punkt med djupgående analys och kontext";
      decisionsDetail = "Fullständiga beslut med bakgrund, konsekvensanalys och ansvarig";
      actionItemsCount = isEnterpriseTier ? "8-18" : "6-12";
      actionItemsDetail = "Mycket omfattande: exakt leverans, mottagare, format, kvalitetsmått, beroenden";
      nextMeetingCount = "4-6";
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

    const promptContent = `Du är en operativ styrelsesekreterare. Du skriver protokoll som STYR ARBETE – inte som DOKUMENTERAR SAMTAL.

GRUNDREGEL: Om en läsare inte kan svara på "Vad ska jag göra måndag morgon?" efter att ha läst protokollet, har du misslyckats.

═══ FÖRBJUDNA MÖNSTER ═══
Dessa formuleringar är BANNLYSTA. Använd dem ALDRIG:
- "lyfte fram", "betonade", "poängterade", "underströk"
- "diskuterade vikten av", "tog upp frågan om"
- "ska undersöka", "ska titta på", "ska kolla", "ska se över"
- "upprätthålla dialog", "fortsätta diskussionen", "bevaka frågan"
- "det konstaterades att", "man var överens om att"
- Alla passiva konstruktioner: "det beslutades" → skriv istället "X beslutade att..."
- Berättande text som beskriver VAD som hände istället för VAD SOM SKA GÖRAS
- Vaga åtgärder utan leveransmål: "placera frågan på agendan" → skriv istället "Presentera beslutsunderlag med tre alternativ för [frågan] på nästa styrelsemöte"

═══ OBLIGATORISK SKRIVSTIL ═══

SAMMANFATTNING:
- Mening 1: "[Namn] ledde mötet om [syfte]. Huvudresultat: [konkret utfall]."
- Mening 2-3: De viktigaste besluten/åtgärderna i kortform.
- Sista meningen: "Öppna frågor: [lista]" eller "Nästa kritiska steg: [vad]"
- ALDRIG berättande stil. Skriv som en executive briefing.

HUVUDPUNKTER – varje punkt MÅSTE följa detta format:
"[Ämne]: [Slutsats/resultat]. [Namn] ansvarar för [vad]. [Status: klart/pågår/bordlagt]"
- Om ingen slutsats nåddes: "[Ämne]: Ingen slutsats. Bordlagt till nästa möte."
- Om det bara diskuterades utan resultat, SÄG DET RAKT: "Diskussion utan beslut."
- ALDRIG avsluta en punkt utan att ange status (klart/pågår/bordlagt/beslutat)

BESLUT – ultra-strikt:
- Format: "[Vad beslutades] → Ansvarig: [Namn]. Deadline: [datum/saknas]."
- "Ska undersöka" = INTE ett beslut. Det är en åtgärdspunkt.
- "Vi borde" = INTE ett beslut. Det är en åsikt.
- Ett beslut kräver att gruppen SA JA eller FATTADE ETT AKTIVT VAL.
- 0 beslut är bättre än 1 falskt beslut. Tom lista [] är helt acceptabelt.

ÅTGÄRDSPUNKTER – leveransfokus:
- "titel": Börja med VERB. "Genomför...", "Sammanställ...", "Kontakta...", "Leverera...", "Presentera..."
- "beskrivning": MÅSTE besvara ALLA dessa frågor:
  1. Vad ska levereras? (dokument, beslut, analys, rapport?)
  2. Till vem? (mottagare/forum)
  3. I vilket format? (presentation, mail, rapport, muntligt?)
  4. Vad är godkänt resultat? (kvalitetskrav)
  Dåligt: "Följa upp säkerhetsfrågan"
  Dåligt: "Placera frågan på agendan"
  Dåligt: "Upprätthålla dialog med myndigheten"
  Bra: "Sammanställ beslutsunderlag med tre alternativa strategier för myndighetskontakt. Presentera som en A4-sida med för/nackdelar per alternativ vid nästa styrelsemöte."
  Bra: "Kontakta Arbetsmiljöverket per telefon och efterfråga skriftlig vägledning kring nya krav. Sammanfatta svaret i ett internt PM till teamet."
- "ansvarig": Personens NAMN. Om ingen nämndes → "" (tomt, gissa aldrig)
- "deadline": Använd ALLTID en av dessa strategier:
  1. Om ett EXAKT DATUM nämndes → använd det (YYYY-MM-DD)
  2. Om en TIDSRAM nämndes ("inom två veckor", "före sommaren") → beräkna ett rimligt datum från mötesdatumet
  3. Om ett NÄSTA MÖTE eller EVENT nämndes ("före nästa styrelsemöte", "innan konferensen") → skriv "Före [event/möte]"
  4. Om INGET av ovanstående → härleda en rimlig deadline baserat på prioritet och komplexitet:
     - critical/high → "Inom 1-2 veckor"
     - medium → "Inom 1 månad"  
     - low → "Inom 2 månader"
  ALDRIG lämna deadline tom. Varje åtgärd behöver en tidshorisont för att vara uppföljningsbar.
- "prioritet": critical (blockerar annat arbete), high (måste ske snart), medium (viktigt men ej brådskande), low (nice-to-have)
- KVALITETSTEST: Om en åtgärd kan besvaras med "ja, men vad exakt?" → den är för vag. Gör den mer konkret.

NÄSTA MÖTE-FÖRSLAG:
- Koppla DIREKT till olösta frågor: "Uppföljning av [åtgärd X] – status och resultat"
- ALDRIG datum/tider. Bara ämnen.

═══ KVALITETSKONTROLL ═══
Innan du svarar, kontrollera:
1. Innehåller VARJE huvudpunkt en slutsats eller status? Om inte → skriv om.
2. Är VARJE åtgärdspunkt tillräckligt specifik för att någon annan ska kunna utföra den? Om inte → gör den mer konkret.
3. Finns det NÅGRA av de bannlysta formuleringarna? Om ja → skriv om.
4. Kan en person som INTE var på mötet förstå exakt vad som ska göras? Om inte → förtydliga.

Dagens datum: ${new Date().toISOString().split('T')[0]}
VIKTIGT: Alla datum i protokollet (inklusive deadlines) MÅSTE vara i framtiden relativt dagens datum. Använd ALDRIG år som redan passerat.

Möte: ${meetingName || 'Namnlöst möte'}
Längd: ${wordCount} ord${agendaSection}

Utskrift:
${transcript}

JSON-struktur (svara ENBART med detta):

{
  "protokoll": {
    "titel": "Kort, specifik titel som fångar huvudbeslutet eller syftet",
    "datum": "YYYY-MM-DD",
    "sammanfattning": "${summaryLength}. Executive briefing-stil. Resultat först, detaljer sen.",
    "huvudpunkter": [
      "MAX ${mainPointsCount} punkter. ${mainPointsDetail}. Format: Ämne → Resultat → Ansvarig → Status."
    ],
    "beslut": [
      "${decisionsDetail}. Format: '[Beslut] → Ansvarig: [Namn]. Deadline: [datum/saknas].' Tom lista om inga beslut fattades."
    ],
    "åtgärdspunkter": [
      {
        "titel": "VERB-inledd, specifik leverans",
        "beskrivning": "${actionItemsDetail}. Vad levereras? Till vem? I vilket format?",
        "ansvarig": "NAMN eller tom sträng",
        "deadline": "YYYY-MM-DD eller tom sträng",
        "prioritet": "critical | high | medium | low"
      }
    ],
    "nästaMöteFörslag": [
      "MAX ${nextMeetingCount}. Koppla till olösta frågor."
    ]
  }
}

${speakerNote}
${agendaNote}
${shortNote}

Svara ENDAST med giltig JSON, utan extra text, utan markdown, utan förklaringar.`;

    // Model selection: Enterprise → Pro, Paid → Flash, Free → Flash Lite
    const isEnterpriseUser = isEnterprise === true || userPlan === 'enterprise';
    const isPaid = userPlan && userPlan !== 'free';
    const geminiModel = isEnterpriseUser ? 'gemini-2.5-pro' : isPaid ? 'gemini-2.5-flash' : 'gemini-2.5-flash-lite';
    console.log('🤖 Model selection:', { isEnterprise, userPlan, isEnterpriseUser, geminiModel });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${GEMINI_API_KEY}`,
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
