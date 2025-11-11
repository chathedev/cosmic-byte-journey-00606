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
    const { transcript, meetingName, agenda } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const wordCount = transcript.trim().split(/\s+/).length;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: "Du är en mötesassistent som kan arbeta på både svenska och engelska. Analysera transkriptionen och ge en detaljerad strukturerad sammanfattning. Svara på samma språk som transkriptionen är skriven på (svenska eller engelska)."
          },
          {
            role: "user",
            content: `Analyze the following meeting transcript and create a detailed protocol.

Meeting: ${meetingName || 'Unnamed Meeting'}
Length: ${wordCount} words
${agenda ? `\nMeeting Agenda:\n${agenda}\n` : ''}

Transcript:
${transcript}

Create a detailed protocol with:
1. A summary (3-4 sentences)
2. Main points (5-8 detailed bullet points with substantial content)
3. Decisions that were made
4. Smart action items with:
   - Title (clear, actionable task)
   - Description (what needs to be done)
   - Owner (who should do it - identify from transcript or suggest "To be assigned")
   - Deadline (suggest realistic deadline based on urgency, format: YYYY-MM-DD)
   - Priority (critical/high/medium/low based on importance and urgency)
5. Next meeting suggestions (3-5 topics/items that should be discussed at the next meeting based on open issues, action items, and follow-ups from this meeting)

IMPORTANT for action items:
- Identify SPECIFIC people mentioned in the transcript as owners
- Estimate realistic deadlines (1-7 days for critical, 1-2 weeks for high, 2-4 weeks for medium/low)
- Mark as "critical" if it blocks other work or has immediate impact
- Mark as "high" if important but not blocking
- Mark as "medium" for standard follow-ups
- Mark as "low" for nice-to-have improvements

IMPORTANT for next meeting suggestions:
- Suggest 3-5 concrete topics based on unresolved issues from this meeting
- Include follow-ups on action items
- Suggest topics that naturally arise from decisions made
- Keep suggestions specific and actionable

${agenda ? 'NOTE: Use the meeting agenda above to structure the protocol and ensure all agenda items are covered.' : ''}
${wordCount < 50 ? 'NOTE: The transcript is very short. Include a message in the summary that the meeting contained limited information.' : ''}

IMPORTANT: Respond in the SAME LANGUAGE as the transcript (Swedish or English).

Respond in JSON format:
{
  "title": "Meeting title",
  "summary": "Detailed summary",
  "mainPoints": ["detailed point 1", "detailed point 2", ...],
  "decisions": ["decision 1", ...],
  "actionItems": ["action 1", ...],
  "nextMeetingSuggestions": ["suggestion 1", "suggestion 2", ...]
}`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_protocol",
              description: "Skapa ett mötesprotokoll",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  summary: { type: "string" },
                  mainPoints: {
                    type: "array",
                    items: { type: "string" }
                  },
                  decisions: {
                    type: "array",
                    items: { type: "string" }
                  },
                  actionItems: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        description: { type: "string" },
                        owner: { type: "string" },
                        deadline: { type: "string" },
                        priority: { type: "string", enum: ["critical", "high", "medium", "low"] }
                      },
                      required: ["title", "priority"],
                      additionalProperties: false
                    }
                  },
                  nextMeetingSuggestions: {
                    type: "array",
                    items: { type: "string" }
                  }
                },
                required: ["title", "summary", "mainPoints", "decisions", "actionItems", "nextMeetingSuggestions"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "create_protocol" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required, please add credits to your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const result = await response.json();
    console.log("AI response:", JSON.stringify(result));

    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    const content = toolCall?.function?.arguments ? JSON.parse(toolCall.function.arguments) : null;

    if (!content) {
      throw new Error("Failed to parse AI response");
    }

    return new Response(
      JSON.stringify({
        title: content.title || meetingName || 'Mötesprotokoll',
        summary: content.summary || '',
        mainPoints: content.mainPoints || [],
        decisions: content.decisions || [],
        actionItems: content.actionItems || [],
        nextMeetingSuggestions: content.nextMeetingSuggestions || []
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in analyze-meeting function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
