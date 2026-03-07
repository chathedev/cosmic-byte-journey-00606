/**
 * Enterprise Settings API client methods
 * Covers: Settings CRUD, SSO, Custom Roles, Audit, Admin Locks
 */
import { translateError } from '@/lib/errorTranslation';
const API_BASE_URL = 'https://api.tivly.se';

// ==================== TYPES ====================

export interface EnterpriseProvider {
  enabled: boolean;
  clientIdConfigured?: boolean;
  tenantMode?: string;
  tenantId?: string | null;
  redirectUri?: string | null;
  adminConsentRequired?: boolean;
  enforceOrganizationAccountOnly?: boolean;
  hostedDomain?: string | null;
  restrictToWorkspaceDomain?: boolean;
  issuer?: string | null;
  clientId?: string | null;
  clientSecretConfigured?: boolean;
  scopes?: string[];
  groupClaim?: string;
  authorizationEndpoint?: string | null;
  tokenEndpoint?: string | null;
  userinfoEndpoint?: string | null;
  jwksUri?: string | null;
  emailClaim?: string;
  nameClaim?: string;
  groupsClaim?: string;
  entryPoint?: string | null;
  audience?: string | null;
  certificateConfigured?: boolean;
  nameIdFormat?: string | null;
  emailAttribute?: string;
  firstNameAttribute?: string;
  lastNameAttribute?: string;
  groupsAttribute?: string;
  lastTestedAt?: string | null;
  lastTestResult?: string | null;
  lastError?: string | null;
}

export interface IdentityAccessSettings {
  ssoEnabled: boolean;
  ssoOnlyLogin: boolean;
  allowedProviders: string[];
  primaryProvider: string | null;
  domainRestrictions: string[];
  jitProvisioningEnabled: boolean;
  groupSyncEnabled: boolean;
  scimEnabled: boolean;
  defaultRoleId: string | null;
  defaultAnchorRole: string;
  defaultTeamIds: string[];
  fallbackPolicy: string;
  groupMappings: Array<{
    group: string;
    anchorRole: string;
    customRoleIds: string[];
    teamIds: string[];
  }>;
  providers: Record<string, EnterpriseProvider>;
}

export interface AdminWorkspaceSettings {
  branding?: {
    workspaceDisplayName?: string;
    logoUrl?: string | null;
    primaryColor?: string;
    emailBrandingEnabled?: boolean;
  };
  teamManagementEnabled?: boolean;
  maxAdmins?: number | null;
  invitePolicy?: {
    allowedInviters?: string[];
    domainRestrictedInvites?: boolean;
    allowExternalGuests?: boolean;
    requireApprovalForExternalGuests?: boolean;
  };
  meetingCreationPolicy?: {
    allowedCreators?: string[];
  };
  integrationUsagePolicy?: {
    allowedUsers?: string[];
  };
}

export interface SecurityComplianceSettings {
  auditLogsEnabled: boolean;
  loginHistoryEnabled: boolean;
  retentionDays: number;
  autoDeleteEnabled: boolean;
  restrictExport: boolean;
  restrictDownload: boolean;
  restrictExternalSharing: boolean;
  ipAllowlistingEnabled: boolean;
  ipAllowlist: string[];
  storageRegion: string;
  euDataResidencyRequired?: boolean;
}

export interface MeetingContentSettings {
  recordingAllowed: boolean;
  transcriptionAllowed: boolean;
  aiSummaryAllowed: boolean;
  speakerIdentificationAllowed: boolean;
  protocolTemplatesEnabled: boolean;
  approvalWorkflowEnabled: boolean;
  requiredProtocolFields: string[];
  sharingPolicy?: {
    allowOrgSharedMeetings?: boolean;
    allowTeamScopedMeetings?: boolean;
    allowExternalShareLinks?: boolean;
  };
}

export interface IntegrationSettings {
  microsoftTeams?: { enabled: boolean; allowedRoles: string[] };
  googleMeet?: { enabled: boolean; allowedRoles: string[] };
  zoom?: { enabled: boolean; allowedRoles: string[] };
  slack?: { enabled: boolean; allowedRoles: string[] };
  apiAccessEnabled?: boolean;
  webhooksEnabled?: boolean;
  customIntegrationsEnabled?: boolean;
}

export interface CustomRole {
  id: string;
  name: string;
  description: string;
  basePreset: string;
  permissions: Record<string, boolean>;
  assignableBy: string[];
  system: boolean;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface SettingsLock {
  locked: boolean;
  path: string;
  lockedBy: string;
  lockedAt: string;
  reason: string;
}

export interface ProviderReadiness {
  enabled: boolean;
  configured: boolean;
  ready: boolean;
  lastTestedAt: string | null;
  lastTestResult: string | null;
  lastError: string | null;
}

export interface EnterpriseSettingsResponse {
  company: { id: string; name: string; planType: string };
  settings: {
    identityAccess: Partial<IdentityAccessSettings>;
    adminWorkspace: Partial<AdminWorkspaceSettings>;
    securityCompliance: Partial<SecurityComplianceSettings>;
    meetingContentControls: Partial<MeetingContentSettings>;
    integrations: Partial<IntegrationSettings>;
    customRoles: CustomRole[];
  };
  settingsSummary?: {
    providerReadiness?: Record<string, ProviderReadiness>;
    enabledProviders?: string[];
    [key: string]: any;
  };
  locks: Record<string, SettingsLock>;
  viewer: {
    email: string;
    role: string;
    customRoleIds: string[];
    canManageEnterpriseSettings: boolean;
    canManageMembers: boolean;
    isTivlyAdmin: boolean;
    permissions?: Record<string, boolean>;
  };
  timestamp: string;
}

export interface AuditEntry {
  id: string;
  scope: string;
  companyId: string;
  category: string;
  field: string;
  oldValue: any;
  newValue: any;
  changedBy: string;
  changedByRole: string;
  source: string;
  createdAt: string;
}

export interface AuditResponse {
  audit: AuditEntry[];
  loginHistory?: Array<{
    email: string;
    provider: string;
    timestamp: string;
    success: boolean;
  }>;
  timestamp: string;
}

export interface SSOTestResult {
  provider: string;
  ready: boolean;
  diagnostics: Record<string, any>;
}

export interface SSOConnectResult {
  authorizationUrl: string;
  provider: string;
}

// ==================== API FUNCTIONS ====================

function getToken(): string | null {
  return localStorage.getItem('authToken');
}

async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err: any = new Error(body.message || body.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = body.code || body.error;
    err.details = body.details;
    err.locks = body.locks;
    throw err;
  }
  return res.json();
}

