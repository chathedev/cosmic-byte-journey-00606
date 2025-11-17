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
    const { prompt } = await req.json();

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'Prompt is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    console.log('Generating email from prompt:', prompt);

    const systemPrompt = `Du är en expert på att skapa moderna, minimalistiska email för Tivly.

KRITISKA INSTRUKTIONER:
- ALLTID på SVENSKA
- Professionell, vänlig och respektfull ton
- Modern, minimalistisk design - INGEN kortdesign (cards)
- Clean layout med mycket whitespace
- Tivlys lila färgschema: #8B5CF6
- ALLA länkar: https://app.tivly.se

DESIGN PRINCIPER (Minimalistisk & Modern):
✓ Enkel, ren layout utan boxar och kort
✓ Mycket whitespace och andningsrum
✓ Flat design - inga skuggor eller 3D-effekter
✓ Tunn, elegant header med logotyp
✓ Tydlig hierarki med stor, läsbar text
✓ Subtila lila accenter - inte överväldigande
✓ Minimal footer med endast nödvändig info

HTML MALL (Modern & Minimalistisk):
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; background-color: #ffffff;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff;">
        <tr>
            <td align="center" style="padding: 60px 20px 0 20px;">
                <!-- Simple header -->
                <table width="600" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="padding-bottom: 50px; border-bottom: 1px solid #f0f0f0;">
                            <h1 style="color: #8B5CF6; margin: 0; font-size: 28px; font-weight: 600; letter-spacing: -0.5px;">Tivly</h1>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
        
        <!-- Main content -->
        <tr>
            <td align="center" style="padding: 50px 20px;">
                <table width="600" cellpadding="0" cellspacing="0">
                    <tr>
                        <td>
                            <h2 style="color: #1a1a1a; margin: 0 0 24px 0; font-size: 32px; font-weight: 600; line-height: 1.2;">Rubrik här</h2>
                            
                            <p style="color: #4a4a4a; font-size: 17px; line-height: 1.7; margin: 0 0 30px 0;">
                                Huvudtext här...
                            </p>
                            
                            <!-- Clean CTA button -->
                            <table cellpadding="0" cellspacing="0" style="margin: 40px 0;">
                                <tr>
                                    <td>
                                        <a href="https://app.tivly.se" style="background-color: #8B5CF6; color: #ffffff; text-decoration: none; padding: 14px 32px; font-size: 16px; font-weight: 500; display: inline-block; border-radius: 6px; letter-spacing: 0.3px;">Kom igång →</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
        
        <!-- Minimal footer -->
        <tr>
            <td align="center" style="padding: 50px 20px 60px 20px;">
                <table width="600" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="border-top: 1px solid #f0f0f0; padding-top: 40px;">
                            <p style="color: #999999; font-size: 14px; line-height: 1.6; margin: 0 0 8px 0; text-align: center;">Med vänliga hälsningar, Tivly</p>
                            <p style="color: #cccccc; font-size: 13px; margin: 0; text-align: center;">
                                <a href="https://app.tivly.se" style="color: #8B5CF6; text-decoration: none;">app.tivly.se</a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>

VIKTIGA STYLING REGLER:
- Använd system fonts: -apple-system, BlinkMacSystemFont, 'Segoe UI'
- Vit bakgrund (#ffffff) - ingen grå/lila bakgrund
- INGA skuggor eller border-radius på containers
- Tunna borders (1px solid #f0f0f0) för separation
- Stort line-height (1.6-1.8) för läsbarhet
- Generösa margins mellan element (24-40px)
- Lila (#8B5CF6) endast för accenter: logotyp, knappar, länkar
- Text: mörk (#1a1a1a) för rubriker, medium (#4a4a4a) för brödtext
- Knappar: enkla, rounded corners (6px), ingen gradient

RETURFORMAT:
{
  "htmlBody": "komplett minimalistisk HTML",
  "textBody": "ren text-version",
  "subject": "kort, tydlig ämnesrad"
}

ENDAST JSON - ingen markdown eller förklaringar!`;


    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: systemPrompt },
              { text: `Skapa ett professionellt email baserat på denna förfrågan: ${prompt}` }
            ]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
            responseMimeType: "application/json"
          }
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Kunde inte generera email' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    let content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    console.log('Raw AI response:', content);

    // Parse the JSON response
    let parsedContent;
    try {
      // Remove markdown code blocks if present
      const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedContent = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      console.error('Content was:', content);
      throw new Error('Failed to parse AI response. Please try again.');
    }

    // Validate the structure
    if (!parsedContent.htmlBody || !parsedContent.textBody || !parsedContent.subject) {
      throw new Error('Invalid response format from AI');
    }

    console.log('Successfully generated email');

    return new Response(
      JSON.stringify(parsedContent),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-email function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
