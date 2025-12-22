// ASR Service - Async polling flow for transcription
// Flow: 1) Upload file to backend → 2) Poll status by meetingId → 3) Get transcript when complete
// Accepts: MP3, WAV, M4A - backend handles all conversion
// 
// API Response Format (when status: "done"):
// - transcript: string - Full transcript text
// - transcriptSegments: Array<{ speakerId, text, start, end }> - Speaker diarization segments
// - sisStatus: 'queued' | 'processing' | 'done' | 'no_samples' | 'error' | 'disabled' | 'missing_owner'
// - sisMatches: Array<SISMatch> - Speaker identification matches
// - sisMatch: SISMatch - Best match (shortcut to sisMatches[0])
// - sisSpeakers: Array<SISSpeaker> - Speaker payload with matches array
// Accepts: MP3, WAV, M4A - backend handles all conversion

import { debugLog, debugError } from './debugLogger';
import { uploadToAsr } from './asrUpload';
import { resolveBackendMeetingId } from './backgroundUploader';

const BACKEND_API_URL = 'https://api.tivly.se';
const POLL_INTERVAL_MS = 3000; // Poll every 3 seconds
const MAX_POLL_ATTEMPTS = 600; // Max 30 minutes of polling

// SpeechBrain SIS Speaker Match
// Per docs: sisMatches now carry speakerName, speakerLabel, confidencePercent, and matched transcript snippet
// Use speakerNames[label] or sisMatches[i]?.speakerName when rendering the UI instead of exposing raw emails
export interface SISMatch {
  meetingId: string;
  meetingOwnerEmail: string;
  sampleOwnerEmail: string;
  score: number;
  // Per docs: confidencePercent is the similarity score as percentage (0-100)
  // >= 60 means alias is auto-persisted
  confidencePercent: number;
  // Per docs: speakerLabel is the diarization label (e.g., "speaker_0", "meeting")
  speakerLabel?: string;
  // Per docs: speakerName is the friendly alias from voice learning
  speakerName?: string;
  // Per docs: matched transcript snippet
  text?: string | null;
  segments?: Array<{ start: number; end: number }>;
  durationSeconds?: number | null;
  matchedWords?: number | null;
  totalSampleWords?: number | null;
  updatedAt: string;
}

// SIS Speaker Match Entry (used in sisSpeakers.matches array)
export interface SISSpeakerMatch {
  sampleOwnerEmail: string;
  similarity: number;
}

// SpeechBrain Speaker Identification
// Per docs: sisSpeakers[n] carries bestMatchEmail plus the similarity percent
// that shows up as the "secure 70%" badge. The backend resolves labels
// using both sisMatches and sisSpeakers.bestMatchEmail when speakerLabel is missing.
// The speakerLabel is the key to use with speakerNames map.
export interface SISSpeaker {
  // Per docs: label is the diarization label returned by SpeechBrain (e.g., "speaker_0", "meeting")
  // Use this as key with speakerNames map
  label: string;
  segments: Array<{ start: number; end: number }>;
  durationSeconds?: number | null;
  // Per docs: bestMatchEmail links this speaker to an enterprise member
  bestMatchEmail?: string;
  // Per docs: similarity percent for the "secure X%" confidence badge (0.0-1.0)
  similarity?: number;
  // Per docs: speakerName is decorated by backend from stored aliases
  speakerName?: string;
  matches?: SISSpeakerMatch[];
}

// SIS Status types
export type SISStatusType = 
  | 'queued' 
  | 'processing' 
  | 'done' 
  | 'no_samples' 
  | 'error' 
  | 'disabled' 
  | 'missing_owner';

export interface SISStatus {
  status: SISStatusType;
  sisSpeakers?: SISSpeaker[];
  sisMatches?: SISMatch[];
  sisMatch?: SISMatch;
  sisError?: string;
  transcript?: string;
}

