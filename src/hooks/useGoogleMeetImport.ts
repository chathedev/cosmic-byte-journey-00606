import { useState, useEffect, useCallback, useRef } from "react";

const API_BASE_URL = 'https://api.tivly.se';

export interface GoogleMeetAccount {
  id: string;
  email: string;
  displayName: string;
  connectedAt: string;
  lastImportAt?: string;
  lastAuthorizedAt?: string;
}

export interface GoogleMeetMeeting {
  sourceType: 'google_meet';
  googleEventId: string;
  transcriptDocumentId: string;
  meetingCode?: string;
  title: string;
  startDateTime: string;
  endDateTime?: string;
  transcriptCreatedAt: string;
  organizerEmail?: string;
  transcriptDocumentName?: string;
}

export interface GoogleMeetImportWarning {
  code: string;
  message?: string;
}

export interface GoogleMeetImportLastError {
  code: string;
  message: string;
  updatedAt?: string;
}

export interface GoogleMeetConnectionIssue {
  reason: string;
  message: string;
}

export interface GoogleMeetAutoImportStatus {
  enabled: boolean;
  schedulerEnabled: boolean;
  intervalMs?: number;
  lastRunAt?: string | null;
  lastImportAt?: string | null;
  lastImportedMeetingId?: string | null;
  lastError?: GoogleMeetImportLastError | null;
}

export interface GoogleMeetImportStatus {
  enabled: boolean;
  configured: boolean;
  secureTokenStorage?: boolean;
  connected: boolean;
  reconnectRequired?: boolean;
  connectionIssue?: GoogleMeetConnectionIssue | null;
  lookbackDays?: number;
  lastError?: GoogleMeetImportLastError | null;
  account?: GoogleMeetAccount | null;
  autoImport?: GoogleMeetAutoImportStatus | null;
  scopes?: string[];
  grantedScopes?: string[];
  requiredScopes?: string[];
  missingScopes?: string[];
  redirectTarget?: string;
}

export interface GoogleMeetImportResult {
  imported: boolean;
  meeting: {
    id: string;
    title: string;
    status: string;
    transcript?: string;
    participants?: string[];
  };
}

export type GoogleMeetImportState = 'idle' | 'connecting' | 'loading_meetings' | 'importing' | 'done' | 'error';

export const GOOGLE_MEET_ERROR_CODE_LABELS: Record<string, string> = {
  google_meet_import_disabled: 'Google Meet-import är avstängd',
  google_meet_not_configured: 'Google Meet är inte konfigurerat',
  google_meet_account_not_connected: 'Google-konto inte kopplat',
  google_meet_reconnect_required: 'Google-kontot behöver kopplas om',
  google_meet_missing_scopes: 'Google-kontot saknar nödvändiga behörigheter',
  google_meet_token_storage_unavailable: 'Säker tokenlagring ej tillgänglig',
  missing_google_meet_identifiers: 'Mötes-ID eller transkript-ID saknas',
  google_meet_calendar_meetings_only: 'Endast kalenderbaserade Google Meet-möten stöds',
  google_meet_transcript_not_found: 'Transkriptet hittades inte',
  google_meet_transcript_empty: 'Transkriptet var tomt',
  meeting_already_imported: 'Mötet har redan importerats',
};

const getAuthToken = (): string | null => localStorage.getItem('authToken');

