// Email notification helper using the Tivly backend endpoint

const EMAIL_ENDPOINT = 'https://api.tivly.se/send-kontakt-email';

export interface TranscriptionEmailData {
  userEmail: string;
  userName?: string;
  meetingTitle: string;
  meetingId: string;
}

export async function sendTranscriptionCompleteEmail(data: TranscriptionEmailData): Promise<boolean> {
  try {
    console.log('📧 Sending transcription complete email to:', data.userEmail);
    
    const response = await fetch(EMAIL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subject: `✅ Din transkribering är klar: ${data.meetingTitle}`,
        message: `Hej${data.userName ? ` ${data.userName}` : ''}!

Din transkribering för mötet "${data.meetingTitle}" är nu klar.

Du kan nu visa ditt möte och generera protokoll i Tivly.

Klicka här för att öppna: https://app.tivly.se/library/${data.meetingId}

Med vänliga hälsningar,
Tivly`,
        replyTo: data.userEmail,
        name: data.userName || 'Tivly-användare',
        projectType: 'transcription_complete',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Failed to send transcription email:', response.status, errorText);
      return false;
    }

    console.log('✅ Transcription complete email sent successfully');
    return true;
  } catch (error) {
    console.error('❌ Error sending transcription email:', error);
    return false;
  }
}