export interface ASRResult {
  success: boolean;
  transcript?: string;
  transcriptSegments?: TranscriptSegment[];
  duration?: number;
  processing_time?: number;
  error?: string;
  meetingId?: string;
  sisStatus?: SISStatusType;
  sisMatches?: SISMatch[];
  sisMatch?: SISMatch;
  sisSpeakers?: SISSpeaker[];
}

export interface TranscriptWord {
  word: string;  // Backend uses 'word' not 'text'
  text?: string; // Legacy alias
  start: number;
  end: number;
  confidence?: number;
  speaker?: string;
}

// Backend transcript segment format from ASR
export interface TranscriptSegment {
  id?: number;
  seek?: number;
  speakerId?: string;  // ElevenLabs uses speakerId
  speaker?: string;    // Keep for backwards compatibility
  text: string;
  start: number;
  end: number;
  confidence?: number;
  // Whisper-style fields from backend
  tokens?: number[];
  temperature?: number;
  avg_logprob?: number;
  compression_ratio?: number;
  no_speech_prob?: number;
  words?: TranscriptWord[];
}

// Lyra Learning entry for voice training feedback
// Per docs: sisLearning/lyraLearning entries show when learning is applied
export interface LyraLearningEntry {
  email: string;
  similarity: number;
  similarityPercent?: number; // Alternative field name from some endpoints
  matchedSegments?: number;
  updated?: boolean; // Show "learning applied" badge when true
}

// Re-export for backwards compatibility
export type SISLearningEntry = LyraLearningEntry;

// Backend stage values for detailed progress tracking
export type ASRStage = 'uploading' | 'transcribing' | 'sis_processing' | 'done' | 'error';

export interface ASRStatus {
  meetingId?: string;
  status: 'queued' | 'processing' | 'completed' | 'done' | 'error' | 'failed';
  stage?: ASRStage; // More granular stage from backend
  progress?: number;
  transcript?: string;
  transcriptSegments?: TranscriptSegment[];
  // Word-level timing from backend
  words?: TranscriptWord[];
  error?: string;
  duration?: number;
  // Backend metadata
  engine?: string;
  language?: string;
  durationMs?: number;
  wavDurationSec?: number;
  metadata?: Record<string, any>;
  updatedAt?: string;
  // Legacy SIS fields (still used by backend)
  sisStatus?: SISStatusType;
  sisMatches?: SISMatch[];
  sisMatch?: SISMatch;
  sisSpeakers?: SISSpeaker[];
  sisLearning?: LyraLearningEntry[];
  sisError?: string | null;
  // Lyra mirror fields (preferred for frontend use)
  lyraStatus?: SISStatusType;
  lyraMatches?: SISMatch[];
  lyraMatch?: SISMatch;
  lyraSpeakers?: SISSpeaker[];
  lyraLearning?: LyraLearningEntry[];
  lyraSpeakerNames?: Record<string, string>;
  lyraError?: string | null;
  // Unified speaker names map
  speakerNames?: Record<string, string>;
}

export interface UploadProgress {
  stage: 'uploading' | 'processing' | 'complete' | 'error';
  percent: number;
}

/**
 * Upload audio file for async transcription
 * Returns meetingId for polling
 */
