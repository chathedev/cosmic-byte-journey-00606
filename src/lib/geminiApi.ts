import { supabase } from "@/integrations/supabase/client";

// Use Supabase edge function for AI calls
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export type GeminiModel = 
  | "gemini-2.5-flash"
  | "gemini-2.5-flash-lite"
  | "gemini-2.5-pro"
  | "gemini-1.5-flash"
  | "gemini-1.5-pro";

// Default cost estimates per model (USD)
export const MODEL_COSTS: Record<GeminiModel, number> = {
  'gemini-2.5-flash': 0.001,
  'gemini-2.5-flash-lite': 0.0005,
  'gemini-2.5-pro': 0.005,
  'gemini-1.5-flash': 0.001,
  'gemini-1.5-pro': 0.003,
};

export interface GeminiRequest {
  prompt: string;
  model?: GeminiModel;
  temperature?: number;
  maxOutputTokens?: number;
  costUsd?: number; // Optional: records USD cost for this call
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
  recordedCostUsd: number | null; // Echoed cost that was recorded
}

export interface GeminiError {
  error: string;
  message?: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface CostEntry {
  service: string;
  costUsd: number;
  description?: string;
  metadata?: Record<string, unknown>;
  userEmail?: string; // Admin-only: attribute cost to another user
}

export interface CostHistoryEntry {
  service: string;
  amountUsd: number;
  description?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
  userEmail?: string;
}

export interface UserCosts {
  totalUsd: number;
  history: CostHistoryEntry[];
}

export interface AdminCosts {
  totalUsd: number;
  byService: Record<string, number>;
  byUser: Record<string, { totalUsd: number; history: CostHistoryEntry[] }>;
  history: CostHistoryEntry[];
  lastUpdated: string;
}

/**
 * Get the best available auth token (localStorage first, then Supabase session)
 */
async function getAuthToken(): Promise<string | null> {
  // Check localStorage first (api.tivly.se auth)
  const localToken = localStorage.getItem('authToken');
  if (localToken && localToken.trim().length > 0) {
    return localToken;
  }
  
  // Fall back to Supabase session
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch {
    return null;
  }
}

const API_BASE_URL = "https://api.tivly.se";

async function buildApiHeaders(extra?: HeadersInit): Promise<HeadersInit> {
  const token = await getAuthToken();
  const headers: HeadersInit = {
    Accept: 'application/json',
    ...(extra ?? {}),
  };

  if (token) {
    (headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Record an AI cost for any custom action (protocol emails, reports, etc.)
 * 
 * @param entry - Cost entry with service, costUsd, description, metadata
 * @returns Success status
 */
export async function recordAICost(entry: CostEntry): Promise<boolean> {
  if (!entry.costUsd || entry.costUsd <= 0) {
    console.warn('Invalid cost amount, skipping cost recording');
    return false;
  }

  const response = await fetch(`${API_BASE_URL}/ai/cost`, {
    method: "POST",
    credentials: "include",
    headers: await buildApiHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      service: entry.service || 'ai',
      costUsd: entry.costUsd,
      description: entry.description,
      metadata: entry.metadata,
      userEmail: entry.userEmail, // Only works for admins
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 400 && errorData.error === 'invalid_cost') {
      console.error('Invalid cost amount');
      return false;
    }
    console.error('Failed to record AI cost:', errorData);
    return false;
  }

  return true;
}

/**
 * Get AI costs for the current user (or all users for admins)
 * 
 * @returns User costs (or admin snapshot with all users)
 */
export async function getAICosts(): Promise<{ user?: UserCosts; admin?: AdminCosts }> {
  const response = await fetch(`${API_BASE_URL}/ai/costs`, {
    method: "GET",
    credentials: "include",
    headers: await buildApiHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch AI costs');
  }

  const data = await response.json();
  
  // Non-admin response has { success, user: { totalUsd, history } }
  // Admin response has { success, totalUsd, byService, byUser, history, lastUpdated }
  if (data.user) {
    return { user: data.user };
  }
  
  return {
    admin: {
      totalUsd: data.totalUsd,
      byService: data.byService,
      byUser: data.byUser,
      history: data.history,
      lastUpdated: data.lastUpdated,
    }
  };
}

/**
 * Get admin AI costs (full snapshot) - requires admin privileges
 * 
 * @returns Full admin cost snapshot
 */
export async function getAdminAICosts(): Promise<AdminCosts> {
  const response = await fetch(`${API_BASE_URL}/admin/ai-costs`, {
    method: "GET",
    credentials: "include",
    headers: await buildApiHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch admin AI costs');
  }

  const data = await response.json();
  return {
    totalUsd: data.totalUsd,
    byService: data.byService,
    byUser: data.byUser,
    history: data.history,
    lastUpdated: data.lastUpdated,
  };
}

/**
 * Call the Gemini AI endpoint via Supabase edge function.
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
  // Set default model based on enterprise status if not specified
  const model = request.model || (isEnterprise ? "gemini-2.5-flash" : "gemini-2.5-flash-lite");

  // Calculate cost estimate for tracking
  const estimatedCost = request.costUsd ?? MODEL_COSTS[model as GeminiModel] ?? 0.001;

  const requestBody: Record<string, unknown> = {
    prompt: request.prompt,
    model,
    costUsd: estimatedCost, // Always include cost for tracking
  };

  // Note: temperature and maxOutputTokens are not supported by Vertex AI
  // They are ignored by the backend per API docs

  // Get auth token for the edge function
  const token = await getAuthToken();
  if (!token) {
    throw new Error("Inte inloggad");
  }

  // Call via Supabase edge function
  const { data, error } = await supabase.functions.invoke('ai-gemini', {
    body: requestBody,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (error) {
    console.error('[generateWithGemini] Supabase function error:', error);
    throw new Error(error.message || 'AI-fel');
  }

  if (data?.error) {
    // Handle specific error codes per API docs
    if (data.error === "prompt_required") {
      throw new Error("En prompt krävs");
    }
    if (data.error === "google_ai_failed") {
      throw new Error(data.message || "Gemini API-fel - försök igen senare");
    }
    throw new Error(data.message || data.error || 'API-fel');
  }

  return data as GeminiResponse;
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
 * Stream chat with Gemini via Supabase edge function.
 * Uses simulated streaming for typewriter effect.
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
  const model = isEnterprise ? "gemini-2.5-flash" : "gemini-2.5-flash-lite";

  try {
    // Build prompt for edge function
    const systemPrompt = `Du är en intelligent mötesassistent för Tivly. Svara på svenska.${transcript ? `\n\nMÖTESINNEHÅLL:\n${transcript}` : ''}`;
    const userPrompt = messages.map(m => `${m.role === 'user' ? 'Användare' : 'Assistent'}: ${m.content}`).join('\n\n');

    // Get auth token
    const token = await getAuthToken();
    if (!token) {
      onError(new Error("Inte inloggad"));
      return;
    }

    // Calculate cost estimate for tracking
    const estimatedCost = MODEL_COSTS[model as GeminiModel] ?? 0.001;

    // Call via Supabase edge function
    const { data, error } = await supabase.functions.invoke('ai-gemini', {
      body: {
        prompt: `${systemPrompt}\n\n${userPrompt}`,
        model,
        costUsd: estimatedCost, // Always include cost for tracking
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (error) {
      console.error('[streamChat] Supabase function error:', error);
      onError(new Error(error.message || 'AI-fel'));
      return;
    }

    if (data?.error) {
      onError(new Error(data.message || data.error || "API-fel"));
      return;
    }

    // Extract text from Gemini response
    const assistantContent = 
      data.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      data.response?.candidates?.[0]?.output?.text ||
      "Kunde inte generera svar.";

    // Simulate streaming by sending content in chunks
    const words = assistantContent.split(' ');
    for (let i = 0; i < words.length; i++) {
      onDelta(words[i] + (i < words.length - 1 ? ' ' : ''));
      await new Promise(r => setTimeout(r, 15)); // Small delay for typewriter effect
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
