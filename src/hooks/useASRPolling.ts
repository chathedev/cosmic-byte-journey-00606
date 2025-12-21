import { useState, useEffect, useRef, useCallback } from 'react';
import { pollASRStatus, ASRStatus, SISMatch, SISSpeaker, SISStatusType, TranscriptSegment } from '@/lib/asrService';

const POLL_INTERVAL_MS = 3000;

interface UseASRPollingOptions {
  onComplete?: (transcript: string, sisMatches?: SISMatch[], sisMatch?: SISMatch, sisSpeakers?: SISSpeaker[]) => void;
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
  const [sisStatus, setSisStatus] = useState<SISStatusType | null>(null);
  const [sisMatches, setSisMatches] = useState<SISMatch[]>([]);
  const [sisMatch, setSisMatch] = useState<SISMatch | null>(null);
  const [sisSpeakers, setSisSpeakers] = useState<SISSpeaker[]>([]);
  
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
        
        if (result.status === 'completed' || result.status === 'done') {
          setTranscript(result.transcript || null);
          setTranscriptSegments(result.transcriptSegments || null);
          setSisStatus(result.sisStatus || null);
          setSisMatches(result.sisMatches || []);
          setSisMatch(result.sisMatch || null);
          setSisSpeakers(result.sisSpeakers || []);
          stopPolling();
          
          // Log SIS results
          if (result.sisStatus) {
            console.log(`🔍 SIS status: ${result.sisStatus}`);
          }
          if (result.sisSpeakers && result.sisSpeakers.length > 0) {
            console.log(`🗣️ SIS speakers: ${result.sisSpeakers.length}`);
            result.sisSpeakers.forEach(speaker => {
              const duration = speaker.durationSeconds != null ? `${speaker.durationSeconds.toFixed(1)}s` : 'N/A';
              const matchInfo = speaker.bestMatchEmail ? ` → ${speaker.bestMatchEmail} (${((speaker.similarity || 0) * 100).toFixed(0)}%)` : '';
              const matchCount = speaker.matches?.length ? ` [${speaker.matches.length} sample(s)]` : '';
              console.log(`   - ${speaker.label}: ${duration}${matchInfo}${matchCount}`);
            });
          }
          if (result.sisMatch) {
            const wordsInfo = result.sisMatch.matchedWords != null ? `(${result.sisMatch.matchedWords} words)` : '';
            console.log(`🎯 Best SIS match: ${result.sisMatch.sampleOwnerEmail} (${result.sisMatch.confidencePercent}%) ${wordsInfo}${result.sisMatch.speakerLabel ? ` [${result.sisMatch.speakerLabel}]` : ''}`);
          }
          
          options.onComplete?.(result.transcript || '', result.sisMatches, result.sisMatch, result.sisSpeakers);
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
        // Continue polling on network errors
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }, [options, stopPolling]);

  // Auto-start polling when meetingId changes
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
    sisStatus,
    sisMatches,
    sisMatch,
    sisSpeakers,
    stopPolling,
    startPolling,
  };
}
