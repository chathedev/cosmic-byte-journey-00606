import { useState, useRef, useCallback, useEffect } from 'react';

const ASR_BACKEND_URL = 'https://api.tivly.se';
const MAX_FLUSH_DELAY_MS = 100;

export interface ASRStreamChunk {
  meetingId: string;
  chunkIndex: number;
  totalChunks: number;
  completedChunks: number;
  progressPercent: number;
  chunkOffsetSec?: number;
  chunkDurationSec?: number;
  transcript?: string;
  orderedTranscript?: string;
  updatedAt?: string;
}

export interface ASRStreamProgress {
  meetingId: string;
  stage: string;
  progressPercent: number;
  chunkIndex?: number;
  totalChunks?: number;
  completedChunks?: number;
  updatedAt?: string;
}

export interface ASRStreamState {
  /** Whether SSE connection is active */
  isConnected: boolean;
  /** Live transcript text (accumulated from orderedTranscript or transcript chunks) */
  liveTranscript: string;
  /** Progress 0-100 */
  progress: number;
  /** Current stage */
  stage: string | null;
  /** Total chunks expected */
  totalChunks: number;
  /** Completed chunks */
  completedChunks: number;
  /** Whether stream completed successfully */
  isCompleted: boolean;
  /** Whether stream failed */
  isFailed: boolean;
  /** Final payload from 'completed' event */
  finalPayload: any | null;
}

interface UseASRStreamOptions {
  meetingId: string | null;
  enabled?: boolean;
  onCompleted?: (payload: any) => void;
  onFailed?: (payload: any) => void;
  onProgress?: (progress: number, stage: string) => void;
}

