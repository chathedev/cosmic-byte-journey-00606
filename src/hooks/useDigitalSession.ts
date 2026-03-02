import { useState, useEffect, useRef, useCallback } from "react";

const API_BASE_URL = 'https://api.tivly.se';

export type DigitalSessionStatus =
  | 'idle'
  | 'pending'
  | 'starting'
  | 'joining'
  | 'listening'
  | 'paused'
  | 'stopping'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'timed_out'
  | 'cancelled'
  | 'interrupted';

export interface DigitalSessionError {
  message: string;
  code?: string;
  details?: string;
}

export interface DigitalSessionMetadata {
  joinStage?: string;
  joinElapsedMs?: number;
  admissionState?: string;
  joinUiState?: string;
  prejoinTimeoutMs?: number;
  lobbyTimeoutMs?: number;
  audioCaptureActive?: boolean;
  capturePaused?: boolean;
  botMediaMuted?: boolean;
  botDisplayName?: string;
  awaitingHostAdmission?: boolean;
  hostActionRequired?: boolean;
  hostActionType?: string;
  hostActionText?: string;
  liveTranscriptEnabled?: boolean;
  transcriptionStartsAfterMeeting?: boolean;
  processingStage?: string;
  processingProgressPercent?: number;
  asrStatus?: string;
  asrEngine?: string;
  speakerDiarizationEnabled?: boolean;
  speakerDiarizationEngine?: string;
  speakerDiarizationAfterTranscript?: boolean;
  speakerNames?: Record<string, string>;
  speakerRoleSuggestions?: Record<string, string>;
  endedReason?: string;
  meetingEndedByHost?: boolean;
  audioMeanVolumeDb?: number;
  audioMaxVolumeDb?: number;
  recordedAudioBytes?: number;
}

export interface DigitalSession {
  id: string;
  meetingId: string;
  status: DigitalSessionStatus;
  meetingTitle: string;
  transcriptPreview: string | null;
  transcriptChunkCount: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  joinedAt: string | null;
  pausedAt: string | null;
  endedAt: string | null;
  lastHeartbeatAt: string | null;
  maxMeetingMinutes: number;
  reconnectCount: number;
  maxReconnects: number;
  pauseDropsAudio: boolean;
  error: DigitalSessionError | null;
  metadata?: DigitalSessionMetadata | null;
}

export interface LockedSessionInfo {
  meetingTitle?: string;
  status?: string;
  startedAt?: string;
}

interface StatusResponse {
  active: boolean;
  locked?: boolean;
  status?: string;
  session: DigitalSession | null;
  activeSession?: LockedSessionInfo;
}

interface StartParams {
  joinUrl: string;
  title?: string;
  meetingId?: string;
  maxMeetingMinutes?: number;
}

interface UseDigitalSessionReturn {
  session: DigitalSession | null;
  status: DigitalSessionStatus;
  isActive: boolean;
  isLocked: boolean;
  lockedSessionInfo: LockedSessionInfo | null;
  error: string | null;
  errorCode: string | null;
  startSession: (params: StartParams) => Promise<boolean>;
  pauseSession: () => Promise<void>;
  resumeSession: () => Promise<void>;
  stopSession: () => Promise<void>;
  retrySession: () => void;
  reset: () => void;
  clearError: () => void;
}

const getAuthToken = (): string | null => localStorage.getItem('authToken');

const TERMINAL_STATUSES: DigitalSessionStatus[] = ['completed', 'failed', 'timed_out', 'cancelled', 'interrupted'];
const ACTIVE_STATUSES: DigitalSessionStatus[] = ['pending', 'starting', 'joining', 'listening', 'paused', 'stopping', 'processing'];