export const useGoogleMeetImport = () => {
  const [state, setState] = useState<GoogleMeetImportState>('idle');
  const [importStatus, setImportStatus] = useState<GoogleMeetImportStatus | null>(null);
  const [meetings, setMeetings] = useState<GoogleMeetMeeting[]>([]);
  const [warnings, setWarnings] = useState<GoogleMeetImportWarning[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<GoogleMeetImportResult | null>(null);
  const hasCheckedRef = useRef(false);

  const isFullyConnected = importStatus?.connected === true && !importStatus?.reconnectRequired;
  const needsReconnect = importStatus?.reconnectRequired === true;

  const handleError = useCallback((err: any, fallback: string) => {
    const code = err?.code || null;
    const message = err?.message || (code && GOOGLE_MEET_ERROR_CODE_LABELS[code]) || fallback;
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
      const data = await fetchWithAuth('/google-meet-import/status');
      setImportStatus(data);
      if (data.connected && !data.reconnectRequired) {
        setState('idle');
      }
    } catch (err: any) {
      setImportStatus({ enabled: false, configured: false, connected: false });
    }
  }, [fetchWithAuth]);

  const connect = useCallback(async () => {
    setState('connecting');
    setError(null);
    setErrorCode(null);
    try {
      const data = await fetchWithAuth('/google-meet-import/connect');
      if (data.authorizationUrl) {
        window.location.href = data.authorizationUrl;
      } else if (data.connected) {
        setImportStatus(prev => prev ? { ...prev, connected: true, reconnectRequired: false, account: data.account } : prev);
        setState('idle');
      }
    } catch (err: any) {
      handleError(err, 'Kunde inte ansluta Google-konto');
    }
  }, [fetchWithAuth, handleError]);

  const disconnect = useCallback(async () => {
    setError(null);
    setErrorCode(null);
    try {
      await fetchWithAuth('/google-meet-import/disconnect', { method: 'POST' });
      setImportStatus(prev => prev ? { ...prev, connected: false, reconnectRequired: false, account: null } : prev);
      setMeetings([]);
      setState('idle');
    } catch (err: any) {
      handleError(err, 'Kunde inte koppla bort Google-konto');
    }
  }, [fetchWithAuth, handleError]);

  const loadMeetings = useCallback(async () => {
    setState('loading_meetings');
    setError(null);
    setErrorCode(null);
    try {
      const data = await fetchWithAuth('/google-meet-import/meetings');
      setMeetings(data.meetings || []);
      setWarnings(data.warnings || []);
      setState('idle');
    } catch (err: any) {
      handleError(err, 'Kunde inte hämta möten');
    }
  }, [fetchWithAuth, handleError]);

  const importMeeting = useCallback(async (
    meeting: GoogleMeetMeeting,
    meetingId?: string,
    title?: string
  ): Promise<GoogleMeetImportResult | null> => {
    setState('importing');
    setError(null);
    setErrorCode(null);
    try {
      const body: Record<string, any> = {
        googleEventId: meeting.googleEventId,
        transcriptDocumentId: meeting.transcriptDocumentId,
        title: title || meeting.title,
      };
      if (meetingId) body.meetingId = meetingId;

      const data = await fetchWithAuth('/google-meet-import/meetings/import', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setImportResult(data);
      setState('done');
      return data;
    } catch (err: any) {
      handleError(err, 'Import misslyckades');
      return null;
    }
  }, [fetchWithAuth, handleError]);

  const toggleAutoImport = useCallback(async (enabled: boolean) => {
    setError(null);
    setErrorCode(null);
    try {
      await fetchWithAuth('/google-meet-import/auto-import', {
        method: 'POST',
        body: JSON.stringify({ enabled }),
      });
      setImportStatus(prev => prev ? {
        ...prev,
        autoImport: prev.autoImport ? { ...prev.autoImport, enabled } : { enabled, schedulerEnabled: true },
      } : prev);
    } catch (err: any) {
      handleError(err, 'Kunde inte ändra automatisk import');
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

  useEffect(() => {
    if (!hasCheckedRef.current) {
      hasCheckedRef.current = true;
      checkStatus();
    }
  }, [checkStatus]);

  // Handle Google OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const integrationStatus = params.get('status');
    const integration = params.get('integration');

    if (integration === 'google_meet' && integrationStatus) {
      const url = new URL(window.location.href);
      url.searchParams.delete('status');
      url.searchParams.delete('integration');
      window.history.replaceState({}, '', url.toString());

      if (integrationStatus === 'success') {
        checkStatus();
      } else {
        setError('Google-anslutningen misslyckades. Försök igen.');
        setState('error');
      }
    }
  }, [checkStatus]);

  return {
    state,
    importStatus,
    meetings,
    warnings,
    error,
    errorCode,
    importResult,
    checkStatus,
    connect,
    disconnect,
    loadMeetings,
    importMeeting,
    toggleAutoImport,
    reset,
    clearError,
    isFullyConnected,
    needsReconnect,
  };
};
