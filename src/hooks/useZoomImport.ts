import { useState, useEffect, useCallback, useRef } from "react";

const API_BASE_URL = 'https://api.tivly.se';

export interface ZoomAccount {
  id: string;
  email: string;
  displayName: string;
  connectedAt: string;
  lastImportAt?: string;
  lastAuthorizedAt?: string;
}

export interface ZoomRecording {
  sourceType: 'cloud_recording';
  zoomMeetingId: string;
  meetingUuid: string;
  transcriptFileId: string;
  title: string;
  startDateTime: string;
  transcriptCreatedAt: string;
  hostEmail?: string;
  hostId?: string;
  durationMinutes?: number;
  transcriptFileType?: string;
  hasAudioFiles?: boolean;
}

export interface ZoomImportWarning {
  code: string;
  message?: string;
}

export interface ZoomImportLastError {
  code: string;
  message: string;
  updatedAt?: string;
}

export interface ZoomConnectionIssue {
  reason: string;
  message: string;
}

export interface ZoomAutoImportStatus {
  enabled: boolean;
  schedulerEnabled: boolean;
  intervalMs?: number;
  lastRunAt?: string | null;
  lastImportAt?: string | null;
  lastImportedMeetingId?: string | null;
  lastError?: ZoomImportLastError | null;
}

export interface ZoomImportStatus {
  enabled: boolean;
  configured: boolean;
  secureTokenStorage?: boolean;
  connected: boolean;
  reconnectRequired?: boolean;
  connectionIssue?: ZoomConnectionIssue | null;
  lookbackDays?: number;
  lastError?: ZoomImportLastError | null;
  account?: ZoomAccount | null;
  autoImport?: ZoomAutoImportStatus | null;
  scopes?: string[];
  requiredScopes?: string[];
  missingScopes?: string[];
  redirectTarget?: string;
}

export interface ZoomImportResult {
  imported: boolean;
  meeting: {
    id: string;
    title: string;
    status: string;
    transcript?: string;
    participants?: string[];
  };
}

export type ZoomImportState = 'idle' | 'connecting' | 'loading_recordings' | 'importing' | 'done' | 'error';

export const ZOOM_ERROR_CODE_LABELS: Record<string, string> = {
  zoom_import_disabled: 'Zoom-import är avstängd',
  zoom_not_configured: 'Zoom är inte konfigurerat',
  zoom_account_not_connected: 'Zoom-konto inte kopplat',
  zoom_reconnect_required: 'Zoom-kontot behöver kopplas om',
  zoom_missing_scopes: 'Zoom-kontot saknar nödvändiga behörigheter',
  zoom_token_storage_unavailable: 'Säker tokenlagring ej tillgänglig',
  missing_zoom_identifiers: 'Mötes-ID eller transkript-ID saknas',
  zoom_transcript_not_found: 'Transkriptet hittades inte',
  zoom_transcript_empty: 'Transkriptet var tomt',
  meeting_already_imported: 'Mötet har redan importerats',
};

const getAuthToken = (): string | null => localStorage.getItem('authToken');

export const useZoomImport = () => {
  const [state, setState] = useState<ZoomImportState>('idle');
  const [importStatus, setImportStatus] = useState<ZoomImportStatus | null>(null);
  const [recordings, setRecordings] = useState<ZoomRecording[]>([]);
  const [warnings, setWarnings] = useState<ZoomImportWarning[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ZoomImportResult | null>(null);
  const hasCheckedRef = useRef(false);

  const isFullyConnected = importStatus?.connected === true && !importStatus?.reconnectRequired;
  const needsReconnect = importStatus?.reconnectRequired === true;

  const handleError = useCallback((err: any, fallback: string) => {
    const code = err?.code || null;
    const message = err?.message || (code && ZOOM_ERROR_CODE_LABELS[code]) || fallback;
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
      const data = await fetchWithAuth('/zoom-import/status');
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
      const data = await fetchWithAuth('/zoom-import/connect');
      if (data.authorizationUrl) {
        window.location.href = data.authorizationUrl;
      } else if (data.connected) {
        setImportStatus(prev => prev ? { ...prev, connected: true, reconnectRequired: false, account: data.account } : prev);
        setState('idle');
      }
    } catch (err: any) {
      handleError(err, 'Kunde inte ansluta Zoom-konto');
    }
  }, [fetchWithAuth, handleError]);

  const disconnect = useCallback(async () => {
    setError(null);
    setErrorCode(null);
    try {
      await fetchWithAuth('/zoom-import/disconnect', { method: 'POST' });
      setImportStatus(prev => prev ? { ...prev, connected: false, reconnectRequired: false, account: null } : prev);
      setRecordings([]);
      setState('idle');
    } catch (err: any) {
      handleError(err, 'Kunde inte koppla bort Zoom-konto');
    }
  }, [fetchWithAuth, handleError]);

  const loadRecordings = useCallback(async () => {
    setState('loading_recordings');
    setError(null);
    setErrorCode(null);
    try {
      const data = await fetchWithAuth('/zoom-import/recordings');
      setRecordings(data.recordings || []);
      setWarnings(data.warnings || []);
      setState('idle');
    } catch (err: any) {
      handleError(err, 'Kunde inte hämta inspelningar');
    }
  }, [fetchWithAuth, handleError]);

  const importRecording = useCallback(async (
    recording: ZoomRecording,
    meetingId?: string,
    title?: string
  ): Promise<ZoomImportResult | null> => {
    setState('importing');
    setError(null);
    setErrorCode(null);
    try {
      const body: Record<string, any> = {
        meetingUuid: recording.meetingUuid,
        zoomMeetingId: recording.zoomMeetingId,
        transcriptFileId: recording.transcriptFileId,
        title: title || recording.title,
      };
      if (meetingId) body.meetingId = meetingId;

      const data = await fetchWithAuth('/zoom-import/recordings/import', {
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
      await fetchWithAuth('/zoom-import/auto-import', {
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

  // Handle Zoom OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const integrationStatus = params.get('status');
    const integration = params.get('integration');

    if (integration === 'zoom' && integrationStatus) {
      const url = new URL(window.location.href);
      url.searchParams.delete('status');
      url.searchParams.delete('integration');
      window.history.replaceState({}, '', url.toString());

      if (integrationStatus === 'success') {
        checkStatus();
      } else {
        setError('Zoom-anslutningen misslyckades. Försök igen.');
        setState('error');
      }
    }
  }, [checkStatus]);

  return {
    state,
    importStatus,
    recordings,
    warnings,
    error,
    errorCode,
    importResult,
    checkStatus,
    connect,
    disconnect,
    loadRecordings,
    importRecording,
    toggleAutoImport,
    reset,
    clearError,
    isFullyConnected,
    needsReconnect,
  };
};
