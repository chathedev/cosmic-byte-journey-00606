// Email notification helper using the Tivly backend endpoint

const EMAIL_ENDPOINT = 'https://api.tivly.se/notifications/email';

// Always use app.tivly.se for email links - emails open in web browsers, not native apps
const WEB_APP_URL = 'https://app.tivly.se';

// Key for tracking if first meeting email was sent
const FIRST_MEETING_EMAIL_SENT_KEY = 'tivly_first_meeting_email_sent';

export interface TranscriptionEmailData {
  userEmail: string;
  userName?: string;
  meetingTitle: string;
  meetingId: string;
  authToken: string;
}

export interface FeedbackEmailData {
  userEmail: string;
  userName?: string;
  authToken: string;
}

export async function sendTranscriptionCompleteEmail(data: TranscriptionEmailData): Promise<boolean> {
  try {
    console.log('📧 Sending transcription complete email to:', data.userEmail);
    
    // Use simple /library URL - no meeting ID in URL
    const libraryUrl = `${WEB_APP_URL}/library`;
    
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
            <a href="${libraryUrl}" 
               style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 500; margin: 16px 0;">
              Öppna biblioteket
            </a>
            <p style="color: #666; font-size: 14px; margin-top: 24px;">
              Med vänliga hälsningar,<br/>
              <strong>Tivly</strong>
            </p>
          </div>
        `,
        text: `Hej${data.userName ? ` ${data.userName}` : ''}!\n\nDin transkribering för mötet "${data.meetingTitle}" är nu klar.\n\nDu kan nu visa ditt möte och generera protokoll i Tivly.\n\nÖppna biblioteket: ${libraryUrl}\n\nMed vänliga hälsningar,\nTivly`,
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

// Check if this is the user's first meeting (no email sent yet)
export function isFirstMeetingEmailNeeded(): boolean {
  return localStorage.getItem(FIRST_MEETING_EMAIL_SENT_KEY) !== 'true';
}

// Mark first meeting email as sent
export function markFirstMeetingEmailSent(): void {
  localStorage.setItem(FIRST_MEETING_EMAIL_SENT_KEY, 'true');
}

// Send feedback request email after first meeting
export async function sendFirstMeetingFeedbackEmail(data: FeedbackEmailData): Promise<boolean> {
  // Check if already sent
  if (!isFirstMeetingEmailNeeded()) {
    console.log('📧 First meeting feedback email already sent, skipping');
    return false;
  }

  try {
    console.log('📧 Sending first meeting feedback email to:', data.userEmail);
    
    const feedbackUrl = `${WEB_APP_URL}/feedback`;
    
    const response = await fetch(EMAIL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${data.authToken}`,
      },
      body: JSON.stringify({
        recipients: [data.userEmail],
        subject: '💬 Hur fungerar Tivly för dig?',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 20px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="display: inline-block; width: 64px; height: 64px; background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); border-radius: 16px; margin-bottom: 16px;"></div>
            </div>
            
            <h1 style="color: #1a1a1a; font-size: 24px; font-weight: 600; text-align: center; margin-bottom: 16px;">
              Grattis till ditt första möte! 🎉
            </h1>
            
            <p style="color: #4b5563; font-size: 16px; line-height: 1.7; text-align: center; margin-bottom: 24px;">
              Hej${data.userName ? ` ${data.userName}` : ''}! Vi såg att du precis skapade ditt första möte i Tivly. 
              <strong>Hur fungerar det för dig?</strong>
            </p>
            
            <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
              <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0;">
                Din feedback hjälper oss att göra Tivly bättre för alla användare. 
                Det tar bara en minut att berätta vad du tycker!
              </p>
            </div>
            
            <div style="text-align: center; margin-bottom: 32px;">
              <a href="${feedbackUrl}" 
                 style="display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);">
                Ge feedback
              </a>
            </div>
            
            <p style="color: #6b7280; font-size: 14px; text-align: center; margin-bottom: 8px;">
              Har du frågor? Svara bara på detta mejl så hjälper vi dig!
            </p>
            
            <p style="color: #9ca3af; font-size: 13px; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 24px;">
              Med vänliga hälsningar,<br/>
              <strong style="color: #6b7280;">Teamet bakom Tivly</strong>
            </p>
          </div>
        `,
        text: `Grattis till ditt första möte!\n\nHej${data.userName ? ` ${data.userName}` : ''}! Vi såg att du precis skapade ditt första möte i Tivly. Hur fungerar det för dig?\n\nDin feedback hjälper oss att göra Tivly bättre för alla användare. Det tar bara en minut att berätta vad du tycker!\n\nGe feedback: ${feedbackUrl}\n\nHar du frågor? Svara bara på detta mejl så hjälper vi dig!\n\nMed vänliga hälsningar,\nTeamet bakom Tivly`,
        category: 'first-meeting-feedback',
        metadata: {},
      }),
    });

    const result = await response.json();
    
    if (!response.ok || !result.ok) {
      console.error('❌ Failed to send first meeting feedback email:', response.status, result.message || result);
      return false;
    }

    // Mark as sent so we don't send again
    markFirstMeetingEmailSent();
    console.log('✅ First meeting feedback email sent successfully');
    return true;
  } catch (error) {
    console.error('❌ Error sending first meeting feedback email:', error);
    return false;
  }
}
