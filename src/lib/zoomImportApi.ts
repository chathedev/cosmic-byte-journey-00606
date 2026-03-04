const API_BASE_URL = 'https://api.tivly.se';

const getAuthToken = (): string | null => localStorage.getItem('authToken');

async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const token = getAuthToken();
  if (!token) throw new Error('No auth token');

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
    throw new Error(data.message || data.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

// ── Types ──

export interface ZoomImportCounts {
  activeTotal: number;
  activeAuto: number;
  activeManual: number;
  trashedTotal: number;
  trashedAuto: number;
  trashedManual: number;
  total: number;
}

export interface ZoomAdminUserRow {
  email: string;
  connected: boolean;
  reconnectRequired: boolean;
  accountEmail?: string;
  displayName?: string;
  autoImportEnabled: boolean;
  imports: ZoomImportCounts;
  lastError?: { code: string; message: string; updatedAt?: string } | null;
}

export interface ZoomAdminInsightsResponse {
  summary: {
    totalUsers: number;
    connectedUsers: number;
    reconnectRequiredUsers: number;
    usersWithAutoImportEnabled: number;
    activeImportedMeetings: number;
    activeAutoImportedMeetings: number;
    activeManualImportedMeetings: number;
    trashedImportedMeetings: number;
    companies: number;
    companiesWithConnectedUsers: number;
  };
  companies: Array<{
    company: { id: string; name: string };
    zoomImport: {
      connectedUserCount: number;
      autoImportEnabledUserCount: number;
      imports: ZoomImportCounts;
    };
    members: any[];
  }>;
  users: ZoomAdminUserRow[];
  timestamp: string;
}

export const adminZoomImportApi = {
  getInsights: (): Promise<ZoomAdminInsightsResponse> =>
    fetchWithAuth('/admin/digital-import/insights').then(data => ({
      ...data,
      // Extract Zoom-specific data from the shared insights endpoint
    })),

  resetUser: (email: string) =>
    fetchWithAuth(`/admin/zoom-import/users/${encodeURIComponent(email)}/reset`, {
      method: 'POST',
    }),

  toggleAutoImport: (email: string, enabled: boolean) =>
    fetchWithAuth(`/admin/zoom-import/users/${encodeURIComponent(email)}/auto-import`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),

  triggerAutoImportRun: () =>
    fetchWithAuth('/admin/zoom-import/auto-import/run', { method: 'POST' }),
};

// ── Org types ──

export interface ZoomOrgMemberRow {
  email: string;
  role: string;
  status: string;
  connected: boolean;
  accountEmail?: string;
  displayName?: string;
  autoImportEnabled: boolean;
  connectedAt?: string;
  lastImportAt?: string;
  lastError?: { code: string; message: string; updatedAt?: string } | null;
  imports: ZoomImportCounts;
}

export interface ZoomOrgInsights {
  company: { id: string; name: string };
  viewer: { email: string; role: string; canManageMembers: boolean; membershipSource: string };
  zoomImport: {
    connectedUserCount: number;
    autoImportEnabledUserCount: number;
    imports: ZoomImportCounts;
  };
  members: ZoomOrgMemberRow[];
  timestamp: string;
}

export const orgZoomImportApi = {
  getInsights: (companyId: string): Promise<ZoomOrgInsights> =>
    fetchWithAuth(`/enterprise/companies/${encodeURIComponent(companyId)}/digital-import/insights`).then(data => ({
      ...data,
    })),

  resetUser: (companyId: string, email: string) =>
    fetchWithAuth(`/enterprise/companies/${encodeURIComponent(companyId)}/zoom-import/users/${encodeURIComponent(email)}/reset`, {
      method: 'POST',
    }),

  toggleAutoImport: (companyId: string, email: string, enabled: boolean) =>
    fetchWithAuth(`/enterprise/companies/${encodeURIComponent(companyId)}/zoom-import/users/${encodeURIComponent(email)}/auto-import`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),
};
