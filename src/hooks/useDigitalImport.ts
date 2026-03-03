import { useState, useEffect, useCallback, useRef } from "react";

const API_BASE_URL = 'https://api.tivly.se';

export interface MicrosoftAccount {
  email: string;
  displayName: string;
  connectedAt: string;
  lastImportAt?: string;
  lastAuthorizedAt?: string;
}

export interface ImportableMeeting {
  meetingId: string;
  transcriptId: string;
  title: string;
  startDateTime: string;
  endDateTime: string;
  transcriptCreatedAt: string;
  contentCorrelationId?: string;
  organizerId?: string;
  organizerEmail?: string;
  hasAttendanceReport?: boolean;
}

export interface ImportStatus {
  enabled: boolean;
  configured: boolean;
  connected: boolean;
  account?: MicrosoftAccount | null;
  scopes?: string[];
}

export interface ImportResult {
  imported: boolean;
  meeting: {
    id: string;
    title: string;
    status: string;
    transcript?: string;
    participants?: string[];
  };
}

type ImportState = 'idle' | 'connecting' | 'loading_meetings' | 'importing' | 'done' | 'error';

const ERROR_CODE_LABELS: Record<string, string> = {
  digital_import_disabled: 'Importfunktionen är avstängd',
  microsoft_graph_not_configured: 'Microsoft Graph är inte konfigurerat',
  microsoft_account_not_connected: 'Microsoft-konto inte kopplat',
  missing_graph_identifiers: 'Mötes-ID eller transkript-ID saknas',
  microsoft_token_request_failed: 'Kunde inte autentisera med Microsoft',
  microsoft_graph_request_failed: 'Microsoft Graph-anrop misslyckades',
  microsoft_transcript_empty: 'Transkriptet var tomt',
};

const getAuthToken = (): string | null => localStorage.getItem('authToken');

interface UseDigitalImportReturn {
  state: ImportState;
  importStatus: ImportStatus | null;
  meetings: ImportableMeeting[];
  error: string | null;
  errorCode: string | null;
  importResult: ImportResult | null;
  checkStatus: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  loadMeetings: () => Promise<void>;
  importMeeting: (meeting: ImportableMeeting, meetingId?: string, title?: string) => Promise<ImportResult | null>;
  reset: () => void;
  clearError: () => void;
}

export const useDigitalImport = (): UseDigitalImportReturn => {
  const [state, setState] = useState<ImportState>('idle');
  const [importStatus, setImportStatus] = useState<ImportStatus | null>(null);
  const [meetings, setMeetings] = useState<ImportableMeeting[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const hasCheckedRef = useRef(false);

  const handleError = useCallback((err: any, fallback: string) => {
    const code = err?.code || null;
    const message = err?.message || (code && ERROR_CODE_LABELS[code]) || fallback;
    setError(message);
    setErrorCode(code);
    setState('error');
  }, []);

  const fetchWithAuth = useCallback(async (endpoint: string, options: RequestInit = {}) => {
    const token = getAuthToken();
    if (!token) throw { message: 'Ingen autentiseringstoken hittades', code: 'no_auth' };

    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw { message: data.message || data.error || `Request failed: ${res.status}`, code: data.code || null };
    }

    return res.json();
  }, []);

  const checkStatus = useCallback(async () => {
    try {
      const data = await fetchWithAuth('/digital-import/status');
      setImportStatus(data);
      if (data.connected && data.account) {
        // Auto-load meetings if connected
        setState('idle');
      }
    } catch (err: any) {
      // Non-fatal – just means import is not available
      setImportStatus({ enabled: false, configured: false, connected: false });
    }
  }, [fetchWithAuth]);

  const connect = useCallback(async () => {
    setState('connecting');
    setError(null);
    setErrorCode(null);
    try {
      const data = await fetchWithAuth('/digital-import/microsoft/connect');
      if (data.authorizationUrl) {
        // Redirect to Microsoft OAuth
        window.location.href = data.authorizationUrl;
      } else if (data.connected) {
        setImportStatus(prev => prev ? { ...prev, connected: true, account: data.account } : prev);
        setState('idle');
      }
    } catch (err: any) {
      handleError(err, 'Kunde inte ansluta Microsoft-konto');
    }
  }, [fetchWithAuth, handleError]);

  const disconnect = useCallback(async () => {
    setError(null);
    setErrorCode(null);
    try {
      await fetchWithAuth('/digital-import/microsoft/disconnect', { method: 'POST' });
      setImportStatus(prev => prev ? { ...prev, connected: false, account: null } : prev);
      setMeetings([]);
      setState('idle');
    } catch (err: any) {
      handleError(err, 'Kunde inte koppla bort Microsoft-konto');
    }
  }, [fetchWithAuth, handleError]);

  const loadMeetings = useCallback(async () => {
    setState('loading_meetings');
    setError(null);
    setErrorCode(null);
    try {
      const data = await fetchWithAuth('/digital-import/meetings');
      setMeetings(data.meetings || []);
      setState('idle');
    } catch (err: any) {
      handleError(err, 'Kunde inte hämta möten');
    }
  }, [fetchWithAuth, handleError]);

  const importMeeting = useCallback(async (
    meeting: ImportableMeeting,
    meetingId?: string,
    title?: string
  ): Promise<ImportResult | null> => {
    setState('importing');
    setError(null);
    setErrorCode(null);
    try {
      const data = await fetchWithAuth('/digital-import/meetings/import', {
        method: 'POST',
        body: JSON.stringify({
          graphMeetingId: meeting.meetingId,
          transcriptId: meeting.transcriptId,
          meetingId,
          title: title || meeting.title,
        }),
      });
      setImportResult(data);
      setState('done');
      return data;
    } catch (err: any) {
      handleError(err, 'Import misslyckades');
      return null;
    }
  }, [fetchWithAuth, handleError]);

  const reset = useCallback(() => {
    setState('idle');
    setError(null);
    setErrorCode(null);
    setImportResult(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
    setErrorCode(null);
    if (state === 'error') setState('idle');
  }, [state]);

  // Check status on mount
  useEffect(() => {
    if (!hasCheckedRef.current) {
      hasCheckedRef.current = true;
      checkStatus();
    }
  }, [checkStatus]);

  // Check for callback return (after Microsoft OAuth redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const integrationStatus = params.get('status');
    const integration = params.get('integration');
    
    if (integration === 'microsoft' && integrationStatus) {
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete('status');
      url.searchParams.delete('integration');
      window.history.replaceState({}, '', url.toString());

      if (integrationStatus === 'success') {
        checkStatus();
      } else {
        setError('Microsoft-anslutningen misslyckades. Försök igen.');
        setState('error');
      }
    }
  }, [checkStatus]);

  return {
    state,
    importStatus,
    meetings,
    error,
    errorCode,
    importResult,
    checkStatus,
    connect,
    disconnect,
    loadMeetings,
    importMeeting,
    reset,
    clearError,
  };
};
