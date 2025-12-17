import { supabase } from "@/integrations/supabase/client";

const API_BASE_URL = "https://api.tivly.se";

export type GeminiModel = 
  | "gemini-2.5-flash"
  | "gemini-2.5-flash-lite"
  | "gemini-2.5-pro"
  | "gemini-2.0"
  | "gemini-1.0";

export interface GeminiRequest {
  prompt: string;
  model?: GeminiModel;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GeminiResponse {
  success: boolean;
  model: string;
  response: {
    candidates?: Array<{
      output?: { text?: string };
      content?: {
        parts?: Array<{ text?: string }>;
      };
      finishReason?: string;
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  };
}

export interface GeminiError {
  error: string;
  message?: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Get the auth token for API requests
 */
async function getAuthToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }
  return session.access_token;
}

/**
 * Call the Gemini AI endpoint via api.tivly.se backend.
 * 
 * Uses gemini-2.5-flash for enterprise users and gemini-2.5-flash-lite for regular users by default.
 * 
 * @param request - The request parameters
 * @param isEnterprise - Whether to use the enterprise model (gemini-2.5-flash)
 * @returns The Gemini response
 * @throws Error if the request fails
 */
export async function generateWithGemini(
  request: GeminiRequest, 
  isEnterprise = false
): Promise<GeminiResponse> {
  const token = await getAuthToken();

  // Set default model based on enterprise status if not specified
  const model = request.model || (isEnterprise ? "gemini-2.5-flash" : "gemini-2.5-flash-lite");

  const response = await fetch(`${API_BASE_URL}/ai/gemini`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      ...request,
      model,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as GeminiError;
    
    if (response.status === 400 && errorData.error === "prompt_required") {
      throw new Error("A prompt is required");
    }
    
    if (response.status === 502) {
      throw new Error(errorData.message || "Gemini API error - please try again later");
    }

    if (response.status === 429) {
      throw new Error("För många förfrågningar. Vänligen vänta en stund.");
    }
    
    throw new Error(errorData.message || errorData.error || `API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Extract text from Gemini response
 */
export function extractText(response: GeminiResponse): string {
  // Try the newer format first
  const text = response.response?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (text) return text;
  
  // Fall back to older format
  return response.response?.candidates?.[0]?.output?.text || "";
}

/**
 * Simple helper to generate text with Gemini using sensible defaults.
 * 
 * @param prompt - The prompt to send to Gemini
 * @param isEnterprise - Whether to use the enterprise model (gemini-2.5-flash)
 * @returns The generated text
 */
export async function generateText(prompt: string, isEnterprise = false): Promise<string> {
  const response = await generateWithGemini({ prompt }, isEnterprise);
  return extractText(response);
}

/**
 * Generate text with a specific model.
 * 
 * @param prompt - The prompt to send to Gemini
 * @param model - The specific Gemini model to use
 * @param options - Additional options (temperature, maxOutputTokens)
 * @returns The generated text
 */
export async function generateTextWithModel(
  prompt: string,
  model: GeminiModel,
  options?: { temperature?: number; maxOutputTokens?: number }
): Promise<string> {
  const response = await generateWithGemini({
    prompt,
    model,
    ...options,
  });
  return extractText(response);
}

/**
 * Stream chat with Gemini via api.tivly.se/ai/chat endpoint.
 * Supports SSE streaming for real-time responses.
 * 
 * @param messages - Array of chat messages
 * @param transcript - Optional meeting transcript for context
 * @param isEnterprise - Whether to use enterprise model
 * @param onDelta - Callback for each text chunk
 * @param onDone - Callback when streaming is complete
 * @param onError - Callback for errors
 */
export async function streamChat({
  messages,
  transcript,
  isEnterprise = false,
  meetingSelected = false,
  meetingCount,
  onDelta,
  onDone,
  onError,
}: {
  messages: ChatMessage[];
  transcript?: string;
  isEnterprise?: boolean;
  meetingSelected?: boolean;
  meetingCount?: number;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (error: Error) => void;
}): Promise<void> {
  const token = await getAuthToken();
  const model = isEnterprise ? "gemini-2.5-flash" : "gemini-2.5-flash-lite";

  try {
    const response = await fetch(`${API_BASE_URL}/ai/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages,
        transcript,
        model,
        meetingSelected,
        meetingCount,
      }),
    });

    if (response.status === 429) {
      onError(new Error("För många förfrågningar. Vänligen vänta en stund."));
      return;
    }

    if (response.status === 402) {
      onError(new Error("Betalning krävs. Vänligen lägg till krediter."));
      return;
    }

    if (!response.ok || !response.body) {
      const errorData = await response.json().catch(() => ({}));
      onError(new Error(errorData.message || errorData.error || "Failed to start stream"));
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      textBuffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
        let line = textBuffer.slice(0, newlineIndex);
        textBuffer = textBuffer.slice(newlineIndex + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") {
          break;
        }

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            onDelta(content);
          }
        } catch {
          // Partial JSON, put back and wait for more
          textBuffer = line + "\n" + textBuffer;
          break;
        }
      }
    }

    // Flush remaining buffer
    if (textBuffer.trim()) {
      for (let raw of textBuffer.split("\n")) {
        if (!raw) continue;
        if (raw.endsWith("\r")) raw = raw.slice(0, -1);
        if (raw.startsWith(":") || raw.trim() === "") continue;
        if (!raw.startsWith("data: ")) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch { /* ignore */ }
      }
    }

    onDone();
  } catch (error) {
    onError(error instanceof Error ? error : new Error("Unknown error"));
  }
}

