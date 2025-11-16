import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { recipients, subject, message, fileBase64, fileName } = await req.json();

    if (!recipients || recipients.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Inga mottagare angivna' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    console.log(`Sending protocol email to ${recipients.length} recipients`);

    // Generate beautiful minimalist HTML email
    const htmlContent = `
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
                <table width="600" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="padding-bottom: 50px; border-bottom: 1px solid #f0f0f0;">
                            <h1 style="color: #8B5CF6; margin: 0; font-size: 28px; font-weight: 600; letter-spacing: -0.5px;">Tivly</h1>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
        
        <tr>
            <td align="center" style="padding: 50px 20px;">
                <table width="600" cellpadding="0" cellspacing="0">
                    <tr>
                        <td>
                            <h2 style="color: #1a1a1a; margin: 0 0 24px 0; font-size: 28px; font-weight: 600; line-height: 1.3;">${subject}</h2>
                            
                            <p style="color: #4a4a4a; font-size: 17px; line-height: 1.7; margin: 0 0 30px 0; white-space: pre-wrap;">
${message}
                            </p>
                            
                            <div style="background-color: #f9fafb; padding: 24px; border-radius: 8px; margin: 30px 0;">
                                <p style="color: #6b7280; font-size: 15px; margin: 0 0 12px 0; font-weight: 500;">📎 Bifogad fil:</p>
                                <p style="color: #1a1a1a; font-size: 16px; margin: 0; font-weight: 600;">${fileName}</p>
                            </div>

                            <table cellpadding="0" cellspacing="0" style="margin: 40px 0;">
                                <tr>
                                    <td>
                                        <a href="https://app.tivly.se" style="background-color: #8B5CF6; color: #ffffff; text-decoration: none; padding: 14px 32px; font-size: 16px; font-weight: 500; display: inline-block; border-radius: 6px; letter-spacing: 0.3px;">Öppna Tivly →</a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
        
        <tr>
            <td align="center" style="padding: 50px 20px 60px 20px;">
                <table width="600" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="padding-top: 50px; border-top: 1px solid #f0f0f0;">
                            <p style="color: #9ca3af; font-size: 14px; line-height: 1.6; margin: 0 0 8px 0;">
                                Detta mail är skickat från <strong style="color: #8B5CF6;">Tivly</strong> – din smarta assistent för mötesprotokoll.
                            </p>
                            <p style="color: #d1d5db; font-size: 13px; margin: 0;">
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
    `;

    const textContent = `${subject}\n\n${message}\n\nBifogad fil: ${fileName}\n\nÖppna Tivly: https://app.tivly.se`;

    // Send email to all recipients
    const emailPromises = recipients.map(async (email: string) => {
      const emailData: any = {
        from: 'Tivly <noreply@tivly.se>',
        to: [email],
        subject: subject,
        html: htmlContent,
        text: textContent,
      };

      // Add attachment if provided
      if (fileBase64 && fileName) {
        emailData.attachments = [
          {
            filename: fileName,
            content: fileBase64,
          },
        ];
      }

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify(emailData),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Failed to send email to ${email}: ${errorData}`);
      }

      return response.json();
    });

    const results = await Promise.all(emailPromises);
    console.log('All emails sent successfully:', results);

    return new Response(
      JSON.stringify({ success: true, results }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in send-protocol-email function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
