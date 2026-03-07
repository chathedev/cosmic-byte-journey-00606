/**
 * Enterprise custom domain + workspace bootstrap API
 */

const API_BASE_URL = 'https://api.tivly.se';

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
    err.loginHostname = body.loginHostname;
    err.workspaceOrigin = body.workspaceOrigin;
    throw err;
  }
  return res.json();
}

export interface WorkspaceBranding {
  workspaceDisplayName?: string;
  logoUrl?: string;
  wordmarkUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  loginTitle?: string;
  loginSubtitle?: string;
  supportEmail?: string;
  supportUrl?: string;
  privacyUrl?: string;
  termsUrl?: string;
}

export interface PublicWorkspaceInfo {
  companyId: string;
  hostname: string;
  verified: boolean;
  loginEnabled: boolean;
  ssoEnabled: boolean;
  ssoOnlyLogin: boolean;
  allowedProviders: string[];
  primaryProvider: string | null;
  branding: WorkspaceBranding;
}

/**
 * Bootstrap workspace from custom domain
 * Only call on non-app.tivly.se hosts
 */
export function getPublicWorkspace(host: string): Promise<PublicWorkspaceInfo> {
  return apiFetch(`/public/enterprise/workspace?host=${encodeURIComponent(host)}`);
}

/**
 * Start SSO login flow on enterprise custom domain
 */
export function startSSOLogin(companyId: string, provider: string, redirect: string): Promise<{ authorizationUrl: string }> {
  return apiFetch(`/enterprise/sso/start?companyId=${encodeURIComponent(companyId)}&provider=${encodeURIComponent(provider)}&redirect=${encodeURIComponent(redirect)}`);
}

/**
 * Exchange SSO session token for auth token
 */
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

/**
 * Check if current host is the generic Tivly app domain
 */
export function isGenericAppDomain(): boolean {
  if (typeof window === 'undefined') return true;
  const host = window.location.hostname;
  return host === 'app.tivly.se' || host === 'localhost' || host.includes('lovable.app') || host.includes('lovableproject.com');
}

/**
 * Check if current host is an enterprise custom domain
 */
export function isEnterpriseCustomDomain(): boolean {
  return !isGenericAppDomain();
}
