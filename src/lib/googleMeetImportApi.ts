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
  connectedAt?: string;
  lastImportAt?: string;
  lastAuthorizedAt?: string;
  lastError?: { code: string; message: string; updatedAt?: string } | null;
}

export interface GoogleMeetAdminCompanyRow {
  company: { id: string; name: string };
  googleMeetImport: {
    connectedUserCount: number;
    autoImportEnabledUserCount: number;
    imports: GoogleMeetImportCounts;
  };
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
  companies: GoogleMeetAdminCompanyRow[];
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

/**
 * Google Meet admin insights use the shared `/admin/digital-import/insights` endpoint
 * but extract Google Meet-specific data from the response (googleMeetImport fields).
 *
 * Admin actions use dedicated `/admin/google-meet-import/...` endpoints.
 */
export const adminGoogleMeetImportApi = {
  getInsights: (): Promise<GoogleMeetAdminInsightsResponse> =>
    fetchWithAuth('/admin/digital-import/insights').then((data) => {
      const gm = data?.summary?.googleMeetSummary ?? {};

      return {
        summary: {
          totalUsers: Number(data?.summary?.totalUsers ?? 0),
          connectedUsers: Number(gm.connectedUsers ?? 0),
          reconnectRequiredUsers: Number(gm.reconnectRequiredUsers ?? 0),
          usersWithAutoImportEnabled: Number(gm.usersWithAutoImportEnabled ?? 0),
          activeImportedMeetings: Number(gm.activeImportedMeetings ?? 0),
          activeAutoImportedMeetings: Number(gm.activeAutoImportedMeetings ?? 0),
          activeManualImportedMeetings: Number(gm.activeManualImportedMeetings ?? 0),
          trashedImportedMeetings: Number(gm.trashedImportedMeetings ?? 0),
          companies: Number(data?.summary?.companies ?? 0),
          companiesWithConnectedUsers: Number(gm.companiesWithConnectedUsers ?? 0),
        },
        companies: Array.isArray(data?.companies)
          ? data.companies
              .filter((c: any) => c?.googleMeetImport)
              .map((c: any) => ({
                company: {
                  id: c?.company?.id ?? '',
                  name: c?.company?.name ?? 'Okänt företag',
                },
                googleMeetImport: {
                  connectedUserCount: Number(c.googleMeetImport?.connectedUserCount ?? 0),
                  autoImportEnabledUserCount: Number(c.googleMeetImport?.autoImportEnabledUserCount ?? 0),
                  imports: normalizeCounts(c.googleMeetImport?.imports),
                },
              }))
          : [],
        users: Array.isArray(data?.users)
          ? data.users
              .filter((u: any) => {
                // Include users that have Google Meet connection data
                const gmData = u?.googleMeetImport;
                return gmData?.connected || gmData?.accountEmail || u?.googleMeetConnected;
              })
              .map((u: any) => {
                const gmData = u?.googleMeetImport ?? {};
                return {
                  email: u?.email ?? '',
                  connected: Boolean(gmData.connected ?? u?.googleMeetConnected ?? false),
                  reconnectRequired: Boolean(gmData.reconnectRequired ?? u?.googleMeetReconnectRequired ?? false),
                  accountEmail: gmData.accountEmail ?? u?.googleMeetAccountEmail,
                  displayName: gmData.displayName ?? u?.displayName,
                  autoImportEnabled: Boolean(gmData.autoImportEnabled ?? u?.googleMeetAutoImportEnabled ?? false),
                  connectedAt: gmData.connectedAt,
                  lastImportAt: gmData.lastImportAt,
                  lastAuthorizedAt: gmData.lastAuthorizedAt,
                  imports: normalizeCounts(gmData.imports ?? u?.googleMeetImports),
                  lastError: gmData.lastError ?? u?.googleMeetLastError ?? null,
                };
              })
          : [],
        timestamp: data?.timestamp ?? new Date().toISOString(),
      };
    }),

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

// ── Org types & API ──

export interface GoogleMeetOrgMemberRow {
  email: string;
  role: string;
  status: string;
  connected: boolean;
  reconnectRequired: boolean;
  accountEmail?: string;
  displayName?: string;
  autoImportEnabled: boolean;
  connectedAt?: string;
  lastImportAt?: string;
  lastError?: { code: string; message: string; updatedAt?: string } | null;
  imports: GoogleMeetImportCounts;
}

export interface GoogleMeetOrgInsights {
  company: { id: string; name: string };
  viewer: { email: string; role: string; canManageMembers: boolean; membershipSource: string };
  googleMeetImport: {
    connectedUserCount: number;
    autoImportEnabledUserCount: number;
    imports: GoogleMeetImportCounts;
  };
  members: GoogleMeetOrgMemberRow[];
  timestamp: string;
}

export const orgGoogleMeetImportApi = {
  getInsights: (companyId: string): Promise<GoogleMeetOrgInsights> =>
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
      googleMeetImport: {
        connectedUserCount: Number(data?.digitalImport?.googleMeetImport?.connectedUserCount ?? data?.googleMeetImport?.connectedUserCount ?? 0),
        autoImportEnabledUserCount: Number(data?.digitalImport?.googleMeetImport?.autoImportEnabledUserCount ?? data?.googleMeetImport?.autoImportEnabledUserCount ?? 0),
        imports: normalizeCounts(data?.digitalImport?.googleMeetImport?.imports ?? data?.googleMeetImport?.imports),
      },
      members: Array.isArray(data?.members)
        ? data.members.map((m: any) => {
            const gmData = m?.googleMeetImport ?? {};
            return {
              email: m?.email ?? '',
              role: m?.role ?? 'member',
              status: m?.status ?? 'active',
              connected: Boolean(gmData.connected ?? m?.googleMeetConnected ?? false),
              reconnectRequired: Boolean(gmData.reconnectRequired ?? m?.googleMeetReconnectRequired ?? false),
              accountEmail: gmData.accountEmail ?? m?.googleMeetAccountEmail,
              displayName: gmData.displayName ?? m?.displayName,
              autoImportEnabled: Boolean(gmData.autoImportEnabled ?? m?.googleMeetAutoImportEnabled ?? false),
              connectedAt: gmData.connectedAt ?? m?.googleMeetConnectedAt,
              lastImportAt: gmData.lastImportAt ?? m?.googleMeetLastImportAt,
              lastError: gmData.lastError ?? m?.googleMeetLastError ?? null,
              imports: normalizeCounts(gmData.imports ?? m?.googleMeetImports),
            };
          })
        : [],
      timestamp: data?.timestamp ?? new Date().toISOString(),
    })),

  resetUser: (companyId: string, email: string) =>
    fetchWithAuth(`/enterprise/companies/${encodeURIComponent(companyId)}/google-meet-import/users/${encodeURIComponent(email)}/reset`, {
      method: 'POST',
    }),

  toggleAutoImport: (companyId: string, email: string, enabled: boolean) =>
    fetchWithAuth(`/enterprise/companies/${encodeURIComponent(companyId)}/google-meet-import/users/${encodeURIComponent(email)}/auto-import`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),
};