export const useDigitalSession = (): UseDigitalSessionReturn => {
  const [session, setSession] = useState<DigitalSession | null>(null);
  const [status, setStatus] = useState<DigitalSessionStatus>('idle');
  const [isLocked, setIsLocked] = useState(false);
  const [lockedSessionInfo, setLockedSessionInfo] = useState<LockedSessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const lastStartParamsRef = useRef<StartParams | null>(null);

  const isActive = ACTIVE_STATUSES.includes(status);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;

    try {
      const url = sessionIdRef.current
        ? `${API_BASE_URL}/digital-sessions/${sessionIdRef.current}/status`
        : `${API_BASE_URL}/digital-sessions/status`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        if (res.status === 404) {
          setSession(null);
          setStatus('idle');
          stopPolling();
          return;
        }
        throw new Error(`Status check failed: ${res.status}`);
      }

      const data: StatusResponse = await res.json();

      if (data.locked) {
        setIsLocked(true);
        setLockedSessionInfo(data.activeSession || null);
        setStatus('idle');
        stopPolling();
        return;
      }

      if (data.session) {
        setSession(data.session);
        setStatus(data.session.status);
        sessionIdRef.current = data.session.id;

        // Extract error info from session
        if (data.session.error) {
          setError(data.session.error.message);
          setErrorCode(data.session.error.code || null);
        }

        if (TERMINAL_STATUSES.includes(data.session.status)) {
          stopPolling();
        }
      } else {
        setSession(null);
        setStatus('idle');
        stopPolling();
      }
    } catch (err) {
      console.error('Digital session status poll error:', err);
    }
  }, [stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(fetchStatus, 3000);
  }, [fetchStatus, stopPolling]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // Check for existing active session on mount
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const startSession = useCallback(async (params: StartParams): Promise<boolean> => {
    const token = getAuthToken();
    if (!token) {
      setError('Ingen autentiseringstoken hittades');
      return false;
    }

    setError(null);
    setErrorCode(null);
    lastStartParamsRef.current = params;

    try {
      const res = await fetch(`${API_BASE_URL}/digital-sessions/start`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          joinUrl: params.joinUrl,
          title: params.title || 'Digitalt möte',
          meetingId: params.meetingId,
          maxMeetingMinutes: params.maxMeetingMinutes || 120,
        }),
      });

      if (res.status === 409) {
        setError('En digital session är redan aktiv.');
        setErrorCode('digital_session_already_active');
        setIsLocked(true);
        return false;
      }

      if (res.status === 400) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || 'Ogiltig Teams-länk.');
        setErrorCode(data.code || null);
        return false;
      }

      if (!res.ok) {
        throw new Error(`Start failed: ${res.status}`);
      }

      const data = await res.json();
      if (data.session) {
        setSession(data.session);
        setStatus(data.session.status);
        sessionIdRef.current = data.session.id;
      } else {
        setStatus('pending');
      }

      startPolling();
      return true;
    } catch (err: any) {
      console.error('Start digital session error:', err);
      setError(err.message || 'Kunde inte starta digital session');
      return false;
    }
  }, [startPolling]);

  const sessionAction = useCallback(async (action: 'pause' | 'resume' | 'stop') => {
    const token = getAuthToken();
    const id = sessionIdRef.current;
    if (!token || !id) return;

    try {
      const res = await fetch(`${API_BASE_URL}/digital-sessions/${id}/${action}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error(`${action} failed: ${res.status}`);
      }

      await fetchStatus();
    } catch (err: any) {
      console.error(`Digital session ${action} error:`, err);
      setError(err.message || `Kunde inte ${action === 'pause' ? 'pausa' : action === 'resume' ? 'återuppta' : 'stoppa'} sessionen`);
    }
  }, [fetchStatus]);

  const pauseSession = useCallback(() => sessionAction('pause'), [sessionAction]);
  const resumeSession = useCallback(() => sessionAction('resume'), [sessionAction]);
  const stopSession = useCallback(() => sessionAction('stop'), [sessionAction]);

  const retrySession = useCallback(() => {
    // Reset state and re-use last params if available (for interrupted sessions)
    stopPolling();
    setSession(null);
    setStatus('idle');
    setIsLocked(false);
    setError(null);
    setErrorCode(null);
    sessionIdRef.current = null;

    if (lastStartParamsRef.current) {
      startSession(lastStartParamsRef.current);
    }
  }, [stopPolling, startSession]);

  const reset = useCallback(() => {
    stopPolling();
    setSession(null);
    setStatus('idle');
    setIsLocked(false);
    setError(null);
    setErrorCode(null);
    sessionIdRef.current = null;
    lastStartParamsRef.current = null;
  }, [stopPolling]);

  const clearError = useCallback(() => {
    setError(null);
    setErrorCode(null);
  }, []);

  return {
    session,
    status,
    isActive,
    isLocked,
    lockedSessionInfo,
    error,
    errorCode,
    startSession,
    pauseSession,
    resumeSession,
    stopSession,
    retrySession,
    reset,
    clearError,
  };
};
