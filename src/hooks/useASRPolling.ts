import { useState, useEffect, useRef, useCallback } from 'react';
import { pollASRStatus, ASRStatus, SISMatch, TranscriptSegment } from '@/lib/asrService';

const POLL_INTERVAL_MS = 3000;

interface UseASRPollingOptions {
  onComplete?: (transcript: string, sisMatches?: SISMatch[], sisMatch?: SISMatch) => void;
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
  const [sisMatches, setSisMatches] = useState<SISMatch[]>([]);
  const [sisMatch, setSisMatch] = useState<SISMatch | null>(null);
  
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
          setSisMatches(result.sisMatches || []);
          setSisMatch(result.sisMatch || null);
          stopPolling();
          options.onComplete?.(result.transcript || '', result.sisMatches, result.sisMatch);
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
    sisMatches,
    sisMatch,
    stopPolling,
    startPolling,
  };
}
