/**
 * Transcript Reconstruction Utility
 * 
 * Reconstructs transcriptSegments from lyraSpeakers/sisSpeakers time segments
 * and word-level timestamps. This ensures the backend response is the single
 * source of truth for speaker attribution.
 * 
 * Flow:
 * 1. Use sisSpeakers (or lyraSpeakers) as source of truth for speaker timing
 * 2. Match words to speaker segments based on timestamps
 * 3. Group consecutive words from the same speaker
 * 4. Return properly attributed transcript segments
 */

import type { SISSpeaker, TranscriptSegment, TranscriptWord } from './asrService';

export interface ReconstructedSegment {
  speaker: string;
  speakerName: string;
  start: number;
  end: number;
  text: string;
}

/**
 * Find which speaker is active at a given timestamp
 * Returns the speaker label or 'unknown' if no match
 */
function findSpeakerAtTime(time: number, speakers: SISSpeaker[]): string {
  for (const speaker of speakers) {
    for (const seg of speaker.segments) {
      // Allow small tolerance for edge cases
      if (time >= seg.start - 0.05 && time <= seg.end + 0.05) {
        return speaker.label;
      }
    }
  }
  return 'unknown';
}

/**
 * Get speaker display name from speakerNames map or generate a fallback
 */
function getSpeakerDisplayName(
  speakerId: string, 
  speakerNames: Record<string, string>,
  speakerIndex: number
): string {
  if (speakerNames[speakerId]) {
    return speakerNames[speakerId];
  }
  
  // Generate fallback name
  const numMatch = speakerId.match(/(?:speaker_?|talare_?)(\d+)/i);
  if (numMatch) {
    return `Talare ${parseInt(numMatch[1], 10) + 1}`;
  }
  
  if (/^[A-Z]$/i.test(speakerId)) {
    return `Talare ${speakerId.toUpperCase()}`;
  }
  
  return `Talare ${speakerIndex + 1}`;
}

/**
 * Reconstruct transcript segments from word-level data and speaker diarization
 * 
 * @param words - Word-level timestamps from transcription
 * @param speakers - Speaker diarization data (sisSpeakers/lyraSpeakers)
 * @param speakerNames - Map of speaker labels to display names
 * @param transcript - Full transcript text (fallback if no word data)
 * @returns Array of properly attributed transcript segments
 */
export function reconstructTranscriptSegments(
  words: TranscriptWord[] | undefined,
  speakers: SISSpeaker[],
  speakerNames: Record<string, string>,
  transcript?: string
): ReconstructedSegment[] {
  // If no speaker data, return empty - let caller handle fallback
  if (!speakers || speakers.length === 0) {
    return [];
  }

  // Build ordered list of speaker labels for indexing
  const speakerLabels = speakers.map(s => s.label);
  const getSpeakerIndex = (label: string) => {
    const idx = speakerLabels.indexOf(label);
    return idx >= 0 ? idx : speakerLabels.length;
  };

  // If we have word-level data, use it for precise reconstruction
  if (words && words.length > 0) {
    const segments: ReconstructedSegment[] = [];
    let currentSpeaker = '';
    let currentWords: TranscriptWord[] = [];
    let segmentStart = 0;

    for (const word of words) {
      // Use word start time to determine speaker
      const wordTime = word.start;
      const speaker = findSpeakerAtTime(wordTime, speakers);
      
      if (speaker !== currentSpeaker && currentWords.length > 0) {
        // Flush current segment
        const speakerIndex = getSpeakerIndex(currentSpeaker);
        segments.push({
          speaker: currentSpeaker,
          speakerName: getSpeakerDisplayName(currentSpeaker, speakerNames, speakerIndex),
          start: segmentStart,
          end: currentWords[currentWords.length - 1].end,
          text: currentWords.map(w => w.word || w.text || '').join(' ').trim(),
        });
        currentWords = [];
        segmentStart = word.start;
      }
      
      if (currentWords.length === 0) {
        segmentStart = word.start;
      }
      
      currentSpeaker = speaker;
      currentWords.push(word);
    }

    // Flush final segment
    if (currentWords.length > 0) {
      const speakerIndex = getSpeakerIndex(currentSpeaker);
      segments.push({
        speaker: currentSpeaker,
        speakerName: getSpeakerDisplayName(currentSpeaker, speakerNames, speakerIndex),
        start: segmentStart,
        end: currentWords[currentWords.length - 1].end,
        text: currentWords.map(w => w.word || w.text || '').join(' ').trim(),
      });
    }

    // Merge consecutive segments from the same speaker
    return mergeConsecutiveSegments(segments);
  }

  // Fallback: use speaker segment times to slice transcript proportionally
  // This is less accurate but works when word-level data is unavailable
  if (transcript && transcript.trim()) {
    return reconstructFromSpeakerTimes(speakers, speakerNames, transcript);
  }

  return [];
}

