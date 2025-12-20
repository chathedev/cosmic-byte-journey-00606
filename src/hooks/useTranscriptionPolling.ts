import { useState, useEffect, useRef, useCallback } from 'react';
import { pollASRStatus, ASRStatus, ASRStage, SISMatch, SISSpeaker, SISStatusType, TranscriptSegment, LyraLearningEntry } from '@/lib/asrService';
import { meetingStorage } from '@/utils/meetingStorage';

const POLL_INTERVAL_MS = 4000; // Poll every 4 seconds
const MAX_POLL_ATTEMPTS = 450; // Max ~30 minutes

// Per docs: TranscriptionState holds both legacy SIS and Lyra mirror fields
export interface TranscriptionState {
  status: 'idle' | 'uploading' | 'processing' | 'done' | 'failed';
  stage?: ASRStage; // More granular stage from backend
  progress: number;
  transcript: string | null;
  transcriptSegments: TranscriptSegment[] | null;
  error: string | null;
  // Legacy SIS fields (for backwards compatibility)
  sisStatus: SISStatusType | null;
  sisMatches: SISMatch[];
  sisMatch: SISMatch | null;
  sisSpeakers: SISSpeaker[];
  // Lyra mirror fields (preferred for frontend use)
  lyraStatus?: SISStatusType | null;
  lyraMatches?: SISMatch[];
  lyraSpeakers?: SISSpeaker[];
  lyraLearning?: LyraLearningEntry[];
  // Per docs: speakerNames[label] is the preferred way to display speaker names
  speakerNames?: Record<string, string>;
}

// Per docs: onComplete now includes Lyra learning and speakerNames
interface UseTranscriptionPollingOptions {
  onComplete?: (
    meetingId: string, 
    transcript: string, 
    lyraMatches?: SISMatch[], 
    lyraMatch?: SISMatch, 
    lyraSpeakers?: SISSpeaker[],
    lyraLearning?: LyraLearningEntry[],
    speakerNames?: Record<string, string>
  ) => void;
  onError?: (meetingId: string, error: string) => void;
}

