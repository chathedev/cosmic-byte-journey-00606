const BACKEND_URL = 'https://api.tivly.se';

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
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  async getHealth(): Promise<HealthCheck> {
    const response = await fetch(`${BACKEND_URL}/admin/backend/health`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  async getStorage(): Promise<StorageData> {
    const response = await fetch(`${BACKEND_URL}/admin/backend/storage`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  async getServices(): Promise<ServiceInfo> {
    const response = await fetch(`${BACKEND_URL}/admin/backend/services`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  async getLogs(lines: number = 100): Promise<{ ok: boolean; lines: string[]; total: number; showing: number }> {
    const response = await fetch(`${BACKEND_URL}/admin/backend/logs?lines=${lines}`, {
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
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  },
};