export async function uploadAudioForTranscription(
  file: File,
  meetingId: string,
  options: {
    language?: string;
    onUploadProgress?: (percent: number) => void;
  } = {}
): Promise<{ success: boolean; meetingId?: string; error?: string }> {
  const { language = 'sv', onUploadProgress } = options;
  
  const fileSizeMB = file.size / 1024 / 1024;
  
  console.log('🎤 ASR: Uploading audio for transcription');
  console.log('  - File:', file.name, `(${fileSizeMB.toFixed(2)}MB)`);
  console.log('  - Type:', file.type);
  console.log('  - Meeting ID:', meetingId);
  console.log('  - Language:', language);
  
  // Validate file is not empty
  if (file.size < 100) {
    console.error('❌ CRITICAL: Audio file is empty!');
    return { success: false, error: 'Filen är tom' };
  }

  // Validate file size (500MB limit per spec)
  if (fileSizeMB > 500) {
    return { success: false, error: `Filen är för stor (${fileSizeMB.toFixed(0)}MB). Max 500MB.` };
  }

  onUploadProgress?.(10);

  const traceId = `asr-${meetingId}-${Date.now().toString(36)}`;

  try {
    const result = await uploadToAsr({
      file,
      meetingId,
      language,
      traceId,
      onProgress: (percent) => onUploadProgress?.(percent),
    });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    debugLog('✅ ASR: Upload successful, processing started');
    return {
      success: true,
      meetingId: result.meetingId || meetingId,
    };

  } catch (error: any) {
    debugError('❌ ASR upload error:', error);
    return {
      success: false,
      error: error.message || 'Upload failed'
    };
  }
}

/**
 * Poll ASR status by meetingId
 * Handles 404 gracefully (job not registered yet)
 * Automatically resolves backend aliases if the ID was remapped
 */
export async function pollASRStatus(meetingId: string): Promise<ASRStatus> {
  const token = localStorage.getItem('authToken');
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  // Resolve alias: if backend returned a different ID during upload, use that
  const resolvedId = resolveBackendMeetingId(meetingId);
  if (resolvedId !== meetingId) {
    debugLog('📊 ASR poll: using resolved backend ID:', { original: meetingId, resolved: resolvedId });
  }
  
  try {
    const response = await fetch(`${BACKEND_API_URL}/asr/status?meetingId=${encodeURIComponent(resolvedId)}`, {
      method: 'GET',
      headers,
    });

    // 404 = job not registered yet, treat as queued
    if (response.status === 404) {
      debugLog('📊 ASR status: 404 - treating as queued');
      return {
        status: 'queued',
        progress: 0,
      };
    }

    // 202 = accepted, processing
    if (response.status === 202) {
      const data = await response.json().catch(() => ({}));
      return {
        status: data.status || 'processing',
        progress: data.progress || 0,
      };
    }

    // Other non-OK status - keep polling as queued
    if (!response.ok) {
      debugLog('📊 ASR status check:', response.status, '- treating as queued');
      return {
        status: 'queued',
        progress: 0,
      };
    }

    const data = await response.json();
    debugLog('📊 ASR status:', data.status, data.progress ? `${data.progress}%` : '');
    
    // Log SIS status and matches if available
    if (data.sisStatus) {
      debugLog('🔍 SIS status:', data.sisStatus);
    }
    if (data.sisSpeakers && data.sisSpeakers.length > 0) {
      debugLog('🗣️ SIS speakers found:', data.sisSpeakers.length);
      data.sisSpeakers.forEach((speaker: SISSpeaker) => {
        const duration = speaker.durationSeconds != null ? `${speaker.durationSeconds.toFixed(1)}s` : 'N/A';
        const matchInfo = speaker.bestMatchEmail ? ` → ${speaker.bestMatchEmail} (${((speaker.similarity || 0) * 100).toFixed(0)}%)` : '';
        const matchCount = speaker.matches?.length ? ` [${speaker.matches.length} sample(s)]` : '';
        debugLog(`   - ${speaker.label}: ${duration}${matchInfo}${matchCount}`);
      });
    }
    if (data.sisMatches && data.sisMatches.length > 0) {
      debugLog('🎯 SIS matches found:', data.sisMatches.length, 'match(es)');
      data.sisMatches.forEach((match: SISMatch) => {
        const wordsInfo = match.matchedWords != null ? `(${match.matchedWords} words)` : '';
        debugLog(`   - ${match.sampleOwnerEmail}: ${match.confidencePercent}% ${wordsInfo}${match.speakerLabel ? ` [${match.speakerLabel}]` : ''}`);
      });
    }
    
    // Return both SIS and Lyra mirror fields for compatibility
    return {
      meetingId: data.meetingId,
      status: data.status || 'queued',
      stage: data.stage as ASRStage | undefined,
      progress: data.progress,
      transcript: data.transcript,
      transcriptSegments: data.transcriptSegments,
      words: data.words,
      error: data.error || data.sisError || data.lyraError,
      duration: data.duration,
      // Backend metadata
      engine: data.engine,
      language: data.language,
      durationMs: data.durationMs,
      wavDurationSec: data.wavDurationSec,
      metadata: data.metadata,
      updatedAt: data.updatedAt,
      // Legacy SIS fields
      sisStatus: data.sisStatus || data.lyraStatus,
      sisMatches: data.sisMatches || data.lyraMatches || [],
      sisMatch: data.sisMatch || data.lyraMatch,
      sisSpeakers: data.sisSpeakers || data.lyraSpeakers || [],
      sisLearning: data.sisLearning || data.lyraLearning || [],
      sisError: data.sisError,
      // Lyra mirror fields (preferred)
      lyraStatus: data.lyraStatus || data.sisStatus,
      lyraMatches: data.lyraMatches || data.sisMatches || [],
      lyraMatch: data.lyraMatch || data.sisMatch,
      lyraSpeakers: data.lyraSpeakers || data.sisSpeakers || [],
      lyraLearning: data.lyraLearning || data.sisLearning || [],
      lyraSpeakerNames: data.lyraSpeakerNames || data.speakerNames || {},
      lyraError: data.lyraError,
      // Unified speaker names
      speakerNames: data.speakerNames || data.lyraSpeakerNames || {},
    };
  } catch (error: any) {
    // Network error - keep polling as queued
    debugLog('📊 ASR status network error - treating as queued');
    return {
      status: 'queued',
      progress: 0,
    };
  }
}

