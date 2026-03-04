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

// ── Shared types ──

export interface ImportCounts {
  activeTotal: number;
  activeAuto: number;
  activeManual: number;
  trashedTotal: number;
  trashedAuto: number;
  trashedManual: number;
  total: number;
}

export interface AdminConsentInfo {
  tenantId?: string;
  required?: boolean;
  pending?: boolean;
  approved?: boolean;
  approvedAt?: string;
  adminConsentUrl?: string;
}

export interface CompanyAdminConsent {
  status: string;
  accepted: boolean;
  acceptedTenants: Array<{ tenantId: string; acceptedAt: string }>;
}

// ── Admin types ──

export interface AdminInsightsResponse {
  summary: {
    totalUsers: number;
    connectedUsers: number;
    reconnectRequiredUsers: number;
    usersWithAutoImportEnabled: number;
    usersWithAdminConsentAcceptedTenant: number;
    activeImportedMeetings: number;
    activeAutoImportedMeetings: number;
    activeManualImportedMeetings: number;
    trashedImportedMeetings: number;
    companies: number;
    companiesWithConnectedUsers: number;
    companiesWithAdminConsentAccepted: number;
    tenants: number;
    tenantsWithAdminConsentAccepted: number;
  };
  tenants: Array<{
    tenantId: string;
    accepted: boolean;
    acceptedAt?: string;
    connectedUserCount: number;
    connectedAdminUserCount: number;
    companyCount: number;
  }>;
  companies: Array<{
    company: { id: string; name: string };
    digitalImport: {
      connectedUserCount: number;
      connectedAdminUserCount: number;
      autoImportEnabledUserCount: number;
      imports: ImportCounts;
      tenantIds: string[];
      adminConsent: CompanyAdminConsent;
    };
    members: any[];
  }>;
  users: AdminUserRow[];
  timestamp: string;
}

export interface AdminUserRow {
  email: string;
  connected: boolean;
  reconnectRequired: boolean;
  accountEmail?: string;
  displayName?: string;
  tenantId?: string;
  adminConsentAcceptedForTenant?: boolean;
  adminConsent?: AdminConsentInfo | null;
  autoImportEnabled: boolean;
  imports: ImportCounts;
  lastError?: { code: string; message: string; updatedAt?: string } | null;
}

export const adminDigitalImportApi = {
  getInsights: (): Promise<AdminInsightsResponse> =>
    fetchWithAuth('/admin/digital-import/insights'),

  getUserDetail: (email: string) =>
    fetchWithAuth(`/admin/digital-import/users/${encodeURIComponent(email)}`),

  resetUser: (email: string, preserveAutoImport = false) =>
    fetchWithAuth(`/admin/digital-import/users/${encodeURIComponent(email)}/reset`, {
      method: 'POST',
      body: JSON.stringify({ preserveAutoImport }),
    }),

  toggleAutoImport: (email: string, enabled: boolean) =>
    fetchWithAuth(`/admin/digital-import/users/${encodeURIComponent(email)}/auto-import`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),

  setTenantConsent: (tenantId: string, accepted: boolean) =>
    fetchWithAuth(`/admin/digital-import/tenants/${encodeURIComponent(tenantId)}/admin-consent`, {
      method: 'POST',
      body: JSON.stringify({ accepted }),
    }),

  triggerAutoImportRun: () =>
    fetchWithAuth('/admin/digital-import/auto-import/run', { method: 'POST' }),
};

// ── Org types ──

export interface OrgDigitalImportInsights {
  company: { id: string; name: string };
  viewer: { email: string; role: string; canManageMembers: boolean; membershipSource: string };
  digitalImport: {
    connectedUserCount: number;
    connectedAdminUserCount: number;
    autoImportEnabledUserCount: number;
    imports: ImportCounts;
    tenantIds: string[];
    adminConsent: CompanyAdminConsent;
  };
  members: OrgMemberRow[];
  timestamp: string;
}

export interface OrgMemberRow {
  email: string;
  role: string;
  status: string;
  connected: boolean;
  accountEmail?: string;
  displayName?: string;
  tenantId?: string;
  adminConsentAcceptedForTenant?: boolean;
  adminConsent?: AdminConsentInfo | null;
  autoImportEnabled: boolean;
  connectedAt?: string;
  lastAuthorizedAt?: string;
  lastImportAt?: string;
  lastError?: { code: string; message: string; updatedAt?: string } | null;
  imports: ImportCounts;
}

export const orgDigitalImportApi = {
  getInsights: (companyId: string): Promise<OrgDigitalImportInsights> =>
    fetchWithAuth(`/enterprise/companies/${encodeURIComponent(companyId)}/digital-import/insights`),

  resetUser: (companyId: string, email: string) =>
    fetchWithAuth(`/enterprise/companies/${encodeURIComponent(companyId)}/digital-import/users/${encodeURIComponent(email)}/reset`, {
      method: 'POST',
    }),

  toggleAutoImport: (companyId: string, email: string, enabled: boolean) =>
    fetchWithAuth(`/enterprise/companies/${encodeURIComponent(companyId)}/digital-import/users/${encodeURIComponent(email)}/auto-import`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),
};
