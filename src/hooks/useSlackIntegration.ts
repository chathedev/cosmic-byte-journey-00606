import { useState, useEffect, useCallback, useRef } from "react";

const API_BASE_URL = 'https://api.tivly.se';

export interface SlackAccount {
  workspaceId: string;
  workspaceName: string;
  botUserId?: string;
  connectedAt: string;
  lastAuthorizedAt?: string;
  lastSharedAt?: string;
  lastSharedMeetingId?: string;
  lastSharedChannelId?: string;
}

export interface SlackAutoShareStatus {
  enabled: boolean;
  channelId?: string;
  channelName?: string;
  manualSharesCount: number;
  autoSharesCount: number;
  lastSharedAt?: string | null;
  lastSharedMeetingId?: string | null;
  lastSharedChannelId?: string | null;
  lastError?: { code: string; message: string; updatedAt?: string } | null;
}

export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  isMember: boolean;
}

export interface SlackConnectionIssue {
  reason: string;
  message: string;
}

export interface SlackImportStatus {
  enabled: boolean;
  configured: boolean;
  secureTokenStorage?: boolean;
  connected: boolean;
  reconnectRequired?: boolean;
  connectionIssue?: SlackConnectionIssue | null;
  lastError?: { code: string; message: string; updatedAt?: string } | null;
  account?: SlackAccount | null;
  autoShare?: SlackAutoShareStatus | null;
  scopes?: string[];
  grantedScopes?: string[];
  requiredScopes?: string[];
  missingScopes?: string[];
  redirectTarget?: string;
}

export interface SlackShareResult {
  shared: boolean;
  channelId: string;
  channelName?: string;
  messageTs?: string;
  meetingId?: string;
  shareLink?: {
    token?: string;
    url?: string;
    appUrl?: string;
    createdAt?: string;
    updatedAt?: string;
  };
}

export type SlackState = 'idle' | 'connecting' | 'loading_channels' | 'sharing' | 'done' | 'error';

export const SLACK_ERROR_CODE_LABELS: Record<string, string> = {
  slack_integration_disabled: 'Slack-integration är avstängd',
  slack_not_configured: 'Slack är inte konfigurerat',
  slack_account_not_connected: 'Slack-workspace inte kopplat',
  slack_reconnect_required: 'Slack-kontot behöver kopplas om',
  slack_missing_scopes: 'Slack-kontot saknar nödvändiga behörigheter',
  slack_token_storage_unavailable: 'Säker tokenlagring ej tillgänglig',
  slack_channel_not_found: 'Kanalen hittades inte',
  slack_share_failed: 'Kunde inte dela till Slack',
};

const getAuthToken = (): string | null => localStorage.getItem('authToken');

export const useSlackIntegration = () => {
  const [state, setState] = useState<SlackState>('idle');
  const [importStatus, setImportStatus] = useState<SlackImportStatus | null>(null);
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const hasCheckedRef = useRef(false);

  const isFullyConnected = importStatus?.connected === true && !importStatus?.reconnectRequired;
  const needsReconnect = importStatus?.reconnectRequired === true;

  const handleError = useCallback((err: any, fallback: string) => {
    const code = err?.code || null;
    const message = err?.message || (code && SLACK_ERROR_CODE_LABELS[code]) || fallback;
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
      const data = await fetchWithAuth('/slack-integration/status');
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
      const data = await fetchWithAuth('/slack-integration/connect');
      if (data.authorizationUrl) {
        window.location.href = data.authorizationUrl;
      } else if (data.connected) {
        setImportStatus(prev => prev ? { ...prev, connected: true, reconnectRequired: false, account: data.account } : prev);
        setState('idle');
      }
    } catch (err: any) {
      handleError(err, 'Kunde inte ansluta Slack-workspace');
    }
  }, [fetchWithAuth, handleError]);

  const disconnect = useCallback(async () => {
    setError(null);
    setErrorCode(null);
    try {
      await fetchWithAuth('/slack-integration/disconnect', { method: 'POST' });
      setImportStatus(prev => prev ? { ...prev, connected: false, reconnectRequired: false, account: null, autoShare: null } : prev);
      setChannels([]);
      setState('idle');
    } catch (err: any) {
      handleError(err, 'Kunde inte koppla bort Slack-workspace');
    }
  }, [fetchWithAuth, handleError]);

  const loadChannels = useCallback(async () => {
    setState('loading_channels');
    setError(null);
    setErrorCode(null);
    try {
      const data = await fetchWithAuth('/slack-integration/channels');
      setChannels(data.channels || []);
      setState('idle');
    } catch (err: any) {
      handleError(err, 'Kunde inte hämta kanaler');
    }
  }, [fetchWithAuth, handleError]);

  const updateSettings = useCallback(async (settings: {
    autoShareEnabled: boolean;
    channelId?: string;
    channelName?: string;
  }) => {
    setError(null);
    setErrorCode(null);
    try {
      await fetchWithAuth('/slack-integration/settings', {
        method: 'POST',
        body: JSON.stringify(settings),
      });
      setImportStatus(prev => prev ? {
        ...prev,
        autoShare: prev.autoShare ? {
          ...prev.autoShare,
          enabled: settings.autoShareEnabled,
          channelId: settings.channelId || prev.autoShare.channelId,
          channelName: settings.channelName || prev.autoShare.channelName,
        } : {
          enabled: settings.autoShareEnabled,
          channelId: settings.channelId,
          channelName: settings.channelName,
          manualSharesCount: 0,
          autoSharesCount: 0,
        },
      } : prev);
    } catch (err: any) {
      handleError(err, 'Kunde inte spara inställningar');
    }
  }, [fetchWithAuth, handleError]);

  const shareToSlack = useCallback(async (meetingId: string, channelId: string): Promise<SlackShareResult | null> => {
    setState('sharing');
    setError(null);
    setErrorCode(null);
    try {
      const data = await fetchWithAuth('/slack-integration/share', {
        method: 'POST',
        body: JSON.stringify({ meetingId, channelId }),
      });
      setState('done');
      return data;
    } catch (err: any) {
      handleError(err, 'Kunde inte dela till Slack');
      return null;
    }
  }, [fetchWithAuth, handleError]);

  const createShareLink = useCallback(async (meetingId: string, rotate = false) => {
    try {
      const data = await fetchWithAuth(`/meetings/${meetingId}/protocol/share-link`, {
        method: 'POST',
        body: JSON.stringify({ rotate }),
      });
      return data;
    } catch (err: any) {
      handleError(err, 'Kunde inte skapa delningslänk');
      return null;
    }
  }, [fetchWithAuth, handleError]);

  const reset = useCallback(() => {
    setState('idle');
    setError(null);
    setErrorCode(null);
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

  // Handle Slack OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const integrationStatus = params.get('status');
    const integration = params.get('integration');

    if (integration === 'slack' && integrationStatus) {
      const url = new URL(window.location.href);
      url.searchParams.delete('status');
      url.searchParams.delete('integration');
      window.history.replaceState({}, '', url.toString());

      if (integrationStatus === 'success') {
        checkStatus();
      } else {
        setError('Slack-anslutningen misslyckades. Försök igen.');
        setState('error');
      }
    }
  }, [checkStatus]);

  return {
    state,
    importStatus,
    channels,
    error,
    errorCode,
    checkStatus,
    connect,
    disconnect,
    loadChannels,
    updateSettings,
    shareToSlack,
    createShareLink,
    reset,
    clearError,
    isFullyConnected,
    needsReconnect,
  };
};