export function useTranscriptionPolling(
  pendingMeetingIds: string[],
  options: UseTranscriptionPollingOptions = {}
) {
  const [states, setStates] = useState<Record<string, TranscriptionState>>({});
  const pollingRef = useRef<Record<string, boolean>>({});
  const attemptsRef = useRef<Record<string, number>>({});

  const stopPolling = useCallback((meetingId: string) => {
    pollingRef.current[meetingId] = false;
  }, []);

  const stopAllPolling = useCallback(() => {
    Object.keys(pollingRef.current).forEach(id => {
      pollingRef.current[id] = false;
    });
  }, []);

  const pollMeeting = useCallback(async (meetingId: string) => {
    if (pollingRef.current[meetingId]) return; // Already polling
    
    pollingRef.current[meetingId] = true;
    attemptsRef.current[meetingId] = 0;

    // Set initial processing state with both legacy and Lyra fields
    setStates(prev => ({
      ...prev,
      [meetingId]: {
        status: 'processing',
        stage: 'uploading',
        progress: 10,
        transcript: null,
        transcriptSegments: null,
        error: null,
        // Legacy SIS fields
        sisStatus: null,
        sisMatches: [],
        sisMatch: null,
        sisSpeakers: [],
        // Lyra mirror fields
        lyraStatus: null,
        lyraMatches: [],
        lyraSpeakers: [],
        lyraLearning: [],
        speakerNames: {},
      }
    }));

    while (pollingRef.current[meetingId] && attemptsRef.current[meetingId] < MAX_POLL_ATTEMPTS) {
      attemptsRef.current[meetingId]++;
      
      try {
        // First try the ASR status endpoint
        const asrStatus = await pollASRStatus(meetingId);
        
        if ((asrStatus.status === 'completed' || asrStatus.status === 'done') && asrStatus.transcript) {
          // Per docs: ASR completed - use Lyra mirror fields (preferred) with SIS fallbacks
          console.log('✅ Transcription complete via ASR status:', meetingId);
          
          const lyraStatus = asrStatus.lyraStatus || asrStatus.sisStatus;
          const lyraMatches = asrStatus.lyraMatches || asrStatus.sisMatches || [];
          const lyraSpeakers = asrStatus.lyraSpeakers || asrStatus.sisSpeakers || [];
          const lyraLearning = asrStatus.lyraLearning || asrStatus.sisLearning || [];
          const speakerNames = asrStatus.speakerNames || asrStatus.lyraSpeakerNames || {};
          
          if (lyraStatus) {
            console.log(`🔍 Lyra status: ${lyraStatus}`);
          }
          if (lyraSpeakers.length > 0) {
            console.log(`🗣️ Lyra speakers: ${lyraSpeakers.length}`);
            lyraSpeakers.forEach(speaker => {
              const duration = speaker.durationSeconds != null ? `${speaker.durationSeconds.toFixed(1)}s` : 'N/A';
              const matchInfo = speaker.bestMatchEmail ? ` → ${speaker.bestMatchEmail} (${((speaker.similarity || 0) * 100).toFixed(0)}%)` : '';
              console.log(`   - ${speaker.label}: ${duration}${matchInfo}`);
            });
          }
          if (lyraMatches[0]) {
            const match = lyraMatches[0];
            console.log(`🎯 Best Lyra match: ${match.sampleOwnerEmail} (${match.confidencePercent}%)${match.speakerLabel ? ` [${match.speakerLabel}]` : ''}`);
          }
          if (lyraLearning.length > 0) {
            console.log(`📚 Lyra learning entries: ${lyraLearning.length}`);
            lyraLearning.forEach(entry => {
              console.log(`   - ${entry.email}: ${entry.similarityPercent || Math.round((entry.similarity || 0) * 100)}%${entry.updated ? ' [updated]' : ''}`);
            });
          }
          if (Object.keys(speakerNames).length > 0) {
            console.log(`📝 Speaker names:`, speakerNames);
          }
          
          pollingRef.current[meetingId] = false;
          
          setStates(prev => ({
            ...prev,
            [meetingId]: {
              status: 'done',
              progress: 100,
              transcript: asrStatus.transcript!,
              transcriptSegments: asrStatus.transcriptSegments || null,
              error: null,
              // Legacy SIS fields
              sisStatus: asrStatus.sisStatus || null,
              sisMatches: asrStatus.sisMatches || [],
              sisMatch: asrStatus.sisMatch || null,
              sisSpeakers: asrStatus.sisSpeakers || [],
              // Lyra mirror fields (preferred)
              lyraStatus,
              lyraMatches,
              lyraSpeakers,
              lyraLearning,
              speakerNames,
            }
          }));
          
          options.onComplete?.(
            meetingId, 
            asrStatus.transcript, 
            lyraMatches, 
            lyraMatches[0], 
            lyraSpeakers,
            lyraLearning,
            speakerNames
          );
          return;
        }

        if (asrStatus.status === 'error' || asrStatus.status === 'failed') {
          console.log('❌ Transcription failed via ASR status:', meetingId);
          pollingRef.current[meetingId] = false;
          
          setStates(prev => ({
            ...prev,
            [meetingId]: {
              status: 'failed',
              progress: 0,
              transcript: null,
              transcriptSegments: null,
              error: asrStatus.error || 'Transkribering misslyckades',
              sisStatus: null,
              sisMatches: [],
              sisMatch: null,
              sisSpeakers: [],
              lyraStatus: null,
              lyraMatches: [],
              lyraSpeakers: [],
              lyraLearning: [],
              speakerNames: {},
            }
          }));
          
          options.onError?.(meetingId, asrStatus.error || 'Transkribering misslyckades');
          return;
        }

        // Update progress with stage info
        const progressEstimate = Math.min(
          90,
          20 + (attemptsRef.current[meetingId] * 2)
        );
        
        setStates(prev => ({
          ...prev,
          [meetingId]: {
            ...prev[meetingId],
            status: 'processing',
            stage: asrStatus.stage || (asrStatus.status === 'queued' ? 'uploading' : 'transcribing'),
            progress: asrStatus.progress || progressEstimate,
          }
        }));

        // Also check meeting data directly as backup
        const meeting = await meetingStorage.getMeeting(meetingId);
        if (meeting?.transcript && meeting.transcript.trim().length > 50) {
          // Meeting has transcript - done!
          console.log('✅ Transcription complete via meeting data:', meetingId);
          pollingRef.current[meetingId] = false;
          
          const lyraMatches = asrStatus.lyraMatches || asrStatus.sisMatches || [];
          const lyraSpeakers = asrStatus.lyraSpeakers || asrStatus.sisSpeakers || [];
          const lyraLearning = asrStatus.lyraLearning || asrStatus.sisLearning || [];
          const speakerNames = asrStatus.speakerNames || asrStatus.lyraSpeakerNames || {};
          
          setStates(prev => ({
            ...prev,
            [meetingId]: {
              status: 'done',
              progress: 100,
              transcript: meeting.transcript,
              transcriptSegments: null,
              error: null,
              sisStatus: asrStatus.sisStatus || null,
              sisMatches: asrStatus.sisMatches || [],
              sisMatch: asrStatus.sisMatch || null,
              sisSpeakers: asrStatus.sisSpeakers || [],
              lyraStatus: asrStatus.lyraStatus || asrStatus.sisStatus || null,
              lyraMatches,
              lyraSpeakers,
              lyraLearning,
              speakerNames,
            }
          }));
          
          options.onComplete?.(
            meetingId, 
            meeting.transcript, 
            lyraMatches, 
            lyraMatches[0], 
            lyraSpeakers,
            lyraLearning,
            speakerNames
          );
          return;
        }

      } catch (error) {
        console.log('🔄 Polling error, continuing...', error);
        // Continue polling on network errors
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    // Max attempts reached
    if (attemptsRef.current[meetingId] >= MAX_POLL_ATTEMPTS) {
      pollingRef.current[meetingId] = false;
      setStates(prev => ({
        ...prev,
        [meetingId]: {
          status: 'failed',
          progress: 0,
          transcript: null,
          transcriptSegments: null,
          error: 'Tidsgränsen överskreds',
          sisStatus: null,
          sisMatches: [],
          sisMatch: null,
          sisSpeakers: [],
          lyraStatus: null,
          lyraMatches: [],
          lyraSpeakers: [],
          lyraLearning: [],
          speakerNames: {},
        }
      }));
      options.onError?.(meetingId, 'Tidsgränsen överskreds');
    }
  }, [options]);

  // Start polling for new meeting IDs
  useEffect(() => {
    pendingMeetingIds.forEach(meetingId => {
      if (!pollingRef.current[meetingId]) {
        pollMeeting(meetingId);
      }
    });
  }, [pendingMeetingIds, pollMeeting]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllPolling();
    };
  }, [stopAllPolling]);

  return {
    states,
    stopPolling,
    stopAllPolling,
    isPolling: (meetingId: string) => pollingRef.current[meetingId] ?? false,
  };
}