/**
 * Poll SIS status for real-time speaker identification progress
 * Per docs: GET /asr/sis-status?meetingId=<meetingId>
 * - Offers a second channel always in sync with the SIS worker
 * - Returns sisMatches, sisSpeakers, and the same normalized speakerNames map
 * - Poll this endpoint for real-time speaker-identification progress
 */
export async function pollSISStatus(meetingId: string): Promise<SISStatus & { 
  speakerNames?: Record<string, string>; 
  transcript?: string;
  lyraLearning?: LyraLearningEntry[];
}> {
  const token = localStorage.getItem('authToken');
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  try {
    const response = await fetch(`${BACKEND_API_URL}/asr/sis-status?meetingId=${encodeURIComponent(meetingId)}`, {
      method: 'GET',
      headers,
    });

    // 404 = job not registered yet or no SIS data
    if (response.status === 404) {
      debugLog('🔍 SIS status: 404 - no SIS data yet');
      return {
        status: 'queued',
      };
    }

    if (!response.ok) {
      debugLog('🔍 SIS status check error:', response.status);
      return {
        status: 'queued',
      };
    }

    const data = await response.json();
    debugLog('🔍 SIS status:', data.sisStatus || data.status);
    
    // Per docs: log sisSpeakers[i].bestMatchEmail to see which sample generated the alias
    if (data.sisSpeakers && data.sisSpeakers.length > 0) {
      debugLog('🗣️ SIS speakers:', data.sisSpeakers.length);
      data.sisSpeakers.forEach((speaker: SISSpeaker) => {
        const duration = speaker.durationSeconds != null ? `${speaker.durationSeconds.toFixed(1)}s` : 'N/A';
        const matchInfo = speaker.bestMatchEmail ? ` → ${speaker.bestMatchEmail} (${((speaker.similarity || 0) * 100).toFixed(0)}%)` : '';
        debugLog(`   - ${speaker.label}: ${duration}${matchInfo}`);
      });
    }
    
    // Per docs: check sisMatch.confidencePercent (>= 60 → alias is auto-persisted)
    if (data.sisMatches && data.sisMatches.length > 0) {
      debugLog('🎯 SIS matches:', data.sisMatches.length);
      data.sisMatches.forEach((match: SISMatch) => {
        const autoPersisted = match.confidencePercent >= 60 ? ' [auto-persisted]' : '';
        debugLog(`   - ${match.sampleOwnerEmail}: ${match.confidencePercent}%${match.speakerLabel ? ` [${match.speakerLabel}]` : ''}${autoPersisted}`);
      });
    }
    
    return {
      status: data.sisStatus || data.status || 'queued',
      sisSpeakers: data.sisSpeakers || data.lyraSpeakers || [],
      sisMatches: data.sisMatches || data.lyraMatches || [],
      sisMatch: data.sisMatch || data.lyraMatches?.[0],
      sisError: data.sisError,
      transcript: data.transcript,
      speakerNames: data.speakerNames || data.lyraSpeakerNames || {},
      lyraLearning: data.lyraLearning || data.sisLearning || [],
    };
  } catch (error: any) {
    debugLog('🔍 SIS status network error');
    return {
      status: 'queued',
    };
  }
}

