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

export interface GoogleMeetImportCounts {
  activeTotal: number;
  activeAuto: number;
  activeManual: number;
  trashedTotal: number;
  trashedAuto: number;
  trashedManual: number;
  total: number;
}

export interface GoogleMeetAdminUserRow {
  email: string;
  connected: boolean;
  reconnectRequired: boolean;
  accountEmail?: string;
  displayName?: string;
  autoImportEnabled: boolean;
  imports: GoogleMeetImportCounts;
  lastError?: { code: string; message: string; updatedAt?: string } | null;
}

export interface GoogleMeetAdminInsightsResponse {
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
    googleMeetImport: {
      connectedUserCount: number;
      autoImportEnabledUserCount: number;
      imports: GoogleMeetImportCounts;
    };
    members: any[];
  }>;
  users: GoogleMeetAdminUserRow[];
  timestamp: string;
}

const normalizeCounts = (counts: any): GoogleMeetImportCounts => ({
  activeTotal: Number(counts?.activeTotal ?? 0),
  activeAuto: Number(counts?.activeAuto ?? 0),
  activeManual: Number(counts?.activeManual ?? 0),
  trashedTotal: Number(counts?.trashedTotal ?? 0),
  trashedAuto: Number(counts?.trashedAuto ?? 0),
  trashedManual: Number(counts?.trashedManual ?? 0),
  total: Number(counts?.total ?? 0),
});

export const adminGoogleMeetImportApi = {
  getInsights: (): Promise<GoogleMeetAdminInsightsResponse> =>
    fetchWithAuth('/admin/google-meet-import/insights').then((data) => ({
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
            googleMeetImport: {
              connectedUserCount: Number(c?.googleMeetImport?.connectedUserCount ?? 0),
              autoImportEnabledUserCount: Number(c?.googleMeetImport?.autoImportEnabledUserCount ?? 0),
              imports: normalizeCounts(c?.googleMeetImport?.imports),
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
    fetchWithAuth(`/admin/google-meet-import/users/${encodeURIComponent(email)}/reset`, {
      method: 'POST',
    }),

  toggleAutoImport: (email: string, enabled: boolean) =>
    fetchWithAuth(`/admin/google-meet-import/users/${encodeURIComponent(email)}/auto-import`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),

  triggerAutoImportRun: () =>
    fetchWithAuth('/admin/google-meet-import/auto-import/run', { method: 'POST' }),
};
