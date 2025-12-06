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

    const { messages, transcript } = await req.json();
    
    if (!Array.isArray(messages)) {
      throw new Error("Messages array is required");
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const systemPrompt = `Du är en hjälpsam och kreativ AI-assistent för mötesanalys. Du hjälper användare att få ut maximalt värde från sina möten.
    
Du har tillgång till följande mötesinnehåll:
${transcript || "Ingen transkription tillgänglig ännu."}

VIKTIGA INSTRUKTIONER:
- Svara ALLTID på samma språk som användaren (svenska eller engelska)
- Var hjälpsam, kreativ och proaktiv
- Ge ALDRIG svar som "jag vet inte" eller "det finns ingen information"
- Om användaren frågar om något som inte finns i transkriptionen, ge istället FÖRSLAG och REKOMMENDATIONER baserat på kontexten
- Om användaren frågar "vad borde vi prata om?" eller liknande, ge kreativa och relevanta förslag för nästa möte baserat på mötesinnehållet

Ditt jobb är att:
1. Svara på frågor om mötet med precision
2. Sammanfatta och analysera mötesinnehåll
3. Identifiera beslut, åtgärdspunkter och viktiga ämnen
4. Ge proaktiva förslag för uppföljning och nästa steg
5. Föreslå agendapunkter för kommande möten baserat på diskussioner
6. Hitta mönster och insikter i mötesdata

FORMAT:
- Använd punktlistor för tydlighet
- Markera viktiga saker med **fetstil**
- Håll svar koncisa men informativa
- Använd emojis sparsamt för att göra svar mer engagerande (📋 ✅ 💡 📌)`;

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
