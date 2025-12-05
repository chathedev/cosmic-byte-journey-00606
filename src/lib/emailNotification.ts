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
    const response = await fetch(EMAIL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subject: `Din transkribering är klar: ${data.meetingTitle}`,
        message: `Hej${data.userName ? ` ${data.userName}` : ''}!\n\nDin transkribering för mötet "${data.meetingTitle}" är nu klar.\n\nDu kan nu visa ditt möte och generera protokoll i Tivly.\n\nMed vänliga hälsningar,\nTivly`,
        replyTo: 'support@tivly.se',
        name: data.userName || 'Tivly-användare',
        projectType: 'transcription_complete',
      }),
    });

    if (!response.ok) {
      console.error('Failed to send transcription email:', await response.text());
      return false;
    }

    console.log('✅ Transcription complete email sent to:', data.userEmail);
    return true;
  } catch (error) {
    console.error('Error sending transcription email:', error);
    return false;
  }
}
