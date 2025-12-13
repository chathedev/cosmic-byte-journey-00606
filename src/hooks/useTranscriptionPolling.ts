import { useState, useEffect, useRef, useCallback } from 'react';
import { pollASRStatus, ASRStatus, SISMatch, TranscriptSegment } from '@/lib/asrService';
import { meetingStorage } from '@/utils/meetingStorage';

const POLL_INTERVAL_MS = 4000; // Poll every 4 seconds
const MAX_POLL_ATTEMPTS = 450; // Max ~30 minutes

export interface TranscriptionState {
  status: 'idle' | 'uploading' | 'processing' | 'done' | 'failed';
  progress: number;
  transcript: string | null;
  transcriptSegments: TranscriptSegment[] | null;
  error: string | null;
  sisMatches: SISMatch[];
  sisMatch: SISMatch | null;
}

interface UseTranscriptionPollingOptions {
  onComplete?: (meetingId: string, transcript: string, sisMatches?: SISMatch[], sisMatch?: SISMatch) => void;
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

    // Set initial processing state
    setStates(prev => ({
      ...prev,
      [meetingId]: {
        status: 'processing',
        progress: 10,
        transcript: null,
        transcriptSegments: null,
        error: null,
        sisMatches: [],
        sisMatch: null,
      }
    }));

    while (pollingRef.current[meetingId] && attemptsRef.current[meetingId] < MAX_POLL_ATTEMPTS) {
      attemptsRef.current[meetingId]++;
      
      try {
        // First try the ASR status endpoint
        const asrStatus = await pollASRStatus(meetingId);
        
        if (asrStatus.status === 'completed' && asrStatus.transcript) {
          // ASR completed!
          console.log('✅ Transcription complete via ASR status:', meetingId);
          if (asrStatus.sisMatch) {
            console.log(`🎯 SIS match: ${asrStatus.sisMatch.sampleOwnerEmail} (${asrStatus.sisMatch.confidencePercent}%)`);
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
              sisMatches: asrStatus.sisMatches || [],
              sisMatch: asrStatus.sisMatch || null,
            }
          }));
          
          options.onComplete?.(meetingId, asrStatus.transcript, asrStatus.sisMatches, asrStatus.sisMatch);
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
              sisMatches: [],
              sisMatch: null,
            }
          }));
          
          options.onError?.(meetingId, asrStatus.error || 'Transkribering misslyckades');
          return;
        }

        // Update progress
        const progressEstimate = Math.min(
          90,
          20 + (attemptsRef.current[meetingId] * 2)
        );
        
        setStates(prev => ({
          ...prev,
          [meetingId]: {
            ...prev[meetingId],
            status: asrStatus.status === 'queued' ? 'processing' : 'processing',
            progress: asrStatus.progress || progressEstimate,
          }
        }));

        // Also check meeting data directly as backup
        const meeting = await meetingStorage.getMeeting(meetingId);
        if (meeting?.transcript && meeting.transcript.trim().length > 50) {
          // Meeting has transcript - done!
          console.log('✅ Transcription complete via meeting data:', meetingId);
          pollingRef.current[meetingId] = false;
          
          setStates(prev => ({
            ...prev,
            [meetingId]: {
              status: 'done',
              progress: 100,
              transcript: meeting.transcript,
              transcriptSegments: null,
              error: null,
              sisMatches: asrStatus.sisMatches || [],
              sisMatch: asrStatus.sisMatch || null,
            }
          }));
          
          options.onComplete?.(meetingId, meeting.transcript, asrStatus.sisMatches, asrStatus.sisMatch);
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
          sisMatches: [],
          sisMatch: null,
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
