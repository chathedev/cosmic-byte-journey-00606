import { generateMeetingTitleAI } from "@/lib/geminiApi";

export async function generateMeetingTitle(transcript: string, isEnterprise = false): Promise<string> {
  try {
    return await generateMeetingTitleAI(transcript, isEnterprise);
  } catch (error) {
    console.error('Failed to generate title:', error);
    // Fallback to simple title
    if (!transcript || transcript.trim().length < 10) {
      return `Möte ${new Date().toLocaleDateString('sv-SE')}`;
    }
    const words = transcript.trim().split(/\s+/).slice(0, 8).join(' ');
    return words.length > 50 ? words.substring(0, 47) + '...' : words;
  }
}
