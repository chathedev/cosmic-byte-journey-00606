import { LyraLearningEntry, SISLearningEntry } from './asrService';

const BACKEND_URL = 'https://api.tivly.se';

// Re-export for convenience
export type { LyraLearningEntry, SISLearningEntry };

export interface SpeakerNamesResponse {
  speakerNames: Record<string, string>;
  sisLearning?: LyraLearningEntry[];
  lyraLearning?: LyraLearningEntry[];
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

export interface ASRLogsResponse {
  ok: boolean;
  lines: string[];
  total: number;
  showing: number;
  requested: number;
  level?: string;
  keyword?: string;
  message?: string;
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

  async getASRLogs(options: { lines?: number; level?: string; keyword?: string } = {}): Promise<ASRLogsResponse> {
    const params = new URLSearchParams();
    if (options.lines) params.set('lines', String(options.lines));
    if (options.level) params.set('level', options.level);
    if (options.keyword) params.set('keyword', options.keyword);
    
    const response = await fetch(`${BACKEND_URL}/admin/logs?${params.toString()}`, {
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

  // Speaker Names Management - Lyra Voice Learning Integration
  // Per docs: PUT /meetings/:meetingId/speaker-names with { speakerNames: { label: name } }
  // Backend validates, updates meeting record, associates with Lyra voices, persists aliases
  // If a user manually labels a speaker with a name that uniquely matches an existing Lyra alias,
  // Lyra will associate that label to the member for future meetings and learning.
  async saveSpeakerNames(meetingId: string, speakerNames: Record<string, string>): Promise<SpeakerNamesResponse> {
    // Validate: speakerNames must be object with non-empty string values (per docs)
    const cleanedNames: Record<string, string> = {};
    for (const [key, value] of Object.entries(speakerNames)) {
      if (typeof value === 'string' && value.trim()) {
        cleanedNames[key] = value.trim();
      }
    }

    console.log(`[Lyra] PUT /meetings/${meetingId}/speaker-names:`, cleanedNames);

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
    
    // Log voice learning results per docs section 4
    // Use lyraLearning if available, fallback to sisLearning
    const learningData = data.lyraLearning || data.sisLearning || [];
    if (learningData.length > 0) {
      console.log('[Lyra] Voice learning results:');
      learningData.forEach((entry: SISLearningEntry) => {
        const status = entry.updated ? '✓ LEARNED' : '○ Matched';
        const similarity = entry.similarityPercent || Math.round(entry.similarity * 100);
        console.log(`  ${status} ${entry.email}: ${similarity}% (${entry.matchedSegments || 0} segments)`);
      });
    }

    // Return the updated speakerNames from backend (which may include auto-applied aliases)
    return {
      speakerNames: data.speakerNames || data.lyraSpeakerNames || cleanedNames,
      sisLearning: learningData,
    };
  },

  // Per docs: GET /meetings/:meetingId/speaker-names
  // Backend resolves missing state and returns sanitized speakerNames map
  async getSpeakerNames(meetingId: string): Promise<SpeakerNamesResponse> {
    try {
      console.log(`[Lyra] GET /meetings/${meetingId}/speaker-names`);
      
      const response = await fetch(`${BACKEND_URL}/meetings/${meetingId}/speaker-names`, {
        method: 'GET',
        credentials: 'include',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.log('[Lyra] Speaker names not found (404) - returning empty');
          return { speakerNames: {}, sisLearning: [] };
        }
        console.warn('[Lyra] Could not fetch speaker names:', response.status);
        return { speakerNames: {}, sisLearning: [] };
      }

      const data = await response.json();
      
      // Use lyraSpeakerNames if available, fallback to speakerNames
      const names = data.lyraSpeakerNames || data.speakerNames || {};
      if (Object.keys(names).length > 0) {
        console.log('[Lyra] Loaded speaker names:', names);
      }
      
      return {
        speakerNames: names,
        sisLearning: data.lyraLearning || data.sisLearning || [],
      };
    } catch (error) {
      console.warn('[Lyra] Get speaker names error:', error);
      return { speakerNames: {}, sisLearning: [] };
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
