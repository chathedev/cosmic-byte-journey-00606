import { useState, useEffect, useRef, useCallback } from 'react';
import { pollASRStatus, ASRStatus, ASRStage, SISMatch, SISSpeaker, SISStatusType, TranscriptSegment, LyraLearningEntry } from '@/lib/asrService';

const POLL_INTERVAL_MS = 3000;

interface UseASRPollingOptions {
  onComplete?: (transcript: string, lyraMatches?: SISMatch[], lyraMatch?: SISMatch, lyraSpeakers?: SISSpeaker[]) => void;
  onError?: (error: string) => void;
}

export function useASRPolling(
  meetingId: string | null,
  options: UseASRPollingOptions = {}
) {
  const [status, setStatus] = useState<ASRStatus['status'] | null>(null);
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [lyraStatus, setLyraStatus] = useState<SISStatusType | null>(null);
  const [lyraMatches, setLyraMatches] = useState<SISMatch[]>([]);
  const [lyraMatch, setLyraMatch] = useState<SISMatch | null>(null);
  const [lyraSpeakers, setLyraSpeakers] = useState<SISSpeaker[]>([]);
  const [lyraLearning, setLyraLearning] = useState<LyraLearningEntry[]>([]);
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({});
  
  const pollingRef = useRef(false);
  const meetingIdRef = useRef(meetingId);
  meetingIdRef.current = meetingId;

  const stopPolling = useCallback(() => {
    pollingRef.current = false;
    setIsPolling(false);
  }, []);

  const startPolling = useCallback(async (id: string) => {
    if (pollingRef.current) return;
    
    pollingRef.current = true;
    setIsPolling(true);
    setStatus('queued');
    setError(null);
    
    while (pollingRef.current && meetingIdRef.current === id) {
      try {
        const result = await pollASRStatus(id);
        
        if (!pollingRef.current || meetingIdRef.current !== id) break;
        
        setStatus(result.status);
        setProgress(result.progress);
        
        // Check for full completion:
        // - status must be 'completed' or 'done'
        // - AND stage must be 'done' OR lyraStatus/sisStatus must be 'done'
        const mainDone = result.status === 'completed' || result.status === 'done';
        const lyraOrSisDone = result.lyraStatus === 'done' || result.sisStatus === 'done' || 
                              result.lyraStatus === 'no_samples' || result.sisStatus === 'no_samples' ||
                              result.lyraStatus === 'disabled' || result.sisStatus === 'disabled';
        const stageDone = result.stage === 'done';
        const isFullyDone = mainDone && result.transcript && (stageDone || lyraOrSisDone);
        
        if (isFullyDone) {
          setTranscript(result.transcript || null);
          setTranscriptSegments(result.transcriptSegments || null);
          setLyraStatus(result.lyraStatus || result.sisStatus || null);
          setLyraMatches(result.lyraMatches || result.sisMatches || []);
          setLyraMatch(result.lyraMatches?.[0] || result.sisMatch || null);
          setLyraSpeakers(result.lyraSpeakers || result.sisSpeakers || []);
          setLyraLearning(result.lyraLearning || result.sisLearning || []);
          setSpeakerNames(result.lyraSpeakerNames || result.speakerNames || {});
          stopPolling();
          
          // Log Lyra results
          if (result.lyraStatus || result.sisStatus) {
            console.log(`🔍 Lyra status: ${result.lyraStatus || result.sisStatus}`);
          }
          const speakers = result.lyraSpeakers || result.sisSpeakers || [];
          if (speakers.length > 0) {
            console.log(`🗣️ Lyra speakers: ${speakers.length}`);
            speakers.forEach(speaker => {
              const duration = speaker.durationSeconds != null ? `${speaker.durationSeconds.toFixed(1)}s` : 'N/A';
              const matchInfo = speaker.bestMatchEmail ? ` → ${speaker.bestMatchEmail} (${((speaker.similarity || 0) * 100).toFixed(0)}%)` : '';
              console.log(`   - ${speaker.label}: ${duration}${matchInfo}`);
            });
          }
          const matches = result.lyraMatches || result.sisMatches || [];
          if (matches[0]) {
            const match = matches[0];
            console.log(`🎯 Best Lyra match: ${match.sampleOwnerEmail} (${match.confidencePercent}%)`);
          }
          
          options.onComplete?.(result.transcript || '', matches, matches[0], speakers);
          return;
        }
        
        if (result.status === 'error' || result.status === 'failed') {
          setError(result.error || 'Transcription failed');
          stopPolling();
          options.onError?.(result.error || 'Transcription failed');
          return;
        }
      } catch (e: any) {
        console.error('Polling error:', e);
      }
      
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }, [options, stopPolling]);

  useEffect(() => {
    if (meetingId) {
      startPolling(meetingId);
    } else {
      stopPolling();
    }
    
    return () => {
      pollingRef.current = false;
    };
  }, [meetingId, startPolling, stopPolling]);

  return {
    status,
    progress,
    transcript,
    transcriptSegments,
    error,
    isPolling,
    lyraStatus,
    lyraMatches,
    lyraMatch,
    lyraSpeakers,
    lyraLearning,
    speakerNames,
    stopPolling,
    startPolling,
    // Legacy aliases for backwards compatibility
    sisStatus: lyraStatus,
    sisMatches: lyraMatches,
    sisMatch: lyraMatch,
    sisSpeakers: lyraSpeakers,
  };
}