/**
 * Generate a meeting title from transcript.
 * 
 * @param transcript - The meeting transcript
 * @param isEnterprise - Whether to use enterprise model
 * @returns Generated title (3-8 words)
 */
export async function generateMeetingTitleAI(transcript: string, isEnterprise = false): Promise<string> {
  if (!transcript || transcript.trim().length < 10) {
    return `Möte ${new Date().toLocaleDateString('sv-SE')}`;
  }

  // Use first 500 words for context
  const context = transcript.split(/\s+/).slice(0, 500).join(' ');

  const prompt = `Du är en AI som skapar korta, beskrivande titlar för mötesprotokoll på svenska. Titeln ska vara 3-8 ord lång och fånga mötets huvudämne. Svara ENDAST med titeln, inget annat.

Skapa en kort, beskrivande titel för detta möte baserat på transkriptionen:

${context}`;

  try {
    const response = await generateWithGemini({
      prompt,
      temperature: 0.7,
      maxOutputTokens: 50,
    }, isEnterprise);

    let title = extractText(response).trim();
    
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

    return title;
  } catch (error) {
    console.error('Error generating title via API:', error);
    // Fallback to simple title
    const words = transcript.trim().split(/\s+/).slice(0, 8).join(' ');
    return words.length > 50 ? words.substring(0, 47) + '...' : words;
  }
}

/**
 * Build protocol prompt based on transcript length
 */
