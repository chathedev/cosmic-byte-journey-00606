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
  // If SIS is disabled we may still get word-level tokens with speakerId.
  // In that case we can reconstruct without diarization speakers.
  if (!speakers || speakers.length === 0) {
    if (words && words.length > 0) {
      return reconstructFromWordSpeakerIds(words, speakerNames);
    }
    return [];
  }

  // Build ordered list of speaker labels for indexing
  const speakerLabels = speakers.map((s) => s.label);
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
          text: currentWords.map((w) => (w as any).word || (w as any).text || '').join(' ').trim(),
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
        text: currentWords.map((w) => (w as any).word || (w as any).text || '').join(' ').trim(),
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
 * Reconstruct segments directly from word-level speaker ids.
 * This is useful when SIS/diarization speakers payload is missing/disabled,
 * but the backend still returns per-word speaker labels.
 */
function reconstructFromWordSpeakerIds(
  words: TranscriptWord[],
  speakerNames: Record<string, string>
): ReconstructedSegment[] {
  const segments: ReconstructedSegment[] = [];
  const speakerIndex = new Map<string, number>();
  const getIdx = (id: string) => {
    if (!speakerIndex.has(id)) speakerIndex.set(id, speakerIndex.size);
    return speakerIndex.get(id) ?? 0;
  };

  let currentSpeaker: string | null = null;
  let currentTokens: string[] = [];
  let segmentStart = 0;
  let segmentEnd = 0;

  const flush = () => {
    if (!currentSpeaker || currentTokens.length === 0) return;
    const idx = getIdx(currentSpeaker);
    segments.push({
      speaker: currentSpeaker,
      speakerName: getSpeakerDisplayName(currentSpeaker, speakerNames, idx),
      start: segmentStart,
      end: segmentEnd,
      text: currentTokens.join(' ').trim(),
    });
    currentTokens = [];
  };

  for (const w of words as any[]) {
    const speakerRaw = w.speakerId ?? w.speaker ?? 'unknown';
    const speaker = String(speakerRaw || 'unknown');
    const token = String(w.word ?? w.text ?? '').trim();

    if (!token) continue;

    if (currentSpeaker !== null && speaker !== currentSpeaker) {
      flush();
      currentSpeaker = speaker;
      segmentStart = w.start;
      segmentEnd = w.end;
      currentTokens.push(token);
      continue;
    }

    if (currentTokens.length === 0) {
      segmentStart = w.start;
    }

    currentSpeaker = speaker;
    segmentEnd = w.end;
    currentTokens.push(token);
  }

  flush();
  return mergeConsecutiveSegments(segments);
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

  // If no speaker segments, return empty
  if (allSegments.length === 0) {
    console.log('[Reconstruct] No speaker segments found');
    return [];
  }

  // Sort by start time
  allSegments.sort((a, b) => a.start - b.start);

  console.log('[Reconstruct] All segments sorted:', allSegments.length);

  // DON'T merge consecutive segments from same speaker - keep them separate for proper turn display
  // Only merge if they're overlapping or very close (< 0.5s gap)
  const merged: { speaker: string; start: number; end: number }[] = [];
  for (const seg of allSegments) {
    const last = merged[merged.length - 1];
    // Only merge if same speaker AND segments are overlapping/touching
    if (last && last.speaker === seg.speaker && seg.start <= last.end + 0.1) {
      last.end = Math.max(last.end, seg.end);
    } else {
      merged.push({ ...seg });
    }
  }

  console.log('[Reconstruct] Merged segments:', merged.length);

  // Strip speaker labels from transcript for clean word extraction
  const stripSpeakerLabels = (text: string): string => {
    if (!text) return '';
    return text
      .replace(/(^|\n)\s*(\[?(?:talare|speaker)[_\s-]?[A-Z0-9]+\]?)\s*[:\-]\s*/gi, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Calculate total duration for proportional text splitting
  const totalDuration = merged.reduce((sum, s) => {
    const start = typeof s.start === 'number' ? s.start : 0;
    const end = typeof s.end === 'number' ? s.end : start;
    return sum + Math.max(0, end - start);
  }, 0);
  
  const words = stripSpeakerLabels(transcript).split(/\s+/).filter((w) => w.trim());
  const totalWords = words.length;

  if (totalWords === 0) {
    console.log('[Reconstruct] No words in transcript');
    return [];
  }

  // Build speaker labels list for indexing
  const speakerLabels = [...new Set(speakers.map((s) => s.label))];
  const getSpeakerIndexLocal = (label: string) => {
    const idx = speakerLabels.indexOf(label);
    return idx >= 0 ? idx : speakerLabels.length;
  };

  // Distribute words proportionally to segment duration
  const result: ReconstructedSegment[] = [];
  let wordIndex = 0;

  for (let i = 0; i < merged.length; i++) {
    const seg = merged[i];
    const isLast = i === merged.length - 1;
    
    const start = typeof seg.start === 'number' ? seg.start : 0;
    const end = typeof seg.end === 'number' ? seg.end : start;
    const segmentDuration = Math.max(0, end - start);
    
    let segmentWordCount: number;
    if (isLast) {
      // Last segment gets all remaining words
      segmentWordCount = Math.max(0, totalWords - wordIndex);
    } else if (totalDuration > 0 && segmentDuration > 0) {
      // Proportional distribution based on duration
      segmentWordCount = Math.max(1, Math.round((segmentDuration / totalDuration) * totalWords));
      // Don't exceed remaining words
      segmentWordCount = Math.min(segmentWordCount, totalWords - wordIndex);
    } else {
      // No timing info: split evenly
      const remaining = merged.length - i;
      segmentWordCount = Math.max(1, Math.ceil((totalWords - wordIndex) / remaining));
    }
    
    const segmentWords = words.slice(wordIndex, wordIndex + segmentWordCount);
    wordIndex += segmentWordCount;

    const speakerIndex = getSpeakerIndexLocal(seg.speaker);
    const speakerName = getSpeakerDisplayName(seg.speaker, speakerNames, speakerIndex);

    result.push({
      speaker: seg.speaker,
      speakerName,
      start,
      end,
      text: segmentWords.join(' '),
    });
  }

  // Safety: add any remaining words to the last segment
  if (wordIndex < words.length && result.length > 0) {
    const lastSeg = result[result.length - 1];
    const remaining = words.slice(wordIndex).join(' ');
    lastSeg.text = `${lastSeg.text} ${remaining}`.trim();
  }

  console.log('[Reconstruct] Result segments:', result.length, result.map((r) => `${r.speaker}:${r.speakerName}`));

  return result;
}

/**
 * Validate that reconstructed segment texts match the canonical transcript
 */
function validateSegmentsAgainstTranscript(
  segments: ReconstructedSegment[],
  transcript: string
): boolean {
  if (!transcript?.trim() || segments.length === 0) return true;

  const stripSpeakerLabels = (text: string): string => {
    if (!text) return '';
    return text
      .replace(/(^|\n)\s*(\[?(?:talare|speaker)[_\s-]?[A-Z0-9]+\]?)\s*[:\-]\s*/gi, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const normalize = (text: string): string => {
    if (!text || typeof text !== 'string') return '';
    return stripSpeakerLabels(text).toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  };

  const segmentText = normalize(segments.map((s) => String(s.text || '')).join(' '));
  const fullText = normalize(transcript);

  if (!segmentText || !fullText) return false;

  // Check length ratio
  const ratio = segmentText.length / Math.max(1, fullText.length);
  if (ratio < 0.6 || ratio > 1.4) return false;

  // Check word count ratio
  const segmentWords = segmentText.split(/\s+/).filter(Boolean);
  const fullWords = fullText.split(/\s+/).filter(Boolean);
  const wordRatio = segmentWords.length / Math.max(1, fullWords.length);
  if (wordRatio < 0.6 || wordRatio > 1.4) return false;

  return true;
}

/**
 * Process ASR status response and reconstruct transcriptSegments
 * This should be called when processing ASR polling results
 * 
 * IMPORTANT: Always validates reconstructed text against canonical transcript
 * to ensure consistency between view and edit modes
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
  const canonicalTranscript = response.transcript?.trim() || '';

  // Try reconstruction first
  const reconstructed = reconstructTranscriptSegments(
    response.words,
    speakers,
    speakerNames,
    canonicalTranscript
  );

  // Validate reconstructed segments match canonical transcript
  if (reconstructed.length > 0) {
    if (canonicalTranscript && !validateSegmentsAgainstTranscript(reconstructed, canonicalTranscript)) {
      console.log('[Reconstruct] Validation failed, segments don\'t match transcript - will redistribute in UI');
    }
    return reconstructed;
  }

  // Fallback: convert existing transcriptSegments to our format
  if (response.transcriptSegments && response.transcriptSegments.length > 0) {
    const speakerLabels = [
      ...new Set(response.transcriptSegments.map((s: any) => s.speakerId || s.speaker || 'unknown')),
    ];

    const converted = response.transcriptSegments.map((seg: any, idx) => {
      const speakerId = seg.speakerId || seg.speaker || 'unknown';
      const speakerIndex = speakerLabels.indexOf(speakerId);
      return {
        speaker: speakerId,
        speakerName: getSpeakerDisplayName(
          speakerId,
          speakerNames,
          speakerIndex >= 0 ? speakerIndex : idx
        ),
        start: typeof seg.start === 'number' ? seg.start : 0,
        end: typeof seg.end === 'number' ? seg.end : 0,
        text: typeof seg.text === 'string' ? seg.text : '',
      };
    });

    // Validate converted segments
    if (canonicalTranscript && !validateSegmentsAgainstTranscript(converted, canonicalTranscript)) {
      console.log('[Reconstruct] Converted segments validation failed - UI will redistribute');
    }

    return converted;
  }

  return [];
}
