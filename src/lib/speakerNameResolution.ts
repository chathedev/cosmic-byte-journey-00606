// Centralized helpers to reliably map backend speaker aliases (speaker_1)
// to transcript speaker ids (often speaker_0) and vice versa.

export const isGenericSpeakerName = (name: unknown): boolean => {
  const raw = typeof name === 'string' ? name : String(name ?? '');
  const lower = raw.toLowerCase().trim();
  if (!lower) return true;
  return /^(talare|speaker)[_\s-]?\d*$/i.test(lower) || lower === 'unknown' || lower === 'okänd';
};

/**
 * Normalize a label/id into a backend-style key: speaker_0, speaker_1, ...
 * NOTE: This does NOT apply any offset; it only normalizes formatting.
 */
export const normalizeSpeakerBackendKey = (raw: unknown): string => {
  const s = String(raw ?? '').trim();
  if (!s) return '';

  if (/^speaker[_-]\d+$/i.test(s)) return s.toLowerCase().replace('-', '_');
  if (/^speaker_\d+$/i.test(s)) return s.toLowerCase();

  // Convert "Talare 1", "Speaker 1", "speaker-1" => speaker_1
  const match = s.match(/(?:speaker|talare)[_\s-]?(\d+)/i);
  if (match) return `speaker_${match[1]}`;

  const numMatch = s.match(/(\d+)/);
  if (numMatch) return `speaker_${numMatch[1]}`;

  return s.toLowerCase().replace(/\s+/g, '_');
};

/**
 * Parse a transcript-side speaker index (0-based).
 * - speaker_0 -> 0
 * - speaker-0 -> 0
 * - Talare 1 / Speaker 1 -> 0 (display labels are 1-based)
 */
export const parseTranscriptSpeakerIndex = (raw: unknown): number | null => {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;

  // Explicit id formats (0-based)
  let m = s.match(/^speaker[_-](\d+)$/i);
  if (m) return parseInt(m[1], 10);

  // Display label formats (1-based)
  m = s.match(/^(?:talare|speaker)[\s-]+(\d+)$/i);
  if (m) return Math.max(0, parseInt(m[1], 10) - 1);

  // Sometimes labels come underscored: talare_1 (treat as 1-based)
  m = s.match(/^talare[_-]?(\d+)$/i);
  if (m) return Math.max(0, parseInt(m[1], 10) - 1);

  return null;
};

/**
 * Compute offset between transcript speaker ids (often 0-based) and backend alias keys (sometimes 1-based).
 * Example: transcript has speaker_0 but backend speakerNames has speaker_1 => offset = 1
 */
export const computeSpeakerIndexOffset = (
  transcriptSpeakerIds: Array<unknown>,
  speakerNames: Record<string, unknown>
): number => {
  const transcriptIndices = transcriptSpeakerIds
    .map(parseTranscriptSpeakerIndex)
    .filter((n): n is number => n != null);

  if (transcriptIndices.length === 0) return 0;
  const transcriptMin = Math.min(...transcriptIndices);

  const backendIndices = Object.entries(speakerNames)
    .filter(([, value]) => !isGenericSpeakerName(value))
    .map(([key]) => {
      const normalized = normalizeSpeakerBackendKey(key);
      const m = normalized.match(/^speaker_(\d+)$/i);
      return m ? parseInt(m[1], 10) : null;
    })
    .filter((n): n is number => n != null);

  if (backendIndices.length === 0) return 0;
  const backendMin = Math.min(...backendIndices);

  return backendMin - transcriptMin;
};

export const getBackendSpeakerKeyForTranscriptId = (speakerId: unknown, offset: number): string => {
  const idx = parseTranscriptSpeakerIndex(speakerId);
  if (idx == null) return normalizeSpeakerBackendKey(speakerId);
  const adjusted = idx + offset;
  return `speaker_${Math.max(0, adjusted)}`;
};

export const lookupSpeakerNameRecord = (
  speakerNames: Record<string, string>,
  speakerId: unknown,
  offset: number
): string | undefined => {
  const rawId = String(speakerId ?? '');
  if (!rawId) return undefined;

  const candidates = [
    rawId,
    normalizeSpeakerBackendKey(rawId),
    getBackendSpeakerKeyForTranscriptId(rawId, offset),
  ].filter(Boolean);

  for (const key of candidates) {
    const value = speakerNames[key];
    if (value && !isGenericSpeakerName(value)) return value;
  }

  // Fuzzy: compare normalized backend keys (handles different separators/casing)
  const normalizedTarget = normalizeSpeakerBackendKey(rawId);
  const normalizedOffsetTarget = normalizeSpeakerBackendKey(getBackendSpeakerKeyForTranscriptId(rawId, offset));
  for (const [key, value] of Object.entries(speakerNames)) {
    if (!value || isGenericSpeakerName(value)) continue;
    const nk = normalizeSpeakerBackendKey(key);
    if (nk === normalizedTarget || nk === normalizedOffsetTarget) return value;
  }

  return undefined;
};

export const lookupSpeakerNameMap = (
  speakerNameMap: Map<string, string>,
  speakerId: unknown,
  offset: number
): string | undefined => {
  const rawId = String(speakerId ?? '');
  if (!rawId) return undefined;

  const candidates = [
    rawId,
    normalizeSpeakerBackendKey(rawId),
    getBackendSpeakerKeyForTranscriptId(rawId, offset),
  ].filter(Boolean);

  for (const key of candidates) {
    const value = speakerNameMap.get(key);
    if (value) return value;
  }

  const normalizedTarget = normalizeSpeakerBackendKey(rawId);
  const normalizedOffsetTarget = normalizeSpeakerBackendKey(getBackendSpeakerKeyForTranscriptId(rawId, offset));
  for (const [key, value] of speakerNameMap.entries()) {
    const nk = normalizeSpeakerBackendKey(key);
    if (nk === normalizedTarget || nk === normalizedOffsetTarget) return value;
  }

  return undefined;
};