function buildProtocolPrompt(
  transcript: string,
  meetingName: string,
  agenda?: string,
  hasSpeakerAttribution?: boolean,
  speakers?: { name: string; segments: number }[]
): string {
  const wordCount = transcript.trim().split(/\s+/).length;
  
  // Determine protocol length based on transcript length
  let summaryLength, mainPointsCount, mainPointsDetail, decisionsDetail, actionItemsCount, actionItemsDetail, nextMeetingCount;
  
  if (wordCount < 100) {
    summaryLength = "1-2 korta meningar";
    mainPointsCount = "2-3";
    mainPointsDetail = "Mycket kort, en halv mening per punkt";
    decisionsDetail = "Endast om explicit nämnt";
    actionItemsCount = "0-1";
    actionItemsDetail = "Endast om tydligt nämnt med namn och uppgift";
    nextMeetingCount = "0-1";
  } else if (wordCount < 200) {
    summaryLength = "2-3 meningar med kortfattad översikt";
    mainPointsCount = "3-4";
    mainPointsDetail = "En kort mening per punkt";
    decisionsDetail = "Kort formulering om nämnt";
    actionItemsCount = "1-2";
    actionItemsDetail = "Kortfattad - titel och ansvarig om nämnt";
    nextMeetingCount = "1-2";
  } else if (wordCount < 500) {
    summaryLength = "3-4 meningar med översikt";
    mainPointsCount = "4-6";
    mainPointsDetail = "En till två meningar per punkt";
    decisionsDetail = "Tydlig formulering";
    actionItemsCount = "2-4";
    actionItemsDetail = "Beskrivning med viktiga detaljer";
    nextMeetingCount = "2-3";
  } else if (wordCount < 1000) {
    summaryLength = "4-6 meningar med detaljerad översikt";
    mainPointsCount = "6-10";
    mainPointsDetail = "Två meningar per punkt med detaljer";
    decisionsDetail = "Utförlig formulering med kontext";
    actionItemsCount = "3-6";
    actionItemsDetail = "Detaljerad beskrivning med kontext";
    nextMeetingCount = "3-4";
  } else if (wordCount < 2000) {
    summaryLength = "6-8 meningar med mycket detaljerad översikt";
    mainPointsCount = "10-15";
    mainPointsDetail = "Två till tre meningar per punkt med omfattande detaljer";
    decisionsDetail = "Mycket utförlig formulering med bakgrund och konsekvenser";
    actionItemsCount = "5-10";
    actionItemsDetail = "Omfattande beskrivning med full kontext och plan";
    nextMeetingCount = "4-5";
  } else {
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
    const speakerList = speakers.map(s => s.name).join(', ');
    speakerNote = `
🎤 TALARINFORMATION (använd naturligt, inte överdrivet):
Identifierade talare i mötet: ${speakerList}

Du SKA subtilt och naturligt referera till talare i protokollet:
- I sammanfattningen, nämn huvudtalare kort om relevant (t.ex. "Mötet leddes av Charlie som...")
- I huvudpunkter, inkludera talarens namn när de hade en specifik åsikt eller förslag
- I åtgärdspunkter, sätt talarens namn som "ansvarig" om de tog på sig uppgiften
- I beslut, nämn om en specifik person föreslog det

VIKTIGT - Balans:
- Använd INTE talarnamn på varje punkt - bara när det tillför värde
- Skriv naturligt, t.ex. "Charlie föreslog..." eller "Enligt Erik bör..."
- Om samma person säger allt, nämn dem bara 1-2 gånger, inte på varje punkt
- Fokusera på INNEHÅLLET först, talarattribuering är sekundär
`;
  }

  return `Du är en professionell mötessekreterare. Din uppgift är att ANALYSERA och SYNTETISERA mötesutskriften nedan till ett DETALJERAT protokoll som täcker det viktigaste från mötet.

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
}

export interface AIProtocol {
  title: string;
  summary: string;
  mainPoints: string[];
  decisions: string[];
  actionItems: {
    title: string;
    description: string;
    owner: string;
    deadline: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
  }[];
  nextMeetingSuggestions: string[];
}

/**
 * Analyze a meeting transcript and generate a protocol.
 * 
 * @param transcript - The meeting transcript
 * @param meetingName - Name/title of the meeting
 * @param agenda - Optional agenda content
 * @param hasSpeakerAttribution - Whether speakers are identified
 * @param speakers - List of identified speakers
 * @param isEnterprise - Whether to use enterprise model
 * @returns Parsed protocol object
 */
export async function analyzeMeetingAI(
  transcript: string,
  meetingName: string,
  options?: {
    agenda?: string;
    hasSpeakerAttribution?: boolean;
    speakers?: { name: string; segments: number }[];
    isEnterprise?: boolean;
  }
): Promise<AIProtocol> {
  const { agenda, hasSpeakerAttribution, speakers, isEnterprise = false } = options || {};

  if (!transcript || transcript.trim().length < 10) {
    throw new Error("Transkriptionen är för kort eller saknas");
  }

  const wordCount = transcript.trim().split(/\s+/).length;
  console.log('📊 Processing transcript via API:', { wordCount, chars: transcript.length });

  const prompt = buildProtocolPrompt(transcript, meetingName, agenda, hasSpeakerAttribution, speakers);

  const response = await generateWithGemini({
    prompt,
    temperature: 0.2,
    maxOutputTokens: 8192,
  }, isEnterprise);

  const content = extractText(response);
  
  // Parse and normalize the response
  let cleanedContent = content.trim();
  if (cleanedContent.startsWith('```json')) {
    cleanedContent = cleanedContent.replace(/^```json\n/, '').replace(/\n```$/, '');
  } else if (cleanedContent.startsWith('```')) {
    cleanedContent = cleanedContent.replace(/^```\n/, '').replace(/\n```$/, '');
  }

  // Extract JSON object
  const firstBrace = cleanedContent.indexOf('{');
  const lastBrace = cleanedContent.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleanedContent = cleanedContent.slice(firstBrace, lastBrace + 1);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleanedContent);
  } catch (err) {
    console.error('❌ JSON parse failed:', cleanedContent.substring(0, 200));
    throw new Error('AI returnerade ogiltigt format');
  }

  // Support both English and Swedish JSON structures
  const protocol = parsed.protokoll || parsed.protocol || parsed;

  const title = protocol.title || protocol.titel || meetingName || 'Mötesprotokoll';
  const summary = protocol.summary || protocol.sammanfattning || protocol.sammandrag || '';
  
  // Normalize main points
  let mainPoints = protocol.mainPoints || protocol.huvudpunkter || protocol.punkter || [];
  if (!Array.isArray(mainPoints)) mainPoints = [];
  mainPoints = mainPoints.map((p: any) => (typeof p === 'string' ? p : '')).filter((p: string) => p.trim() !== '');
  
  // Normalize decisions
  let decisions = protocol.decisions || protocol.beslut || [];
  if (!Array.isArray(decisions)) decisions = [];
  decisions = decisions.map((d: any) => (typeof d === 'string' ? d : '')).filter((d: string) => d.trim() !== '');
  
  // Normalize action items
  const actionItemsRaw = protocol.actionItems || protocol.åtgärdspunkter || protocol.atgardsPunkter || [];
  const actionItems = Array.isArray(actionItemsRaw)
    ? actionItemsRaw.map((item: any) => {
        if (typeof item === 'string') {
          return { title: item, description: '', owner: '', deadline: '', priority: 'medium' as const };
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
  if (!Array.isArray(nextMeetingSuggestions)) nextMeetingSuggestions = [];
  nextMeetingSuggestions = nextMeetingSuggestions.map((s: any) => (typeof s === 'string' ? s : '')).filter((s: string) => s.trim() !== '');

  // Fallback for required fields
  const safeSummary = summary && summary.trim().length > 0
    ? summary
    : `Mötet genomfördes och innehöll diskussioner kring planering, uppföljning och nästa steg.`;

  const safeMainPoints = mainPoints.length > 0
    ? mainPoints
    : ['Mötets huvudsyfte var att gå igenom aktuellt läge och nästa steg.', 'Deltagarna diskuterade ansvarsfördelning, tidsplan och prioriterade aktiviteter.'];

  return {
    title,
    summary: safeSummary,
    mainPoints: safeMainPoints,
    decisions,
    actionItems,
    nextMeetingSuggestions,
  };
}