export function useASRStream({
  meetingId,
  enabled = true,
  onCompleted,
  onFailed,
  onProgress,
}: UseASRStreamOptions): ASRStreamState & { disconnect: () => void } {
  const [state, setState] = useState<ASRStreamState>({
    isConnected: false,
    liveTranscript: '',
    progress: 0,
    stage: null,
    totalChunks: 0,
    completedChunks: 0,
    isCompleted: false,
    isFailed: false,
    finalPayload: null,
  });

  const sseRef = useRef<EventSource | null>(null);
  const queueRef = useRef<Array<{ type: string; payload: any }>>([]);
  const flushScheduledRef = useRef(false);
  const lastFlushAtRef = useRef(0);
  const latestOrderedRef = useRef('');
  const latestProgressRef = useRef(0);
  const latestStageRef = useRef<string | null>(null);
  const latestTotalChunksRef = useRef(0);
  const latestCompletedChunksRef = useRef(0);
  const onCompletedRef = useRef(onCompleted);
  const onFailedRef = useRef(onFailed);
  const onProgressRef = useRef(onProgress);

  // Keep callback refs up to date
  onCompletedRef.current = onCompleted;
  onFailedRef.current = onFailed;
  onProgressRef.current = onProgress;

  const flushQueue = useCallback((force = false) => {
    flushScheduledRef.current = false;
    const now = performance.now();

    if (!force && now - lastFlushAtRef.current < MAX_FLUSH_DELAY_MS) {
      scheduleFlush();
      return;
    }

    lastFlushAtRef.current = now;
    const batch = queueRef.current;
    if (batch.length === 0) return;
    queueRef.current = [];

    for (const item of batch) {
      if (item.type === 'progress') {
        const p = item.payload as ASRStreamProgress;
        if (p.progressPercent != null) latestProgressRef.current = p.progressPercent;
        if (p.stage) latestStageRef.current = p.stage;
        if (p.totalChunks != null) latestTotalChunksRef.current = p.totalChunks;
        if (p.completedChunks != null) latestCompletedChunksRef.current = p.completedChunks;
      }
      if (item.type === 'chunk') {
        const c = item.payload as ASRStreamChunk;
        const next = c.orderedTranscript || c.transcript || '';
        if (next) latestOrderedRef.current = next;

        if (c.progressPercent != null) latestProgressRef.current = c.progressPercent;
        if (c.totalChunks != null) latestTotalChunksRef.current = c.totalChunks;
        if (c.completedChunks != null) latestCompletedChunksRef.current = c.completedChunks;
      }
    }

    setState(prev => ({
      ...prev,
      liveTranscript: latestOrderedRef.current,
      progress: latestProgressRef.current,
      stage: latestStageRef.current,
      totalChunks: latestTotalChunksRef.current,
      completedChunks: latestCompletedChunksRef.current,
    }));

    onProgressRef.current?.(latestProgressRef.current, latestStageRef.current || 'processing');
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushScheduledRef.current) return;
    flushScheduledRef.current = true;
    requestAnimationFrame(() => flushQueue(false));
  }, [flushQueue]);

  const disconnect = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    setState(prev => ({ ...prev, isConnected: false }));
  }, []);

  useEffect(() => {
    if (!meetingId || !enabled) {
      disconnect();
      return;
    }

    const token = localStorage.getItem('authToken');
    if (!token) {
      console.warn('[ASR Stream] No auth token, skipping SSE');
      return;
    }

    const streamUrl = `${ASR_BACKEND_URL}/asr/stream?meetingId=${encodeURIComponent(meetingId)}&token=${encodeURIComponent(token)}`;

    // Reset state for new connection
    latestOrderedRef.current = '';
    latestProgressRef.current = 0;
    latestStageRef.current = null;
    latestTotalChunksRef.current = 0;
    latestCompletedChunksRef.current = 0;
    queueRef.current = [];

    setState({
      isConnected: false,
      liveTranscript: '',
      progress: 0,
      stage: null,
      totalChunks: 0,
      completedChunks: 0,
      isCompleted: false,
      isFailed: false,
      finalPayload: null,
    });

    console.log(`[ASR Stream] Connecting to SSE for meeting ${meetingId}`);
    const sse = new EventSource(streamUrl);
    sseRef.current = sse;

    sse.addEventListener('connected', () => {
      console.log('[ASR Stream] Connected');
      setState(prev => ({ ...prev, isConnected: true }));
    });

    sse.addEventListener('status', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        console.log('[ASR Stream] Initial status:', data.status);
        if (data.progressPercent != null) {
          latestProgressRef.current = data.progressPercent;
        }
        if (data.stage) {
          latestStageRef.current = data.stage;
        }
        // If status already contains transcript, render it immediately (rule 9)
        const statusTranscript = data?.transcript || '';
        if (statusTranscript) {
          queueRef.current.push({
            type: 'chunk',
            payload: { transcript: statusTranscript, orderedTranscript: statusTranscript },
          });
          scheduleFlush();
        }
        setState(prev => ({
          ...prev,
          isConnected: true,
          progress: data.progressPercent || 0,
          stage: data.stage || null,
        }));
      } catch { /* ignore */ }
    });

    sse.addEventListener('progress', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data);
        queueRef.current.push({ type: 'progress', payload });
        scheduleFlush();
      } catch { /* ignore */ }
    });

    sse.addEventListener('chunk', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data);
        queueRef.current.push({ type: 'chunk', payload });
        scheduleFlush();
      } catch { /* ignore */ }
    });

    sse.addEventListener('completed', (event) => {
      try {
        // Force flush any remaining items
        flushQueue(true);

        const finalData = JSON.parse((event as MessageEvent).data);
        console.log('[ASR Stream] Completed');

        const finalTranscript = finalData.transcript || latestOrderedRef.current || '';

        setState(prev => ({
          ...prev,
          isConnected: false,
          isCompleted: true,
          progress: 100,
          liveTranscript: finalTranscript,
          finalPayload: finalData,
        }));

        onCompletedRef.current?.(finalData);
        sse.close();
        sseRef.current = null;
      } catch { /* ignore */ }
    });

    sse.addEventListener('failed', (event) => {
      flushQueue(true);
      let failData: any = null;
      try {
        failData = JSON.parse((event as MessageEvent).data);
      } catch { /* ignore */ }

      console.warn('[ASR Stream] Failed:', failData);
      setState(prev => ({
        ...prev,
        isConnected: false,
        isFailed: true,
      }));

      onFailedRef.current?.(failData);
      sse.close();
      sseRef.current = null;
    });

    sse.onerror = () => {
      // EventSource auto-reconnects on error; only log
      console.warn('[ASR Stream] SSE error (will auto-reconnect)');
    };

    return () => {
      sse.close();
      sseRef.current = null;
    };
  }, [meetingId, enabled, disconnect, scheduleFlush, flushQueue]);

  return { ...state, disconnect };
}
