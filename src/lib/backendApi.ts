import { SISLearningEntry } from './asrService';

const BACKEND_URL = 'https://api.tivly.se';

// Re-export for convenience
export type { SISLearningEntry };

export interface SpeakerNamesResponse {
  speakerNames: Record<string, string>;
  sisLearning?: SISLearningEntry[];
}

export interface DashboardData {
  status: string;
  uptime: {
    seconds: number;
    formatted: string;
    days: number;
    hours: number;
    minutes: number;
  };
  storage: {
    status: string;
    total: {
      bytes: number;
      formatted: string;
    };
    breakdown: {
      users: { bytes: number; formatted: string; count: number };
      agendas: { bytes: number; formatted: string; count: number };
      campaigns: { bytes: number; formatted: string; count: number };
    };
  };
  database: {
    type: string;
    status: string;
    collections: {
      users: number;
      agendas: number;
      campaigns: number;
      roles: number;
    };
  };
  functions: {
    status: string;
    endpoints: {
      total: number;
      admin: number;
      public: number;
    };
  };
  services: {
    smtp: {
      status: string;
      configured: boolean;
      host: string;
    };
    stripe: {
      status: string;
      configured: boolean;
      mode: string;
    };
  };
  memory: {
    system: {
      total: { bytes: number; formatted: string };
      free: { bytes: number; formatted: string };
      used: { bytes: number; formatted: string };
      usagePercent: number;
    };
    process: {
      heapUsed: { bytes: number; formatted: string };
      heapTotal: { bytes: number; formatted: string };
      rss: { bytes: number; formatted: string };
    };
  };
  environment: {
    nodeVersion: string;
    platform: string;
    arch: string;
    cpus: number;
    pid: number;
    hostname: string;
  };
}

export interface HealthCheck {
  overall: 'healthy' | 'unhealthy' | 'warning';
  timestamp: string;
  checks: Array<{
    name: string;
    status: 'healthy' | 'unhealthy' | 'warning' | 'not configured';
    message: string;
  }>;
}

export interface StorageData {
  total: { bytes: number; formatted: string };
  directories: Array<{
    name: string;
    path: string;
    size: { bytes: number; formatted: string };
    fileCount: number;
  }>;
}

export interface ServiceInfo {
  services: {
    [key: string]: {
      name: string;
      status: string;
      configured: boolean;
      config?: any;
      healthy: boolean;
    };
  };
}

export interface BackupResponse {
  ok: boolean;
  backup: {
    timestamp: string;
    version: string;
    data: any;
  };
  summary: {
    users: number;
    agendas: number;
    campaigns: number;
    roles: number;
  };
}

export interface CleanupResponse {
  ok: boolean;
  message: string;
  deletedCount: number;
  freedSpace: { bytes: number; formatted: string };
}

const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
};