// === Enterprise Owner/Admin Endpoints ===

export function getEnterpriseSettings(companyId: string): Promise<EnterpriseSettingsResponse> {
  return apiFetch(`/enterprise/companies/${companyId}/settings`);
}

export function updateEnterpriseSettings(companyId: string, settings: Record<string, any>): Promise<EnterpriseSettingsResponse> {
  return apiFetch(`/enterprise/companies/${companyId}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}

export function getEnterpriseAudit(companyId: string): Promise<AuditResponse> {
  return apiFetch(`/enterprise/companies/${companyId}/settings/audit`);
}

export function getEnterpriseRoles(companyId: string): Promise<{ roles: CustomRole[] }> {
  return apiFetch(`/enterprise/companies/${companyId}/settings/roles`);
}

export function createEnterpriseRole(companyId: string, role: Partial<CustomRole>): Promise<{ role: CustomRole }> {
  return apiFetch(`/enterprise/companies/${companyId}/settings/roles`, {
    method: 'POST',
    body: JSON.stringify(role),
  });
}

export function updateEnterpriseRole(companyId: string, roleId: string, updates: Partial<CustomRole>): Promise<{ role: CustomRole }> {
  return apiFetch(`/enterprise/companies/${companyId}/settings/roles/${roleId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export function deleteEnterpriseRole(companyId: string, roleId: string): Promise<{ success: boolean }> {
  return apiFetch(`/enterprise/companies/${companyId}/settings/roles/${roleId}`, {
    method: 'DELETE',
  });
}

export function testSSO(companyId: string, provider: string, config?: Record<string, any>): Promise<SSOTestResult> {
  return apiFetch(`/enterprise/companies/${companyId}/settings/sso/test`, {
    method: 'POST',
    body: JSON.stringify({ provider, ...(config || {}) }),
  });
}

export function connectSSO(companyId: string, provider: string, config?: Record<string, any>, forcePrompt?: boolean): Promise<SSOConnectResult> {
  const body = { ...(config || {}), ...(forcePrompt ? { forcePrompt: true } : {}) };
  return apiFetch(`/enterprise/companies/${companyId}/settings/sso/${provider}/connect`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function disableSSOProvider(companyId: string, provider: string): Promise<any> {
  return apiFetch(`/enterprise/companies/${companyId}/settings/sso/${provider}/disable`, { method: 'POST' });
}

export function removeSSOProvider(companyId: string, provider: string): Promise<any> {
  return apiFetch(`/enterprise/companies/${companyId}/settings/sso/${provider}`, { method: 'DELETE' });
}

export function resetSSOProvider(companyId: string, provider: string): Promise<any> {
  return apiFetch(`/enterprise/companies/${companyId}/settings/sso/${provider}/reset`, { method: 'POST' });
}

// === SSO Login Flow ===

export function startSSOLogin(companyId: string, provider: string, redirect: string): Promise<{ authorizationUrl: string }> {
  return apiFetch(`/enterprise/sso/start?companyId=${encodeURIComponent(companyId)}&provider=${encodeURIComponent(provider)}&redirect=${encodeURIComponent(redirect)}`);
}

export function exchangeSSOSession(sessionToken: string): Promise<{
  token: string;
  provider: string;
  mode: string;
  user: any;
  company: any;
  redirectTarget: string;
}> {
  return apiFetch('/auth/enterprise/exchange', {
    method: 'POST',
    body: JSON.stringify({ sessionToken }),
  });
}

// === Tivly Admin Endpoints ===

export function getAdminEnterpriseSettings(companyId: string): Promise<EnterpriseSettingsResponse> {
  return apiFetch(`/admin/enterprise/companies/${companyId}/settings`);
}

export function updateAdminEnterpriseSettings(companyId: string, settings: Record<string, any>): Promise<EnterpriseSettingsResponse> {
  return apiFetch(`/admin/enterprise/companies/${companyId}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}

export function getAdminEnterpriseAudit(companyId: string): Promise<AuditResponse> {
  return apiFetch(`/admin/enterprise/companies/${companyId}/settings/audit`);
}

export function lockEnterpriseSettings(companyId: string, paths: string[], reason: string): Promise<{ locks: Record<string, SettingsLock> }> {
  return apiFetch(`/admin/enterprise/companies/${companyId}/settings/lock`, {
    method: 'POST',
    body: JSON.stringify({ paths, reason }),
  });
}

export function unlockEnterpriseSettings(companyId: string, paths: string[]): Promise<{ locks: Record<string, SettingsLock> }> {
  return apiFetch(`/admin/enterprise/companies/${companyId}/settings/unlock`, {
    method: 'POST',
    body: JSON.stringify({ paths }),
  });
}
