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

export interface SlackShareCounts {
  manualSharesCount: number;
  autoSharesCount: number;
  totalShares: number;
}

export interface SlackAdminUserRow {
  email: string;
  connected: boolean;
  reconnectRequired: boolean;
  workspaceName?: string;
  autoShareEnabled: boolean;
  autoShareChannelName?: string;
  shares: SlackShareCounts;
  lastSharedAt?: string | null;
  lastError?: { code: string; message: string; updatedAt?: string } | null;
}

export interface SlackAdminCompanyRow {
  company: { id: string; name: string };
  slackIntegration: {
    connectedUserCount: number;
    autoShareEnabledUserCount: number;
    shares: SlackShareCounts;
  };
}

export interface SlackAdminInsightsResponse {
  summary: {
    totalUsers: number;
    connectedUsers: number;
    reconnectRequiredUsers: number;
    usersWithAutoShareEnabled: number;
    totalManualShares: number;
    totalAutoShares: number;
    totalShares: number;
    companies: number;
    companiesWithConnectedUsers: number;
  };
  companies: SlackAdminCompanyRow[];
  users: SlackAdminUserRow[];
  timestamp: string;
}

const normalizeCounts = (counts: any): SlackShareCounts => ({
  manualSharesCount: Number(counts?.manualSharesCount ?? counts?.manualShares ?? 0),
  autoSharesCount: Number(counts?.autoSharesCount ?? counts?.autoShares ?? 0),
  totalShares: Number(counts?.totalShares ?? counts?.total ?? 0),
});

export const adminSlackIntegrationApi = {
  getInsights: (): Promise<SlackAdminInsightsResponse> =>
    fetchWithAuth('/admin/digital-import/insights').then((data) => {
      const sl = data?.slackSummary ?? data?.summary?.slackSummary ?? {};

      return {
        summary: {
          totalUsers: Number(data?.summary?.totalUsers ?? 0),
          connectedUsers: Number(sl.connectedUsers ?? 0),
          reconnectRequiredUsers: Number(sl.reconnectRequiredUsers ?? 0),
          usersWithAutoShareEnabled: Number(sl.usersWithAutoShareEnabled ?? 0),
          totalManualShares: Number(sl.totalManualShares ?? 0),
          totalAutoShares: Number(sl.totalAutoShares ?? 0),
          totalShares: Number(sl.totalShares ?? 0),
          companies: Number(data?.summary?.companies ?? 0),
          companiesWithConnectedUsers: Number(sl.companiesWithConnectedUsers ?? 0),
        },
        companies: Array.isArray(data?.companies)
          ? data.companies
              .filter((c: any) => c?.digitalImport?.slackIntegration)
              .map((c: any) => {
                const si = c.digitalImport.slackIntegration;
                return {
                  company: {
                    id: c?.company?.id ?? '',
                    name: c?.company?.name ?? 'Okänt företag',
                  },
                  slackIntegration: {
                    connectedUserCount: Number(si?.connectedUserCount ?? 0),
                    autoShareEnabledUserCount: Number(si?.autoShareEnabledUserCount ?? 0),
                    shares: normalizeCounts(si?.shares),
                  },
                };
              })
          : [],
        users: Array.isArray(data?.users)
          ? data.users
              .filter((u: any) => {
                const sd = u?.slackIntegration;
                return sd?.connected || sd?.workspaceName;
              })
              .map((u: any) => {
                const sd = u?.slackIntegration ?? {};
                return {
                  email: u?.email ?? '',
                  connected: Boolean(sd.connected ?? false),
                  reconnectRequired: Boolean(sd.reconnectRequired ?? false),
                  workspaceName: sd.workspaceName,
                  autoShareEnabled: Boolean(sd.autoShareEnabled ?? false),
                  autoShareChannelName: sd.autoShareChannelName,
                  shares: normalizeCounts(sd.shares),
                  lastSharedAt: sd.lastSharedAt ?? null,
                  lastError: sd.lastError ?? null,
                };
              })
          : [],
        timestamp: data?.timestamp ?? new Date().toISOString(),
      };
    }),

  resetUser: (email: string) =>
    fetchWithAuth(`/admin/slack-integration/users/${encodeURIComponent(email)}/reset`, {
      method: 'POST',
    }),

  toggleAutoShare: (email: string, enabled: boolean) =>
    fetchWithAuth(`/admin/slack-integration/users/${encodeURIComponent(email)}/auto-share`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),
};

// ── Org types & API ──

export interface SlackOrgMemberRow {
  email: string;
  role: string;
  status: string;
  connected: boolean;
  reconnectRequired: boolean;
  workspaceName?: string;
  autoShareEnabled: boolean;
  autoShareChannelName?: string;
  lastSharedAt?: string | null;
  lastError?: { code: string; message: string; updatedAt?: string } | null;
  shares: SlackShareCounts;
}

export interface SlackOrgInsights {
  company: { id: string; name: string };
  viewer: { email: string; role: string; canManageMembers: boolean; membershipSource: string };
  slackIntegration: {
    connectedUserCount: number;
    autoShareEnabledUserCount: number;
    shares: SlackShareCounts;
  };
  members: SlackOrgMemberRow[];
  timestamp: string;
}

export const orgSlackIntegrationApi = {
  getInsights: (companyId: string): Promise<SlackOrgInsights> =>
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
      slackIntegration: {
        connectedUserCount: Number(data?.digitalImport?.slackIntegration?.connectedUserCount ?? data?.slackIntegration?.connectedUserCount ?? 0),
        autoShareEnabledUserCount: Number(data?.digitalImport?.slackIntegration?.autoShareEnabledUserCount ?? data?.slackIntegration?.autoShareEnabledUserCount ?? 0),
        shares: normalizeCounts(data?.digitalImport?.slackIntegration?.shares ?? data?.slackIntegration?.shares),
      },
      members: Array.isArray(data?.members)
        ? data.members.map((m: any) => {
            const sd = m?.slackIntegration ?? {};
            return {
              email: m?.email ?? '',
              role: m?.role ?? 'member',
              status: m?.status ?? 'active',
              connected: Boolean(sd.connected ?? false),
              reconnectRequired: Boolean(sd.reconnectRequired ?? false),
              workspaceName: sd.workspaceName,
              autoShareEnabled: Boolean(sd.autoShareEnabled ?? false),
              autoShareChannelName: sd.autoShareChannelName,
              lastSharedAt: sd.lastSharedAt ?? null,
              lastError: sd.lastError ?? null,
              shares: normalizeCounts(sd.shares),
            };
          })
        : [],
      timestamp: data?.timestamp ?? new Date().toISOString(),
    })),

  resetUser: (companyId: string, email: string) =>
    fetchWithAuth(`/enterprise/companies/${encodeURIComponent(companyId)}/slack-integration/users/${encodeURIComponent(email)}/reset`, {
      method: 'POST',
    }),

  toggleAutoShare: (companyId: string, email: string, enabled: boolean) =>
    fetchWithAuth(`/enterprise/companies/${encodeURIComponent(companyId)}/slack-integration/users/${encodeURIComponent(email)}/auto-share`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),
};
