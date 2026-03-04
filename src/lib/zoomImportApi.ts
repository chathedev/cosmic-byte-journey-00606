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

const normalizeCounts = (counts: any): ZoomImportCounts => ({
  activeTotal: Number(counts?.activeTotal ?? 0),
  activeAuto: Number(counts?.activeAuto ?? 0),
  activeManual: Number(counts?.activeManual ?? 0),
  trashedTotal: Number(counts?.trashedTotal ?? 0),
  trashedAuto: Number(counts?.trashedAuto ?? 0),
  trashedManual: Number(counts?.trashedManual ?? 0),
  total: Number(counts?.total ?? 0),
});

export const adminZoomImportApi = {
  getInsights: (): Promise<ZoomAdminInsightsResponse> =>
    fetchWithAuth('/admin/digital-import/insights').then((data) => ({
      summary: {
        totalUsers: Number(data?.summary?.totalUsers ?? 0),
        connectedUsers: Number(data?.summary?.connectedUsers ?? 0),
        reconnectRequiredUsers: Number(data?.summary?.reconnectRequiredUsers ?? 0),
        usersWithAutoImportEnabled: Number(data?.summary?.usersWithAutoImportEnabled ?? 0),
        activeImportedMeetings: Number(data?.summary?.activeImportedMeetings ?? 0),
        activeAutoImportedMeetings: Number(data?.summary?.activeAutoImportedMeetings ?? 0),
        activeManualImportedMeetings: Number(data?.summary?.activeManualImportedMeetings ?? 0),
        trashedImportedMeetings: Number(data?.summary?.trashedImportedMeetings ?? 0),
        companies: Number(data?.summary?.companies ?? 0),
        companiesWithConnectedUsers: Number(data?.summary?.companiesWithConnectedUsers ?? 0),
      },
      companies: Array.isArray(data?.companies)
        ? data.companies.map((c: any) => ({
            company: {
              id: c?.company?.id ?? '',
              name: c?.company?.name ?? 'Okänt företag',
            },
            zoomImport: {
              connectedUserCount: Number(c?.zoomImport?.connectedUserCount ?? 0),
              autoImportEnabledUserCount: Number(c?.zoomImport?.autoImportEnabledUserCount ?? 0),
              imports: normalizeCounts(c?.zoomImport?.imports),
            },
            members: Array.isArray(c?.members) ? c.members : [],
          }))
        : [],
      users: Array.isArray(data?.users)
        ? data.users.map((u: any) => ({
            email: u?.email ?? '',
            connected: Boolean(u?.connected),
            reconnectRequired: Boolean(u?.reconnectRequired),
            accountEmail: u?.accountEmail,
            displayName: u?.displayName,
            autoImportEnabled: Boolean(u?.autoImportEnabled),
            imports: normalizeCounts(u?.imports),
            lastError: u?.lastError ?? null,
          }))
        : [],
      timestamp: data?.timestamp ?? new Date().toISOString(),
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
  zoomImport?: {
    connected: boolean;
    reconnectRequired: boolean;
    accountEmail?: string | null;
    displayName?: string | null;
    accountId?: string | null;
    autoImportEnabled: boolean;
    connectedAt?: string | null;
    lastAuthorizedAt?: string | null;
    lastImportAt?: string | null;
    lastError?: any;
    autoImportLastError?: any;
    imports: ZoomImportCounts;
  };
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
    fetchWithAuth(`/enterprise/companies/${encodeURIComponent(companyId)}/digital-import/insights`).then((data) => ({
      company: {
        id: data?.company?.id ?? companyId,
        name: data?.company?.name ?? 'Organisation',
      },
      viewer: {
        email: data?.viewer?.email ?? '',
        role: data?.viewer?.role ?? 'member',
        canManageMembers: Boolean(data?.viewer?.canManageMembers),
        membershipSource: data?.viewer?.membershipSource ?? 'unknown',
      },
      zoomImport: {
        connectedUserCount: Number(data?.digitalImport?.zoomImport?.connectedUserCount ?? data?.zoomImport?.connectedUserCount ?? 0),
        autoImportEnabledUserCount: Number(data?.digitalImport?.zoomImport?.autoImportEnabledUserCount ?? data?.zoomImport?.autoImportEnabledUserCount ?? 0),
        imports: normalizeCounts(data?.digitalImport?.zoomImport?.imports ?? data?.zoomImport?.imports),
      },
      members: Array.isArray(data?.members)
        ? data.members.map((m: any) => ({
            email: m?.email ?? '',
            role: m?.role ?? 'member',
            status: m?.status ?? 'active',
            connected: Boolean(m?.connected),
            accountEmail: m?.accountEmail,
            displayName: m?.displayName,
            autoImportEnabled: Boolean(m?.autoImportEnabled),
            connectedAt: m?.connectedAt,
            lastImportAt: m?.lastImportAt,
            lastError: m?.lastError ?? null,
            imports: normalizeCounts(m?.imports),
            zoomImport: m?.zoomImport ?? undefined,
          }))
        : [],
      timestamp: data?.timestamp ?? new Date().toISOString(),
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
