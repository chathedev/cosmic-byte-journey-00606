import { supabase } from "@/integrations/supabase/client";

export async function generateMeetingTitle(transcript: string): Promise<string> {
  try {
    if (!transcript || transcript.trim().length < 10) {
      return `Möte ${new Date().toLocaleDateString('sv-SE')}`;
    }

    const { data, error } = await supabase.functions.invoke('generate-meeting-title', {
      body: { transcript }
    });

    if (error) {
      console.error('Error generating title:', error);
      // Fallback to simple title
      const words = transcript.trim().split(/\s+/).slice(0, 8).join(' ');
      return words.length > 50 ? words.substring(0, 47) + '...' : words;
    }

    return data?.title || `Möte ${new Date().toLocaleDateString('sv-SE')}`;
  } catch (error) {
    console.error('Failed to generate title:', error);
    // Fallback to simple title
    const words = transcript.trim().split(/\s+/).slice(0, 8).join(' ');
    return words.length > 50 ? words.substring(0, 47) + '...' : words;
  }
}
