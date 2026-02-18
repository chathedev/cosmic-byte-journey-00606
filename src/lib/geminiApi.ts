import { supabase } from "@/integrations/supabase/client";

// All AI calls now go through the backend at api.tivly.se
// No longer using Supabase edge functions for AI

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
    provider: "gemini",
    prompt: request.prompt,
    model,
    costUsd: estimatedCost, // Always include cost for tracking
  };

  // Note: temperature and maxOutputTokens are not supported by Vertex AI
  // They are ignored by the backend per API docs

  // Get auth token
  const token = await getAuthToken();
  if (!token) {
    throw new Error("Inte inloggad");
  }

  const MAX_RETRIES = 3;
  const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes for long meetings

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      console.log(`[generateWithGemini] Attempt ${attempt}/${MAX_RETRIES} - calling api.tivly.se/ai/gemini`);

      const response = await fetch(`${API_BASE_URL}/ai/gemini`, {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`[generateWithGemini] Backend error (attempt ${attempt}):`, response.status, errorData);

        if (response.status === 401) {
          throw new Error("Inte inloggad");
        }
        if (response.status === 429) {
          // Rate limited - wait and retry
          if (attempt < MAX_RETRIES) {
            const delay = Math.min(2000 * Math.pow(2, attempt - 1), 15000);
            console.log(`[generateWithGemini] Rate limited, waiting ${delay}ms before retry`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          throw new Error("För många förfrågningar - vänta en stund");
        }
        // Server errors (500, 502, 503) - retry
        if (response.status >= 500 && attempt < MAX_RETRIES) {
          const delay = Math.min(3000 * Math.pow(2, attempt - 1), 20000);
          console.log(`[generateWithGemini] Server error ${response.status}, waiting ${delay}ms before retry`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        throw new Error(errorData.message || errorData.error || 'AI-fel');
      }

      const data = await response.json();

      if (data?.error) {
        if (data.error === "prompt_required") {
          throw new Error("En prompt krävs");
        }
        if (data.error === "google_ai_failed") {
          // Retry on AI failures
          if (attempt < MAX_RETRIES) {
            const delay = Math.min(3000 * Math.pow(2, attempt - 1), 20000);
            console.log(`[generateWithGemini] AI failed, waiting ${delay}ms before retry`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          throw new Error(data.message || "Gemini API-fel - försök igen senare");
        }
        throw new Error(data.message || data.error || 'API-fel');
      }

      return data as GeminiResponse;
    } catch (err: any) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        console.warn(`[generateWithGemini] Request timed out (attempt ${attempt})`);
        if (attempt < MAX_RETRIES) {
          console.log(`[generateWithGemini] Retrying after timeout...`);
          continue;
        }
        throw new Error("Förfrågan tog för lång tid. Försök igen - för långa möten kan ta extra tid.");
      }
      // Network errors - retry
      if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
        if (attempt < MAX_RETRIES) {
          const delay = Math.min(3000 * Math.pow(2, attempt - 1), 20000);
          console.log(`[generateWithGemini] Network error, waiting ${delay}ms before retry`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }
      throw err;
    }
  }

  throw new Error('Kunde inte nå AI-tjänsten efter flera försök');
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
    // Build prompt for backend
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

    console.log('[streamChat] Calling backend at api.tivly.se/ai/gemini');

    // Call via backend at api.tivly.se (NOT Supabase edge function)
    const response = await fetch(`${API_BASE_URL}/ai/gemini`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        provider: "gemini",
        prompt: `${systemPrompt}\n\n${userPrompt}`,
        model,
        costUsd: estimatedCost,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[streamChat] Backend error:', response.status, errorData);
      onError(new Error(errorData.message || errorData.error || 'AI-fel'));
      return;
    }

    const data = await response.json();

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
    summaryLength = "3-4 meningar";
    mainPointsCount = "3-5";
    mainPointsDetail = "Två meningar per punkt med substans";
    decisionsDetail = "Endast om explicit nämnt";
    actionItemsCount = "1-2";
    actionItemsDetail = "Titel och ansvarig om nämnt";
    nextMeetingCount = "1-2";
  } else if (wordCount < 200) {
    summaryLength = "4-5 meningar med översikt";
    mainPointsCount = "4-6";
    mainPointsDetail = "Två till tre meningar per punkt med kontext";
    decisionsDetail = "Kort formulering om nämnt";
    actionItemsCount = "2-3";
    actionItemsDetail = "Titel, ansvarig och leveransmål";
    nextMeetingCount = "2-3";
  } else if (wordCount < 500) {
    summaryLength = "5-6 meningar med översikt";
    mainPointsCount = "5-8";
    mainPointsDetail = "Tre meningar per punkt med kontext och slutsats";
    decisionsDetail = "Tydlig formulering";
    actionItemsCount = "3-5";
    actionItemsDetail = "Beskrivning med viktiga detaljer";
    nextMeetingCount = "2-4";
  } else if (wordCount < 1000) {
    summaryLength = "6-8 meningar med detaljerad översikt";
    mainPointsCount = "6-10";
    mainPointsDetail = "Tre till fyra meningar per punkt med detaljer och kontext";
    decisionsDetail = "Utförlig formulering med kontext";
    actionItemsCount = "4-7";
    actionItemsDetail = "Detaljerad beskrivning med kontext";
    nextMeetingCount = "3-5";
  } else if (wordCount < 2000) {
    summaryLength = "8-10 meningar med mycket detaljerad översikt";
    mainPointsCount = "8-12";
    mainPointsDetail = "Fyra meningar per punkt med djupgående detaljer";
    decisionsDetail = "Mycket utförlig formulering med bakgrund och konsekvenser";
    actionItemsCount = "5-9";
    actionItemsDetail = "Omfattande beskrivning med full kontext och plan";
    nextMeetingCount = "4-6";
  } else {
    summaryLength = "10-12 meningar med extremt detaljerad översikt";
    mainPointsCount = "10-15";
    mainPointsDetail = "Fyra till fem meningar per punkt med djupgående analys och kontext";
    decisionsDetail = "Extremt detaljerad med fullständig bakgrund och långsiktiga konsekvenser";
    actionItemsCount = "7-14";
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
🎤 TALARINFORMATION - ANVÄND NAMN AKTIVT I ALLA SEKTIONER:
Identifierade talare i mötet: ${speakerList}

DU MÅSTE referera till talare med namn i ALLA delar av protokollet:
- I sammanfattningen, nämn vem som ledde mötet och vem som presenterade vad
- I VARJE huvudpunkt, inkludera talarens namn och vad de sa/föreslog/beslutade
- I åtgärdspunkter, sätt ALLTID talarens namn som "ansvarig"
- I beslut, nämn VEM som föreslog och vem som ansvarar

NAMNANVÄNDNING - OBLIGATORISKT:
- Skriv naturligt: "Charlie föreslog att...", "Erik och Lisa diskuterade..."
- VARJE huvudpunkt bör nämna minst en person vid namn
- I åtgärdspunkter MÅSTE ansvarig-fältet innehålla namn om någon nämndes
- Använd formuleringen "[Namn] ansvarar för..." i huvudpunkter
`;
  }

  return `Du är en erfaren styrelsesekreterare som skriver formella, handlingsdrivna mötesprotokoll. Din uppgift är att OMFORMULERA mötesutskriften nedan till ett DETALJERAT protokoll.

TONALITET – FORMELLT PROTOKOLL, INTE RAPPORT:
- Skriv SAKLIGT och REFERERANDE: "X framförde att…", "Det konstaterades att…", "Mötet enades om…"
- FÖRBJUDET att tolka eller analysera dynamiken: ALDRIG "Strategiska spänningar identifierades", "En intressant konfliktlinje framkom"
- Protokollet ska dokumentera VAD som sades, VAD som beslutades, VAD som ska göras — INTE analysera VARFÖR
- Skildra olika ståndpunkter NEUTRALT utan att kommentera dem: "[Namn A] framförde X. [Namn B] invände att Y."

ABSOLUT FÖRBJUDET:
- Kopiera NÅGON mening direkt från utskriften
- Generiska formuleringar som "kunde tillhöra vilket möte som helst"
- "Mötets huvudsyfte var att gå igenom aktuellt läge och nästa steg" (BANNLYST)
- "Deltagarna diskuterade ansvarsfördelning, tidsplan och prioriterade aktiviteter" (BANNLYST)
- Alla vaga, abstrakta sammanfattningar utan domänspecifikt innehåll
- Analytiska kommentarer om mötesdynamik, maktförhållanden eller "strategiska spänningar"

DU MÅSTE:
- OMFORMULERA allt innehåll med egna ord
- SYNTETISERA information från flera delar av mötet
- Inkludera DOMÄNSPECIFIKA detaljer: organisationsnamn, tekniska termer, regelverk, siffror, produkter
- VARJE huvudpunkt MÅSTE vara unik för just detta möte – inte generisk

ANSVARSKRAV – KRITISKT:
- VARJE huvudpunkt och VARJE åtgärdspunkt MÅSTE ha en ansvarig person
- Om en ansvarig INTE nämndes explicit i mötet, skriv: "Ansvar ej tilldelat — beslut tas vid nästa möte"
- Lämna ALDRIG ansvarig-fältet tomt utan förklaring
- Om flera kan vara ansvariga, ange den som nämndes mest i samband med frågan

BESLUT vs DISKUSSION – STRIKT SEPARATION:
- "beslut" ska ENBART innehålla punkter där mötet EXPLICIT fattade beslut eller enades om något
- "huvudpunkter" innehåller diskussion, kontext och sakfrågor — även olösta
- Om något diskuterades MEN inget beslut fattades, lägg det ENBART under huvudpunkter med status "Diskuterat utan beslut" eller "Bordlagt"

KRITISKA NOGGRANNHETSKRAV:
- Inkludera ENDAST information som FAKTISKT diskuterades
- Dra INGA slutsatser som inte EXPLICIT nämndes
- Om en person nämns, använd EXAKT det namn som används i utskriften
- Om siffror eller data nämns, använd EXAKT de värden som nämndes

Möte: ${meetingName || 'Namnlöst möte'}
Längd: ${wordCount} ord${agendaSection}

Utskrift:
${transcript}

Skapa ett professionellt, DETALJERAT och DOMÄNSPECIFIKT protokoll som ren JSON-struktur på svenska:

{
  "protokoll": {
    "titel": "Kort, specifik titel som fångar huvudbeslutet eller syftet",
    "datum": "YYYY-MM-DD",
    "sammanfattning": "${summaryLength}. Saklig executive briefing med domänspecifika detaljer. Avsluta med 'Nästa kritiska steg: …' som pekar ut de viktigaste åtgärderna.",
    "huvudpunkter": [
      "${mainPointsCount} totalt. ${mainPointsDetail}. Format: Ämne → Vad framfördes → Ansvarig: [Namn] (eller 'Ansvar ej tilldelat — beslut tas vid nästa möte') → Status: Beslutat/Pågår/Bordlagt/Diskuterat utan beslut."
    ],
    "beslut": [
      "${decisionsDetail}. ENBART faktiska beslut. Format: '§[nr] [Beslut] — Ansvarig: [Namn]. Deadline: [datum/saknas].' Tom lista om inga beslut fattades."
    ],
    "åtgärdspunkter": [
      {
        "titel": "VERB-inledd, specifik leverans",
        "beskrivning": "${actionItemsDetail}. Vad levereras? Till vem? I vilket format? Vad räknas som godkänt resultat?",
        "ansvarig": "NAMN (eller 'Ansvar ej tilldelat — beslut tas vid nästa möte')",
        "deadline": "YYYY-MM-DD eller tom sträng",
        "prioritet": "critical | high | medium | low"
      }
    ],
    "nästaMöteFörslag": [
      "${nextMeetingCount} förslag. Koppla till olösta frågor och saknade ansvarstilldelningar."
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
    userPlan?: string;
  }
): Promise<AIProtocol> {
  const { agenda, hasSpeakerAttribution, speakers, isEnterprise, userPlan } = options || {};

  if (!transcript || transcript.trim().length < 10) {
    throw new Error("Transkriptionen är för kort eller saknas");
  }

  const wordCount = transcript.trim().split(/\s+/).length;
  console.log('📊 Processing transcript for protocol:', { wordCount, chars: transcript.length });

  // For very long transcripts (>12000 words / ~90min+), truncate intelligently
  // to avoid token limits. Keep beginning + end for context.
  let processedTranscript = transcript;
  const MAX_WORDS = 12000;
  if (wordCount > MAX_WORDS) {
    const words = transcript.trim().split(/\s+/);
    const keepStart = Math.floor(MAX_WORDS * 0.6); // 60% from start
    const keepEnd = Math.floor(MAX_WORDS * 0.4);   // 40% from end
    const startPart = words.slice(0, keepStart).join(' ');
    const endPart = words.slice(-keepEnd).join(' ');
    processedTranscript = `${startPart}\n\n[... mittendelen utelämnad för protokollgenerering (~${wordCount - keepStart - keepEnd} ord) ...]\n\n${endPart}`;
    console.log(`📊 Transcript truncated: ${wordCount} -> ~${MAX_WORDS} words (start: ${keepStart}, end: ${keepEnd})`);
  }

  // Call the analyze-meeting edge function DIRECTLY (bypasses api.tivly.se 30s timeout)
  // This function has no timeout constraints and calls Gemini API directly.
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
  
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[analyzeMeetingAI] Attempt ${attempt}/${MAX_RETRIES} - calling analyze-meeting edge function directly`);

      const body: Record<string, unknown> = {
        transcript: processedTranscript,
        meetingName,
      };
      if (agenda) body.agenda = agenda;
      if (hasSpeakerAttribution) body.hasSpeakerAttribution = true;
      if (speakers && speakers.length > 0) body.speakers = speakers;
      if (isEnterprise) body.isEnterprise = true;
      if (userPlan) body.userPlan = userPlan;

      const token = await getAuthToken();
      const response = await fetch(`${SUPABASE_URL}/functions/v1/analyze-meeting`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error(`[analyzeMeetingAI] Edge function error (attempt ${attempt}):`, response.status, errorData);

        // Retry on server errors
        if (response.status >= 500 && attempt < MAX_RETRIES) {
          const delay = Math.min(3000 * Math.pow(2, attempt - 1), 20000);
          console.log(`[analyzeMeetingAI] Server error ${response.status}, waiting ${delay}ms before retry`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw new Error(errorData.error || errorData.message || `Kunde inte generera protokoll (${response.status})`);
      }

      const data = await response.json();
      console.log('✅ Protocol received from edge function:', {
        hasTitle: !!data.title,
        hasSummary: !!data.summary,
        mainPointsCount: data.mainPoints?.length || 0,
      });

      // The edge function already returns normalized data
      return {
        title: data.title || meetingName || 'Mötesprotokoll',
        summary: data.summary || 'Mötet genomfördes och innehöll diskussioner kring planering, uppföljning och nästa steg.',
        mainPoints: Array.isArray(data.mainPoints) && data.mainPoints.length > 0
          ? data.mainPoints
          : ['Mötets huvudsyfte var att gå igenom aktuellt läge och nästa steg.'],
        decisions: Array.isArray(data.decisions) ? data.decisions : [],
        actionItems: Array.isArray(data.actionItems) ? data.actionItems : [],
        nextMeetingSuggestions: Array.isArray(data.nextMeetingSuggestions) ? data.nextMeetingSuggestions : [],
      };
    } catch (err: any) {
      // Network errors - retry
      if ((err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) && attempt < MAX_RETRIES) {
        const delay = Math.min(3000 * Math.pow(2, attempt - 1), 20000);
        console.log(`[analyzeMeetingAI] Network error, waiting ${delay}ms before retry`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      if (attempt >= MAX_RETRIES) {
        throw err;
      }
      throw err;
    }
  }

  throw new Error('Kunde inte nå AI-tjänsten efter flera försök');
}