/**
 * Poll Lyra status for real-time speaker identification progress
 * Per docs: GET /asr/lyra-status?meetingId=<meetingId>
 * - Returns status, sisSpeakers, sisMatches, sisMatch, sisError, transcript
 * - Response also includes Lyra mirror fields: lyraStatus, lyraMatches, lyraSpeakers, lyraSpeakerNames, lyraLearning
 */
export async function pollLyraStatus(meetingId: string): Promise<{
  status: SISStatusType;
  lyraSpeakers: SISSpeaker[];
  lyraMatches: SISMatch[];
  lyraMatch?: SISMatch;
  lyraError?: string;
  lyraLearning: LyraLearningEntry[];
  speakerNames: Record<string, string>;
  transcript?: string;
  // Legacy aliases
  sisSpeakers: SISSpeaker[];
  sisMatches: SISMatch[];
  sisMatch?: SISMatch;
}> {
  const token = localStorage.getItem('authToken');
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  try {
    const response = await fetch(`${BACKEND_API_URL}/asr/lyra-status?meetingId=${encodeURIComponent(meetingId)}`, {
      method: 'GET',
      headers,
    });

    // 404 = job not registered yet or no Lyra data
    if (response.status === 404) {
      debugLog('🔍 Lyra status: 404 - no Lyra data yet');
      return {
        status: 'queued',
        lyraSpeakers: [],
        lyraMatches: [],
        lyraLearning: [],
        speakerNames: {},
        sisSpeakers: [],
        sisMatches: [],
      };
    }

    if (!response.ok) {
      debugLog('🔍 Lyra status check error:', response.status);
      return {
        status: 'queued',
        lyraSpeakers: [],
        lyraMatches: [],
        lyraLearning: [],
        speakerNames: {},
        sisSpeakers: [],
        sisMatches: [],
      };
    }

    const data = await response.json();
    const status = data.lyraStatus || data.sisStatus || data.status || 'queued';
    debugLog('🔍 Lyra status:', status);
    
    const lyraSpeakers = data.lyraSpeakers || data.sisSpeakers || [];
    const lyraMatches = data.lyraMatches || data.sisMatches || [];
    const lyraLearning = data.lyraLearning || data.sisLearning || [];
    const speakerNames = data.lyraSpeakerNames || data.speakerNames || {};
    
    // Per docs: log speaker info for debugging
    if (lyraSpeakers.length > 0) {
      debugLog('🗣️ Lyra speakers:', lyraSpeakers.length);
      lyraSpeakers.forEach((speaker: SISSpeaker) => {
        const duration = speaker.durationSeconds != null ? `${speaker.durationSeconds.toFixed(1)}s` : 'N/A';
        const matchInfo = speaker.bestMatchEmail ? ` → ${speaker.bestMatchEmail} (${((speaker.similarity || 0) * 100).toFixed(0)}%)` : '';
        const nameInfo = speakerNames[speaker.label] ? ` "${speakerNames[speaker.label]}"` : '';
        debugLog(`   - ${speaker.label}${nameInfo}: ${duration}${matchInfo}`);
      });
    }
    
    if (lyraMatches.length > 0) {
      debugLog('🎯 Lyra matches:', lyraMatches.length);
      lyraMatches.forEach((match: SISMatch) => {
        const autoPersisted = match.confidencePercent >= 60 ? ' [auto-persisted]' : '';
        debugLog(`   - ${match.sampleOwnerEmail}: ${match.confidencePercent}%${match.speakerLabel ? ` [${match.speakerLabel}]` : ''}${autoPersisted}`);
      });
    }
    
    if (lyraLearning.length > 0) {
      debugLog('📚 Lyra learning:', lyraLearning.length);
      lyraLearning.forEach((entry: LyraLearningEntry) => {
        const updated = entry.updated ? ' [UPDATED]' : '';
        debugLog(`   - ${entry.email}: ${entry.similarityPercent || Math.round((entry.similarity || 0) * 100)}%${updated}`);
      });
    }
    
    return {
      status,
      lyraSpeakers,
      lyraMatches,
      lyraMatch: lyraMatches[0],
      lyraError: data.lyraError || data.sisError,
      lyraLearning,
      speakerNames,
      transcript: data.transcript,
      // Legacy aliases
      sisSpeakers: lyraSpeakers,
      sisMatches: lyraMatches,
      sisMatch: lyraMatches[0],
    };
  } catch (error: any) {
    debugLog('🔍 Lyra status network error');
    return {
      status: 'queued',
      lyraSpeakers: [],
      lyraMatches: [],
      lyraLearning: [],
      speakerNames: {},
      sisSpeakers: [],
      sisMatches: [],
    };
  }
}

