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
      summaryLength = isEnterpriseTier ? "4-5 meningar" : "3-4 meningar";
      mainPointsCount = isEnterpriseTier ? "4-6" : "3-5";
      mainPointsDetail = "Två meningar per punkt med substans";
      decisionsDetail = "Endast FAKTISKA beslut som explicit fattades";
      actionItemsCount = isEnterpriseTier ? "2-3" : "1-2";
      actionItemsDetail = "Kort – titel, ansvarig och leverans om nämnt";
      nextMeetingCount = "1-2";
    } else if (wordCount < 200) {
      summaryLength = isEnterpriseTier ? "5-6 meningar" : "4-5 meningar";
      mainPointsCount = isEnterpriseTier ? "5-7" : "4-6";
      mainPointsDetail = "Två till tre meningar per punkt med resultat och kontext";
      decisionsDetail = "Endast FAKTISKA beslut - inte diskussioner eller förslag";
      actionItemsCount = isEnterpriseTier ? "2-5" : "2-3";
      actionItemsDetail = "Titel, ansvarig, leveransmål";
      nextMeetingCount = "2-3";
    } else if (wordCount < 500) {
      summaryLength = isEnterpriseTier ? "6-8 meningar" : "5-6 meningar";
      mainPointsCount = isEnterpriseTier ? "6-10" : "5-8";
      mainPointsDetail = "Tre meningar per punkt med slutsats, ansvarig och kontext";
      decisionsDetail = "KONKRETA beslut med ansvarig och konsekvens";
      actionItemsCount = isEnterpriseTier ? "4-7" : "3-5";
      actionItemsDetail = "Detaljerad: vad levereras, till vem, i vilket format";
      nextMeetingCount = "2-4";
    } else if (wordCount < 1000) {
      summaryLength = isEnterpriseTier ? "8-10 meningar" : "6-8 meningar";
      mainPointsCount = isEnterpriseTier ? "8-12" : "6-10";
      mainPointsDetail = "Tre till fyra meningar per punkt med detaljer, kontext och ansvarig";
      decisionsDetail = "Tydliga beslut med kontext, ansvarig och uppföljning";
      actionItemsCount = isEnterpriseTier ? "5-10" : "4-7";
      actionItemsDetail = "Fullständig: leverans, mottagare, format, kvalitetskrav";
      nextMeetingCount = "3-5";
    } else if (wordCount < 2000) {
      summaryLength = isEnterpriseTier ? "10-12 meningar" : "8-10 meningar";
      mainPointsCount = isEnterpriseTier ? "10-15" : "8-12";
      mainPointsDetail = "Fyra meningar per punkt med djupgående detaljer och kontext";
      decisionsDetail = "Detaljerade beslut med bakgrund, ansvarig och uppföljningsdatum";
      actionItemsCount = isEnterpriseTier ? "7-14" : "5-9";
      actionItemsDetail = "Omfattande: leverans, mottagare, format, tidsperspektiv, kvalitetskrav";
      nextMeetingCount = "4-6";
    } else {
      summaryLength = isEnterpriseTier ? "12-16 meningar med executive briefing" : "10-12 meningar";
      mainPointsCount = isEnterpriseTier ? "12-20" : "10-15";
      mainPointsDetail = "Fyra till fem meningar per punkt med djupgående analys, kontext och strategisk implikation";
      decisionsDetail = "Fullständiga beslut med bakgrund, konsekvensanalys och ansvarig";
      actionItemsCount = isEnterpriseTier ? "10-20" : "7-14";
      actionItemsDetail = "Mycket omfattande: exakt leverans, mottagare, format, kvalitetsmått, beroenden";
      nextMeetingCount = "5-7";
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

    const promptContent = `Du är en operativ styrelsesekreterare med expertis inom det aktuella ämnesområdet. Du skriver protokoll som STYR ARBETE – inte som DOKUMENTERAR SAMTAL.

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

═══ BANNLYSTA GENERISKA FORMULERINGAR I HUVUDPUNKTER ═══
Följande formuleringar är TOTALFÖRBJUDNA i huvudpunkter. Om du skriver något av dessa har du MISSLYCKATS:
- "Mötets huvudsyfte var att gå igenom aktuellt läge och nästa steg."
- "Deltagarna diskuterade ansvarsfördelning, tidsplan och prioriterade aktiviteter."
- "Genomgång av nuläge och viktigaste frågor som lyftes under mötet."
- "Identifiering av ansvariga personer och kommande aktiviteter."
- "Överenskommelse om uppföljning och förslag på nästa möte."
- ALLA formuleringar som "kunde tillhöra vilket möte som helst" utan domänspecifik substans.

Varje huvudpunkt MÅSTE innehålla DOMÄNSPECIFIK information som är UNIK för just detta möte.
Nämn specifika organisationer, tekniska termer, sakfrågor, regelverk, produkter, siffror och namn som faktiskt diskuterades.

═══ OBLIGATORISK SKRIVSTIL ═══

SAMMANFATTNING:
- Mening 1: "[Namn] ledde mötet om [specifikt syfte med domäntermer]. Huvudresultat: [konkret utfall]."
- Mening 2-3: De viktigaste besluten/åtgärderna i kortform med domänspecifika detaljer.
- Sista meningen: "Öppna frågor: [specifika frågor]" eller "Nästa kritiska steg: [vad exakt]"
- ALDRIG berättande stil. Skriv som en executive briefing.

HUVUDPUNKTER – varje punkt MÅSTE följa detta format:
"[Specifikt ämne med domäntermer]: [Slutsats/resultat med detaljer]. [Namn] ansvarar för [vad]. [Status: klart/pågår/bordlagt]"
- VARJE punkt MÅSTE referera till SPECIFIKT INNEHÅLL från transkriptionen
- Inkludera organisationsnamn, tekniska begrepp, regelverk, siffror som nämndes
- Om deltagare hade OLIKA STÅNDPUNKTER, beskriv dem: "[Namn A] förespråkade X medan [Namn B] argumenterade för Y"
- Strategiska spänningar eller meningsskiljaktigheter ska fångas neutralt men tydligt
- Om ingen slutsats nåddes: "[Specifikt ämne]: Ingen slutsats. Bordlagt till nästa möte."
- Om det bara diskuterades utan resultat, SÄG DET RAKT: "Diskussion utan beslut."
- ALDRIG avsluta en punkt utan att ange status (klart/pågår/bordlagt/beslutat)

BESLUT – ultra-strikt:
- Format: "[Vad beslutades med specifika detaljer] → Ansvarig: [Namn]. Deadline: [datum/saknas]."
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
- Koppla DIREKT till olösta frågor: "Uppföljning av [specifik åtgärd] – status och resultat"
- ALDRIG datum/tider. Bara ämnen.

═══ DIPLOMATISK SPRÅKPOLERING ═══
Protokollet ska vara institutionellt hållbart – det kan skickas till myndigheter, styrelser eller externa parter.

REGLER:
- Undvik absoluta påståenden som kan ifrågasättas. Skriv "med en mycket låg officiell olycksfrekvens" istället för "med endast två dödsfall sedan 1972".
- Undvik retoriska eller informella uttryck från transkriptionen (t.ex. "agera polis"). Omformulera till formellt språk: "ta ett större egenansvar för säkerhetsuppföljning".
- Om en talare använde starkt eller färgat språk, BEHÅLL innebörden men GÖR den diplomatisk och formell.
- Varje formulering ska klara testet: "Kan detta publiceras i en årsredovisning utan att någon reagerar?"
- Strategiska spänningar och meningsskiljaktigheter ska beskrivas NEUTRALT men TYDLIGT – aldrig dramatiserat, aldrig urvattnat.

═══ KVALITETSKONTROLL ═══
Innan du svarar, kontrollera:
1. Innehåller VARJE huvudpunkt DOMÄNSPECIFIK substans? Om en punkt "kunde tillhöra vilket möte som helst" → SKRIV OM med specifika detaljer från transkriptionen.
2. Fångar protokollet eventuella MENINGSSKILJAKTIGHETER eller STRATEGISKA SPÄNNINGAR mellan deltagare? Om olika perspektiv fanns → beskriv dem neutralt.
3. Är VARJE åtgärdspunkt tillräckligt specifik för att någon annan ska kunna utföra den? Om inte → gör den mer konkret.
4. Finns det NÅGRA av de bannlysta formuleringarna? Om ja → skriv om.
5. Kan en person som INTE var på mötet förstå exakt vad som diskuterades och vad som ska göras? Om inte → förtydliga med domänspecifika detaljer.
6. Nämns organisationer, regelverk, tekniska termer och siffror som togs upp i mötet? Om inte → lägg till dem.
7. Klarar VARJE formulering det diplomatiska testet? Om ett uttryck är för informellt, retoriskt eller absolut → omformulera till institutionellt hållbart språk.

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

    // Model selection: Enterprise → OpenAI GPT-4.1 via api.tivly.se, Paid → Flash, Free → Flash Lite
    const isEnterpriseUser = isEnterprise === true || userPlan === 'enterprise';
    const isPaid = userPlan && userPlan !== 'free';
    
    let data: any;
    
    if (isEnterpriseUser) {
      // Enterprise: Use OpenAI GPT-4.1 via api.tivly.se backend
      const BACKEND_URL = 'https://api.tivly.se';
      console.log('🤖 Model selection: ENTERPRISE → OpenAI GPT-4.1 via api.tivly.se');
      
      const response = await fetch(`${BACKEND_URL}/ai/gemini`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: "openai",
          model: "gpt-4.1",
          prompt: promptContent,
          temperature: 0.2,
          maxOutputTokens: 16384,
          costUsd: 0.05, // Higher cost for GPT-4.1
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ OpenAI API error via backend:", {
          status: response.status,
          statusText: response.statusText,
          error: errorText.substring(0, 500)
        });
        return new Response(
          JSON.stringify({
            error: "Kunde inte analysera mötet",
            details: `OpenAI API error: ${response.status}`,
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const backendData = await response.json();
      console.log("✅ OpenAI GPT-4.1 response received via backend, model:", backendData.model);
      
      // The backend returns responseText directly - wrap it in Gemini-compatible format
      // so downstream parsing works the same way
      const responseText = backendData.responseText || '';
      data = {
        candidates: [{
          content: {
            parts: [{ text: responseText }]
          }
        }]
      };
    } else {
      // Non-enterprise: Use Gemini API directly
      const geminiModel = isPaid ? 'gemini-2.5-flash' : 'gemini-2.5-flash-lite';
      console.log('🤖 Model selection:', { isEnterprise, userPlan, geminiModel });

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
              maxOutputTokens: 16384,
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

      data = await response.json();
      console.log("✅ Gemini API response received, processing...");
    }
    
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
      
      // If summary or main points are missing, generate strategic fallback from transcript
      const safeSummary = summary && summary.trim().length > 0
        ? summary
        : `Mötet behandlade ${meetingName || 'aktuella frågor'} med fokus på planering och nästa steg.`;

      // Never dump raw transcript as main points — use a strategic single-point fallback
      let safeMainPoints = mainPoints;
      if (mainPoints.length === 0 && safeSummary.length > 30) {
        // Re-use the summary as a single main point if AI failed to generate bullets
        safeMainPoints = [safeSummary];
      } else if (mainPoints.length === 0) {
        safeMainPoints = [`Mötet behandlade ${meetingName || 'aktuella ämnen'} och identifierade uppföljningspunkter för kommande arbete.`];
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

      // Absolute fallback: strategic summary from transcript, never apologetic
      const fallbackWordCount = transcript.trim().split(/\s+/).length;
      const fallbackSummary = `Mötet behandlade ${meetingName || 'aktuella ämnen'} och omfattade cirka ${fallbackWordCount} ord av diskussion.`;

      const fallbackMainPoints = [
        `Mötet behandlade ${meetingName || 'aktuella ämnen'} och identifierade uppföljningspunkter för kommande arbete.`,
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
      result.summary = `Mötet behandlade ${meetingName || 'aktuella frågor'} med fokus på planering och uppföljning.`;
    }
    
    if (!Array.isArray(result.mainPoints) || result.mainPoints.length === 0) {
      console.error('❌ Invalid mainPoints detected');
      result.mainPoints = [
        `Mötet behandlade ${meetingName || 'aktuella ämnen'} och identifierade uppföljningspunkter för kommande arbete.`,
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