export const backendApi = {
  async getDashboard(): Promise<DashboardData> {
    const response = await fetch(`${BACKEND_URL}/admin/backend/dashboard`, {
      credentials: 'include',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  async getHealth(): Promise<HealthCheck> {
    const response = await fetch(`${BACKEND_URL}/admin/backend/health`, {
      credentials: 'include',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  async getStorage(): Promise<StorageData> {
    const response = await fetch(`${BACKEND_URL}/admin/backend/storage`, {
      credentials: 'include',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  async getServices(): Promise<ServiceInfo> {
    const response = await fetch(`${BACKEND_URL}/admin/backend/services`, {
      credentials: 'include',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  async getLogs(lines: number = 100): Promise<{ ok: boolean; lines: string[]; total: number; showing: number }> {
    const response = await fetch(`${BACKEND_URL}/admin/backend/logs?lines=${lines}`, {
      credentials: 'include',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  async cleanup(target: 'transcriptions' | 'conversions' | 'all' = 'all'): Promise<CleanupResponse> {
    const response = await fetch(`${BACKEND_URL}/admin/backend/cleanup`, {
      method: 'POST',
      credentials: 'include',
      headers: getAuthHeaders(),
      body: JSON.stringify({ target }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  async backup(collections: string[] = ['all']): Promise<BackupResponse> {
    const response = await fetch(`${BACKEND_URL}/admin/backend/backup`, {
      method: 'POST',
      credentials: 'include',
      headers: getAuthHeaders(),
      body: JSON.stringify({ collections }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  async restart(): Promise<{ ok: boolean; message: string }> {
    const response = await fetch(`${BACKEND_URL}/admin/backend/restart`, {
      method: 'POST',
      credentials: 'include',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  // Protocol Management
  async saveProtocol(meetingId: string, data: { fileName: string; mimeType: string; documentBlob: string }): Promise<any> {
    const response = await fetch(`${BACKEND_URL}/meetings/${meetingId}/protocol`, {
      method: 'POST',
      credentials: 'include',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      if (response.status === 409) {
        // Protocol exists, use PUT to replace
        return this.replaceProtocol(meetingId, data);
      }
      const error = await response.json().catch(() => ({ error: 'Failed to save protocol' }));
      throw new Error(error.message || error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  async replaceProtocol(meetingId: string, data: { fileName: string; mimeType: string; documentBlob: string }): Promise<any> {
    const response = await fetch(`${BACKEND_URL}/meetings/${meetingId}/protocol`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to replace protocol' }));
      throw new Error(error.message || error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  async getProtocol(meetingId: string): Promise<any> {
    const response = await fetch(`${BACKEND_URL}/meetings/${meetingId}/protocol`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      const error = await response.json().catch(() => ({ error: 'Failed to get protocol' }));
      throw new Error(error.message || error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  async deleteProtocol(meetingId: string): Promise<any> {
    const response = await fetch(`${BACKEND_URL}/meetings/${meetingId}/protocol`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to delete protocol' }));
      throw new Error(error.message || error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  // Speaker Names Management - Voice Learning Integration
  // When speaker names are saved, backend associates them with SIS voice matches
  // and persists aliases for future meetings with the same voices
  async saveSpeakerNames(meetingId: string, speakerNames: Record<string, string>): Promise<SpeakerNamesResponse> {
    // Filter out empty names
    const cleanedNames: Record<string, string> = {};
    for (const [key, value] of Object.entries(speakerNames)) {
      if (typeof value === 'string' && value.trim()) {
        cleanedNames[key] = value.trim();
      }
    }

    console.log(`[SIS] Saving speaker names for meeting ${meetingId}:`, cleanedNames);

    const response = await fetch(`${BACKEND_URL}/meetings/${meetingId}/speaker-names`, {
      method: 'PUT',
      credentials: 'include',
      headers: getAuthHeaders(),
      body: JSON.stringify({ speakerNames: cleanedNames }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to save speaker names' }));
      throw new Error(error.message || error.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // Log voice learning results
    if (data.sisLearning && data.sisLearning.length > 0) {
      console.log('[SIS] Voice learning results:');
      data.sisLearning.forEach((entry: SISLearningEntry) => {
        const status = entry.updated ? '✓ Updated' : '○ Matched';
        console.log(`  ${status} ${entry.email}: ${Math.round(entry.similarity * 100)}%`);
      });
    }

    return {
      speakerNames: data.speakerNames || cleanedNames,
      sisLearning: data.sisLearning,
    };
  },

  async getSpeakerNames(meetingId: string): Promise<SpeakerNamesResponse> {
    try {
      const response = await fetch(`${BACKEND_URL}/meetings/${meetingId}/speaker-names`, {
        method: 'GET',
        credentials: 'include',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        if (response.status === 404) {
          return { speakerNames: {} };
        }
        console.warn('[SIS] Could not fetch speaker names:', response.status);
        return { speakerNames: {} };
      }

      const data = await response.json();
      return {
        speakerNames: data.speakerNames || {},
        sisLearning: data.sisLearning,
      };
    } catch (error) {
      console.warn('[SIS] Get speaker names error:', error);
      return { speakerNames: {} };
    }
  },

  // Admin Auth Management
  async resetUserAuth(email: string): Promise<{ ok: boolean; user: any }> {
    const response = await fetch(`${BACKEND_URL}/admin/users/auth/reset`, {
      method: 'POST',
      credentials: 'include',
      headers: getAuthHeaders(),
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Det gick inte att återställa auth-data' }));
      throw new Error(error.message || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  },
};