/**
 * Wait for ASR completion with polling
 */
export async function waitForASRCompletion(
  meetingId: string,
  options: {
    onProgress?: (status: ASRStatus) => void;
    signal?: AbortSignal;
  } = {}
): Promise<ASRResult> {
  const { onProgress, signal } = options;
  
  let attempts = 0;
  
  while (attempts < MAX_POLL_ATTEMPTS) {
    if (signal?.aborted) {
      return { success: false, error: 'Cancelled' };
    }
    
    attempts++;
    
    const status = await pollASRStatus(meetingId);
    onProgress?.(status);
    
    // Check for full completion:
    // - status must be 'completed' or 'done'
    // - AND stage must be 'done' OR lyraStatus/sisStatus must be 'done'
    const mainDone = status.status === 'completed' || status.status === 'done';
    const lyraOrSisDone = status.lyraStatus === 'done' || status.sisStatus === 'done' || 
                          status.lyraStatus === 'no_samples' || status.sisStatus === 'no_samples' ||
                          status.lyraStatus === 'disabled' || status.sisStatus === 'disabled';
    const stageDone = status.stage === 'done';
    const isFullyDone = mainDone && status.transcript && (stageDone || lyraOrSisDone);
    
    if (isFullyDone) {
      debugLog('✅ ASR completed!');
      if (status.lyraStatus || status.sisStatus) {
        debugLog(`🔍 Lyra status: ${status.lyraStatus || status.sisStatus}`);
      }
      if (status.lyraMatch || status.sisMatch) {
        const match = status.lyraMatch || status.sisMatch!;
        debugLog(`🎯 Best match: ${match.sampleOwnerEmail} (${match.confidencePercent}%)${match.speakerLabel ? ` [${match.speakerLabel}]` : ''}`);
      }
      return {
        success: true,
        transcript: status.transcript,
        transcriptSegments: status.transcriptSegments,
        duration: status.duration,
        meetingId,
        sisStatus: status.sisStatus,
        sisMatches: status.sisMatches,
        sisMatch: status.sisMatch,
        sisSpeakers: status.sisSpeakers,
      };
    }
    
    if (status.status === 'error' || status.status === 'failed') {
      debugError('❌ ASR failed:', status.error);
      return {
        success: false,
        error: status.error || 'Transcription failed',
        meetingId
      };
    }
    
    // Still processing
    if (status.status === 'queued') {
      debugLog('🔄 ASR status: queued');
    } else if (status.status === 'processing') {
      debugLog('🔄 ASR status: processing', status.stage || '', status.progress ? `${status.progress}%` : '');
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  
  return {
    success: false,
    error: 'Transcription timed out',
    meetingId
  };
}

/**
 * Complete transcription flow: Upload + Poll + Return transcript
 * Used by recording flow for background transcription
 */
export async function transcribeAndSave(
  audioBlob: Blob,
  meetingId: string,
  options: {
    language?: string;
    meetingTitle?: string;
    userEmail?: string;
    userName?: string;
    authToken?: string;
    onProgress?: (stage: 'uploading' | 'queued' | 'processing' | 'complete', percent: number) => void;
    onTranscriptReady?: (transcript: string) => void;
  } = {}
): Promise<ASRResult> {
  const { onProgress, onTranscriptReady, language = 'sv' } = options;
  
  debugLog('🚀 ========== TRANSCRIPTION FLOW START ==========');
  debugLog('📋 Meeting ID:', meetingId);
  debugLog('📁 File size:', `${(audioBlob.size / 1024 / 1024).toFixed(2)}MB`);
  
  // Convert Blob to File if needed
  const file = audioBlob instanceof File 
    ? audioBlob 
    : new File([audioBlob], 'recording.mp3', { type: audioBlob.type || 'audio/mpeg' });
  
  // Step 1: Upload audio
  onProgress?.('uploading', 10);
  
  const uploadResult = await uploadAudioForTranscription(file, meetingId, {
    language,
    onUploadProgress: (percent) => {
      onProgress?.('uploading', Math.min(percent, 40));
    }
  });
  
  if (!uploadResult.success) {
    debugError('❌ Upload failed:', uploadResult.error);
    return { success: false, error: uploadResult.error, meetingId };
  }
  
  debugLog('✅ Upload successful, polling for completion...');
  onProgress?.('queued', 50);
  
  // Step 2: Poll for completion
  const pollResult = await waitForASRCompletion(meetingId, {
    onProgress: (status) => {
      if (status.status === 'queued') {
        onProgress?.('queued', 50);
      } else if (status.status === 'processing') {
        onProgress?.('processing', 50 + (status.progress || 0) * 0.4);
      }
    }
  });
  
  if (!pollResult.success || !pollResult.transcript) {
    debugError('❌ Transcription failed:', pollResult.error);
    return { success: false, error: pollResult.error || 'Transcription failed', meetingId };
  }
  
  debugLog('✅ Transcription complete!');
  onProgress?.('complete', 100);
  
  // Notify callback
  onTranscriptReady?.(pollResult.transcript);
  
  debugLog('🚀 ========== TRANSCRIPTION FLOW COMPLETE ==========');
  
  return {
    success: true,
    transcript: pollResult.transcript,
    duration: pollResult.duration,
    meetingId
  };
}

// pollSISStatus is now defined above with enhanced docs support

// Legacy exports for backwards compatibility
export const submitASRJob = uploadAudioForTranscription;
export const transcribeDirectly = uploadAudioForTranscription;
export const storeJobIdInMeeting = async (meetingId: string, jobId: string) => {
  // No longer needed - backend tracks by meetingId
  debugLog('storeJobIdInMeeting is deprecated, backend uses meetingId');
};