/**
 * Merge consecutive segments from the same speaker
 */
function mergeConsecutiveSegments(segments: ReconstructedSegment[]): ReconstructedSegment[] {
  if (segments.length === 0) return [];

  const merged: ReconstructedSegment[] = [];
  let current = { ...segments[0] };

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.speaker === current.speaker) {
      // Merge with current
      current.text = `${current.text} ${seg.text}`.trim();
      current.end = seg.end;
    } else {
      merged.push(current);
      current = { ...seg };
    }
  }
  
  merged.push(current);
  return merged;
}

/**
 * Reconstruct segments from speaker time ranges when word-level data is unavailable
 * Creates one segment per speaker turn ordered by start time
 */
function reconstructFromSpeakerTimes(
  speakers: SISSpeaker[],
  speakerNames: Record<string, string>,
  transcript: string
): ReconstructedSegment[] {
  // Flatten all speaker segments with their labels
  const allSegments: { speaker: string; start: number; end: number }[] = [];
  
  for (const speaker of speakers) {
    for (const seg of speaker.segments) {
      allSegments.push({
        speaker: speaker.label,
        start: seg.start,
        end: seg.end,
      });
    }
  }

  // Sort by start time
  allSegments.sort((a, b) => a.start - b.start);

  // Merge consecutive segments from same speaker
  const merged: { speaker: string; start: number; end: number }[] = [];
  for (const seg of allSegments) {
    const last = merged[merged.length - 1];
    if (last && last.speaker === seg.speaker && seg.start - last.end < 1.0) {
      last.end = Math.max(last.end, seg.end);
    } else {
      merged.push({ ...seg });
    }
  }

  // Calculate total duration for proportional text splitting
  const totalDuration = merged.reduce((sum, s) => sum + (s.end - s.start), 0);
  const words = transcript.split(/\s+/);
  const totalWords = words.length;

  // Build speaker labels list for indexing
  const speakerLabels = [...new Set(speakers.map(s => s.label))];
  const getSpeakerIndex = (label: string) => {
    const idx = speakerLabels.indexOf(label);
    return idx >= 0 ? idx : speakerLabels.length;
  };

  // Distribute words proportionally to segment duration
  const result: ReconstructedSegment[] = [];
  let wordIndex = 0;

  for (const seg of merged) {
    const segmentDuration = seg.end - seg.start;
    const segmentWordCount = Math.max(1, Math.round((segmentDuration / totalDuration) * totalWords));
    const segmentWords = words.slice(wordIndex, wordIndex + segmentWordCount);
    wordIndex += segmentWordCount;

    const speakerIndex = getSpeakerIndex(seg.speaker);
    result.push({
      speaker: seg.speaker,
      speakerName: getSpeakerDisplayName(seg.speaker, speakerNames, speakerIndex),
      start: seg.start,
      end: seg.end,
      text: segmentWords.join(' '),
    });
  }

  // Add any remaining words to the last segment
  if (wordIndex < words.length && result.length > 0) {
    const lastSeg = result[result.length - 1];
    lastSeg.text = `${lastSeg.text} ${words.slice(wordIndex).join(' ')}`.trim();
  }

  return result;
}

/**
 * Process ASR status response and reconstruct transcriptSegments
 * This should be called when processing ASR polling results
 */
export function processASRResponseWithReconstruction(
  response: {
    transcript?: string;
    transcriptSegments?: TranscriptSegment[];
    words?: TranscriptWord[];
    sisSpeakers?: SISSpeaker[];
    lyraSpeakers?: SISSpeaker[];
    speakerNames?: Record<string, string>;
    lyraSpeakerNames?: Record<string, string>;
  }
): ReconstructedSegment[] {
  const speakers = response.lyraSpeakers || response.sisSpeakers || [];
  const speakerNames = response.lyraSpeakerNames || response.speakerNames || {};
  
  // If we have diarization data, reconstruct segments
  if (speakers.length > 0) {
    const reconstructed = reconstructTranscriptSegments(
      response.words,
      speakers,
      speakerNames,
      response.transcript
    );
    
    if (reconstructed.length > 0) {
      return reconstructed;
    }
  }

  // Fallback: convert existing transcriptSegments to our format
  if (response.transcriptSegments && response.transcriptSegments.length > 0) {
    const speakerLabels = [...new Set(
      response.transcriptSegments.map(s => s.speakerId || s.speaker || 'unknown')
    )];
    
    return response.transcriptSegments.map((seg, idx) => {
      const speakerId = seg.speakerId || seg.speaker || 'unknown';
      const speakerIndex = speakerLabels.indexOf(speakerId);
      return {
        speaker: speakerId,
        speakerName: getSpeakerDisplayName(speakerId, speakerNames, speakerIndex >= 0 ? speakerIndex : idx),
        start: seg.start,
        end: seg.end,
        text: seg.text,
      };
    });
  }

  return [];
}
