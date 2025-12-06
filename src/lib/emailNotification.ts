// Email notification helper using the Tivly backend endpoint

const EMAIL_ENDPOINT = 'https://api.tivly.se/notifications/email';

// Always use app.tivly.se for email links - emails open in web browsers, not native apps
const WEB_APP_URL = 'https://app.tivly.se';

export interface TranscriptionEmailData {
  userEmail: string;
  userName?: string;
  meetingTitle: string;
  meetingId: string;
  authToken: string;
}

export async function sendTranscriptionCompleteEmail(data: TranscriptionEmailData): Promise<boolean> {
  try {
    console.log('📧 Sending transcription complete email to:', data.userEmail);
    
    const meetingUrl = `${WEB_APP_URL}/library/${data.meetingId}`;
    
    const response = await fetch(EMAIL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${data.authToken}`,
      },
      body: JSON.stringify({
        recipients: [data.userEmail],
        subject: `✅ Din transkribering är klar: ${data.meetingTitle}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1a1a1a; margin-bottom: 16px;">Hej${data.userName ? ` ${data.userName}` : ''}!</h2>
            <p style="color: #333; font-size: 16px; line-height: 1.6;">
              Din transkribering för mötet <strong>"${data.meetingTitle}"</strong> är nu klar.
            </p>
            <p style="color: #333; font-size: 16px; line-height: 1.6;">
              Du kan nu visa ditt möte och generera protokoll i Tivly.
            </p>
            <a href="${meetingUrl}" 
               style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 500; margin: 16px 0;">
              Öppna mötet
            </a>
            <p style="color: #666; font-size: 14px; margin-top: 24px;">
              Med vänliga hälsningar,<br/>
              <strong>Tivly</strong>
            </p>
          </div>
        `,
        text: `Hej${data.userName ? ` ${data.userName}` : ''}!\n\nDin transkribering för mötet "${data.meetingTitle}" är nu klar.\n\nDu kan nu visa ditt möte och generera protokoll i Tivly.\n\nÖppna mötet: ${meetingUrl}\n\nMed vänliga hälsningar,\nTivly`,
        category: 'transcription-complete',
        metadata: { meetingId: data.meetingId },
      }),
    });

    const result = await response.json();
    
    if (!response.ok || !result.ok) {
      console.error('❌ Failed to send transcription email:', response.status, result.message || result);
      return false;
    }

    console.log('✅ Transcription complete email sent successfully');
    return true;
  } catch (error) {
    console.error('❌ Error sending transcription email:', error);
    return false;
  }
}
