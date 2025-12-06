import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple in-memory rate limiting (per IP)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10; // 10 requests per minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const limitData = rateLimitMap.get(ip);

  if (!limitData || now > limitData.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (limitData.count >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  limitData.count++;
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting check
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!checkRateLimit(ip)) {
      return new Response(
        JSON.stringify({ error: "För många förfrågningar. Vänligen vänta en minut." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { messages, transcript, meetingSelected } = await req.json();
    
    if (!Array.isArray(messages)) {
      throw new Error("Messages array is required");
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const hasTranscript = transcript && transcript.trim().length > 20;
    
    // Build system prompt based on context
    let systemPrompt = `Du är Tivly AI - en specialiserad mötesassistent. Du hjälper ENDAST med frågor om Tivly-appen och användarens möten.

STRIKT BEGRÄNSNING - Du svarar ENDAST på frågor om:
• Användarens möten och mötesinnehåll
• Mötesanalys, sammanfattningar och protokoll  
• Förslag för kommande möten
• Hur Tivly-appen fungerar

Om användaren frågar om NÅGOT ANNAT (uppsatser, kodning, recept, allmän kunskap), svara:
"Jag är Tivly AI och hjälper endast med dina möten och Tivly-appen. Ställ gärna en fråga om dina möten! 💼"

`;

    if (hasTranscript || meetingSelected) {
      // Meeting context available - answer directly
      systemPrompt += `MÖTESINNEHÅLL:
${transcript}

INSTRUKTIONER:
- Användaren har redan valt ett möte - fråga ALDRIG vilket möte de menar
- Svara direkt baserat på mötesinnehållet ovan
- Var hjälpsam och koncis
- Använd punktlistor och **fetstil** för viktigt`;
    } else {
      // No meeting selected - ask which meeting
      systemPrompt += `VIKTIGT: Inget möte är valt ännu.

Om användaren frågar något om mötesinnehåll (sammanfattning, beslut, vad pratades det om, etc.), svara EXAKT:
"[ASK_MEETING]Vilket möte vill du att jag ska hjälpa dig med?"

Du MÅSTE inkludera [ASK_MEETING] taggen i början när du ber om mötesval.`;
    }

    // Convert messages to Gemini format
    const geminiMessages = messages.map((msg: any) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }]
    }));

    // Add system prompt as first user message
    geminiMessages.unshift({
      role: "user",
      parts: [{ text: systemPrompt }]
    });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: geminiMessages,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
          }
        }),
      }
    );

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: "AI API error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Stream the response
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                  
                  if (text) {
                    // Convert to OpenAI-like format for compatibility
                    const sseData = `data: ${JSON.stringify({
                      choices: [{
                        delta: { content: text }
                      }]
                    })}\n\n`;
                    controller.enqueue(new TextEncoder().encode(sseData));
                  }
                } catch (e) {
                  // Skip invalid JSON
                }
              }
            }
          }

          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      }
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
