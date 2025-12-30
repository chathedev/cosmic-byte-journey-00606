import { getUserIP } from '@/utils/ipDetection';
 
const API_BASE_URL = 'https://api.tivly.se';

export interface MaintenanceStatus {
  enabled: boolean;
  updatedAt?: string;
  updatedBy?: string;
  updatedByName?: string;
}

interface User {
  id: string;
  uid: string; // Alias for id to maintain compatibility
  email: string;
  displayName?: string;
  preferredName?: string | null; // Display name for all users
  photoURL?: string | null;
  emailVerified: boolean;
  providerData?: any[];
  plan?: {
    plan?: string; // 'free', 'standard', 'plus', 'unlimited'
    type?: string; // Alias for plan
    meetingsUsed?: number;
    meetingsLimit?: number | null; // null = unlimited
    protocolsUsed?: number;
    protocolsLimit?: number;
    renewsAt?: string;
    renewDate?: string;
    stripeSubscriptionId?: string;
    customerId?: string;
    subscriptionId?: string;
  };
  paymentStatus?: string;
  meetingCount?: number;
  unlimitedInvite?: {
    inviteToken?: string;
    redeemedAt?: string;
  };
}

interface TranscribeResponse {
  success: boolean;
  transcript?: string;
  text?: string; // Legacy field
  path?: string;
  jsonPath?: string;
  duration?: number;
  processing_time?: number;
  error?: string;
  processedAt?: string;
  fileSizeMB?: string;
}

interface AuthResponse {
  token: string;
  user: User;
  requiresVerification?: boolean;
  retryAfterMs?: number;
}

interface VerifyEmailResponse {
  success: boolean;
  token?: string;
  user?: User;
}

class ApiClient {
  private browserId: string;

  constructor() {
    this.browserId = this.getOrCreateBrowserId();
  }

  // Expose a safe method to apply an auth token when the backend returns it (e.g., trusted login)
  public applyAuthToken(token: string) {
    this.setToken(token);
  }

  // Expose method to get auth token for external use (e.g., IAP verification)
  public getAuthToken(): string | null {
    return this.getToken();
  }

  private getOrCreateBrowserId(): string {
    const stored = localStorage.getItem('browserId');
    if (stored) return stored;
    
    const newId = crypto.randomUUID();
    localStorage.setItem('browserId', newId);
    return newId;
  }

  private getToken(): string | null {
    return localStorage.getItem('authToken');
  }

  private setToken(token: string): void {
    localStorage.setItem('authToken', token);
  }

  private clearToken(): void {
    localStorage.removeItem('authToken');
  }

  private async fetchWithAuth(
    endpoint: string,
    options: (RequestInit & { suppressAuthRedirect?: boolean }) = {}
  ): Promise<Response> {
    const token = this.getToken();
    const { suppressAuthRedirect, ...fetchOptions } = options as any;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(fetchOptions.headers as any),
    };

    if (token) {
      (headers as any)['Authorization'] = `Bearer ${token}`;
    }

    // Enhanced fetch options for native app
    const enhancedOptions: RequestInit = {
      ...fetchOptions,
      headers,
      mode: 'cors',
      credentials: 'include',
      cache: 'no-cache',
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, enhancedOptions);

    // Only clear token and redirect for actual authentication failures
    // Don't clear token on network errors or other issues
    // Don't redirect for demo or test tokens
    const isDemoToken = token && token.startsWith('demo-token-');
    const isTestToken = token && token.startsWith('test_unlimited_user_');
    
    if (response.status === 401 && !suppressAuthRedirect && !isDemoToken && !isTestToken) {
      // Only clear token if we got a proper 401 response from the server
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        this.clearToken();
        // Defer redirect to avoid interrupting current operations
        setTimeout(() => {
          if (window.location.pathname !== '/auth') {
            window.location.href = '/auth';
          }
        }, 100);
      }
    }

    return response;
  }

  async emailAuth(email: string, password: string, inviteToken?: string, deviceId?: string): Promise<AuthResponse> {
    // Persist email for verification flows
    localStorage.setItem('userEmail', email);

    console.log('🔐 Starting emailAuth request:', { email, hasPassword: !!password, hasInviteToken: !!inviteToken, hasDeviceId: !!deviceId });

    try {
      const userIP = await getUserIP();
      
      const response = await fetch(`${API_BASE_URL}/auth/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Browser-ID': this.browserId,
          ...(deviceId ? { 'X-Device-ID': deviceId } : {}),
          ...(userIP ? { 'X-Client-IP': userIP } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ email, password, inviteToken }),
      });

      console.log('📡 emailAuth response:', { status: response.status, ok: response.ok });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Authentication failed' }));
        console.error('❌ emailAuth error response:', error);
        const errMessage = (error as any).error || (error as any).message || '';
        
        if (errMessage === 'browser_blocked') {
          throw new Error('browser_blocked');
        }
        
        // Handle email_not_verified - return response data instead of throwing
        const isUnverified = errMessage === 'email_not_verified' || /email.*not.*verified/i.test(errMessage);
        
        if (isUnverified) {
          // Store email for verification flow
          if ((error as any).email) {
            localStorage.setItem('userEmail', (error as any).email);
          }
          // DO NOT store token for unverified users
          // Return the response data with requiresVerification flag
          return {
            requiresVerification: true,
            email: (error as any).email,
            message: (error as any).message,
            retryAfterMs: (error as any).retryAfterMs,
          } as any;
        }
        throw new Error(errMessage || 'Authentication failed');
      }

      const data = await response.json();
      console.log('✅ emailAuth success:', { hasUser: !!data.user, hasToken: !!data.token });
      
      if (data.user?.email) {
        localStorage.setItem('userEmail', data.user.email);
      }
      if (data.token) {
        this.setToken(data.token);
      }
      return data;
    } catch (error) {
      console.error('❌ emailAuth fetch error:', error);
      throw error;
    }
  }

  // Legacy register - now uses unified emailAuth
  async register(email: string, password: string): Promise<AuthResponse> {
    return this.emailAuth(email, password);
  }

  // Legacy login - now uses unified emailAuth
  async login(email: string, password: string): Promise<AuthResponse> {
    return this.emailAuth(email, password);
  }

  async requestMagicLink(email: string, redirect?: string): Promise<{
    ok: boolean;
    email: string;
    expiresAt?: string;
    retryAfterSeconds: number;
    sessionId?: string;
    isNewUser?: boolean;
    trustedLogin?: boolean;
    token?: string;
    user?: User;
  }> {
    const response = await fetch(`${API_BASE_URL}/auth/magic-link`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Browser-Id': this.browserId,
        'X-Device-Id': this.browserId,
      },
      body: JSON.stringify({ email, redirect })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to send magic link' }));
      throw new Error((error as any).error || (error as any).message || 'Failed to send magic link');
    }

    const data = await response.json();

    // Handle trusted login bypass
    if (data.trustedLogin && data.token) {
      this.setToken(data.token);
    }

    return {
      ok: true,
      email,
      retryAfterSeconds: data.retryAfterSeconds ?? 60,
      expiresAt: data.expiresAt,
      sessionId: data.sessionId,
      isNewUser: data.isNewUser,
      trustedLogin: data.trustedLogin,
      token: data.token,
      user: data.user,
    };
  }

  async checkMagicLinkStatus(sessionId: string, email: string): Promise<{
    status: 'pending' | 'ready' | 'expired' | 'none' | 'device_mismatch' | 'not_found';
    token?: string;
    user?: User;
    issuedAt?: string;
    expiresAt?: string;
    redeemedAt?: string | null;
  }> {
    const response = await fetch(`${API_BASE_URL}/auth/magic-link/status`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': this.browserId,
      },
      body: JSON.stringify({ sessionId, email })
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to check status' }));
      throw new Error((error as any).error || (error as any).message || 'Failed to check status');
    }
    
    const data = await response.json();
    
    // If ready and has token, store it
    if (data.status === 'ready' && data.token) {
      this.setToken(data.token);
    }
    
    return data;
  }

  async verifyMagicLink(token: string, sessionId?: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/magic-link/verify`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Browser-Id': this.browserId,
        'X-Device-Id': this.browserId,
      },
      body: JSON.stringify({ token, sessionId })
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Invalid or expired link' }));
      throw new Error((error as any).error || (error as any).message || 'Invalid or expired link');
    }
    
    const data = await response.json();
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  }

  async startSmsVerification(email: string, phone: string): Promise<{
    ok: boolean;
    expiresAt: string;
    phone: string;
    isNewUser: boolean;
  }> {
    const response = await fetch(`${API_BASE_URL}/auth/sms/start`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Browser-Id': this.browserId,
        'X-Device-Id': this.browserId,
      },
      body: JSON.stringify({ email, phone })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to start SMS verification' }));
      throw new Error((error as any).error || (error as any).message || 'Failed to start SMS verification');
    }

    return response.json();
  }

  async verifySmsCode(email: string, code: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/sms/verify`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Browser-Id': this.browserId,
        'X-Device-Id': this.browserId,
      },
      body: JSON.stringify({ email, code })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Verification failed' }));
      throw new Error((error as any).error || (error as any).message || 'Verification failed');
    }

    const data = await response.json();
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  }

  async verifyEmail(code: string): Promise<VerifyEmailResponse> {
    // Prefer stored email to avoid extra authenticated calls
    let email = localStorage.getItem('userEmail') || '';

    if (!email) {
      const meResponse = await this.fetchWithAuth('/me', { suppressAuthRedirect: true });
      if (meResponse.ok) {
        const meData = await meResponse.json();
        const rawUser = meData.user || meData;
        email = rawUser?.email || '';
      }
    }

    if (!email) {
      throw new Error('Email saknas för verifiering');
    }
    
    const response = await this.fetchWithAuth('/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
      suppressAuthRedirect: true,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Verification failed' }));
      throw new Error((error as any).error || 'Verification failed');
    }

    const data = await response.json();
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  }

  async resendVerificationEmail(): Promise<{ success: boolean; retryAfterMs?: number; sent?: boolean; message?: string }> {
    const email = localStorage.getItem('userEmail') || '';
    
    const response = await this.fetchWithAuth('/verify-email/resend', {
      method: 'POST',
      body: JSON.stringify({ email }),
      suppressAuthRedirect: true,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to resend verification' }));
      throw new Error((error as any).error || 'Failed to resend verification');
    }

    return response.json();
  }

  async getMe(): Promise<User> {
    // Handle demo user - return immediately without backend call
    const token = this.getToken();
    if (token?.startsWith('demo-token-')) {
      const storedDemoUser = localStorage.getItem('demoUser');
      if (storedDemoUser) {
        try {
          return JSON.parse(storedDemoUser);
        } catch {
          // Fall through to create default demo user
        }
      }
      const demoUser: User = {
        id: 'demo-user-id',
        uid: 'demo-user-id',
        email: 'demo@tivly.se',
        displayName: 'Demo User',
        emailVerified: true,
        plan: {
          plan: 'enterprise',
          type: 'enterprise',
          meetingsUsed: 5,
          meetingsLimit: null,
          protocolsUsed: 12,
          protocolsLimit: null,
        }
      };
      return demoUser;
    }
    
    // Handle test user - return immediately without backend call
    if (token?.startsWith('test_unlimited_user_')) {
      const testUser: User = {
        id: 'test-user-id',
        uid: 'test-user-id',
        email: 'review@tivly.se',
        displayName: 'Test User',
        emailVerified: true,
        plan: {
          plan: 'unlimited',
          type: 'unlimited',
          meetingsUsed: 0,
          meetingsLimit: null,
          protocolsUsed: 0,
          protocolsLimit: null,
        }
      };
      return testUser;
    }

    const response = await this.fetchWithAuth('/me', { suppressAuthRedirect: true });

    if (!response.ok) {
      if (response.status === 401) {
        // Don't clear token here - let fetchWithAuth handle it
        throw new Error('Unauthorized');
      }
      throw new Error('Failed to fetch user');
    }

    const data = await response.json();

    // Extract the user object from backend response
    const rawUser = data.user || data;

    // Normalize and ensure uid is present (fallback to id or email)
    const uid = rawUser.uid || rawUser.id || rawUser.email;
    const id = rawUser.id || uid;

    const user: User = {
      ...rawUser,
      id,
      uid,
    };

    return user;
  }

  async logout(): Promise<void> {
    this.clearToken();
    // Clear encryption keys on logout
    const { clearEncryptionKeys } = await import('./fieldEncryption');
    clearEncryptionKeys();
  }

  async updatePlan(planData: any): Promise<User> {
    const response = await this.fetchWithAuth('/update-plan', {
      method: 'POST',
      body: JSON.stringify(planData),
    });

    if (!response.ok) {
      throw new Error('Failed to update plan');
    }

    return response.json();
  }

  async incrementMeetings(count: number = 1): Promise<User> {
    console.log('🌐 apiClient.incrementMeetings called with count:', count);
    console.log('   Token:', this.getToken() ? 'Present' : 'Missing');
    
    const response = await this.fetchWithAuth('/increment-meetings', {
      method: 'POST',
      body: JSON.stringify({ count }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Backend responded with error:', response.status, errorText);
      throw new Error('Failed to increment meetings: ' + errorText);
    }

    const result = await response.json();
    console.log('✅ Backend response:', result);
    return result;
  }

  async getMeetings(folderId?: string): Promise<{ 
    meetings: any[]; 
    meetingCount: number; 
    meetingLimit: number | null; 
    meetingSlotsRemaining: number | null 
  }> {
    const token = this.getToken();
    const url = folderId ? `${API_BASE_URL}/meetings?folderId=${folderId}` : `${API_BASE_URL}/meetings`;
    
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to get meetings');
    }

    return response.json();
  }

  async createMeeting(data: { 
    title?: string; 
    folderId?: string; 
    notes?: string;
    createdAt?: string;
    startedAt?: string;
    meetingStartedAt?: string;
    transcript?: string;
    [key: string]: any;
  }): Promise<{ meeting: any; meetings: any[]; meetingCount: number; meetingLimit: number; meetingSlotsRemaining: number }> {
    const token = this.getToken();
    
    // Import encryption utilities
    const { encryptPayload, SENSITIVE_FIELDS } = await import('./fieldEncryption');
    
    try {
      // Encrypt sensitive meeting fields
      const fieldsToEncrypt = [];
      if (data.transcript) fieldsToEncrypt.push({ path: SENSITIVE_FIELDS.TRANSCRIPT, encoding: 'utf8' as const });
      if (data.protocol) fieldsToEncrypt.push({ path: SENSITIVE_FIELDS.PROTOCOL, encoding: 'utf8' as const });
      if (data.notes) fieldsToEncrypt.push({ path: SENSITIVE_FIELDS.NOTES, encoding: 'utf8' as const });
      
      let payload = data;
      if (fieldsToEncrypt.length > 0) {
        payload = await encryptPayload(token, data, fieldsToEncrypt);
      }

      const response = await fetch(`${API_BASE_URL}/meetings`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to create meeting');
      }

      return response.json();
    } catch (error) {
      console.error('Failed to encrypt meeting payload:', error);
      // Fallback to unencrypted for backward compatibility
      const response = await fetch(`${API_BASE_URL}/meetings`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to create meeting');
      }

      return response.json();
    }
  }

  async updateMeeting(id: string, data: any): Promise<{ meeting: any; meetings: any[]; meetingCount: number; meetingLimit: number; meetingSlotsRemaining: number }> {
    const token = this.getToken();
    
    // Import encryption utilities
    const { encryptPayload, SENSITIVE_FIELDS } = await import('./fieldEncryption');
    
    try {
      // Encrypt sensitive meeting fields
      const fieldsToEncrypt = [];
      if (data.transcript) fieldsToEncrypt.push({ path: SENSITIVE_FIELDS.TRANSCRIPT, encoding: 'utf8' as const });
      if (data.protocol) fieldsToEncrypt.push({ path: SENSITIVE_FIELDS.PROTOCOL, encoding: 'utf8' as const });
      if (data.notes) fieldsToEncrypt.push({ path: SENSITIVE_FIELDS.NOTES, encoding: 'utf8' as const });
      
      let payload = data;
      if (fieldsToEncrypt.length > 0) {
        payload = await encryptPayload(token, data, fieldsToEncrypt);
      }

      const response = await fetch(`${API_BASE_URL}/meetings/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to update meeting');
      }

      return response.json();
    } catch (error) {
      console.error('Failed to encrypt meeting update payload:', error);
      // Fallback to unencrypted for backward compatibility
      const response = await fetch(`${API_BASE_URL}/meetings/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to update meeting');
      }

      return response.json();
    }
  }

  async deleteMeeting(id: string): Promise<{ meetings: any[]; meetingCount: number; meetingLimit: number; meetingSlotsRemaining: number }> {
    const token = this.getToken();
    const response = await fetch(`${API_BASE_URL}/meetings/${id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to delete meeting');
    }

    return response.json();
  }

  async createStripeCheckout(priceId: string): Promise<{ url: string }> {
    const response = await this.fetchWithAuth('/stripe/checkout', {
      method: 'POST',
      body: JSON.stringify({ priceId }),
    });

    if (!response.ok) {
      throw new Error('Failed to create checkout session');
    }

    return response.json();
  }

  async getStripePortalUrl(): Promise<{ url: string }> {
    const response = await this.fetchWithAuth('/stripe/portal', {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error('Failed to get portal URL');
    }

    return response.json();
  }

  async resetPassword(email: string): Promise<{ success: boolean }> {
    const response = await fetch(`${API_BASE_URL}/reset-password`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to send reset email' }));
      throw new Error(error.error || 'Failed to send reset email');
    }

    return response.json();
  }

  async cancelSubscription(atPeriodEnd: boolean = true): Promise<{
    success: boolean;
    status?: string;
    cancelAtPeriodEnd?: boolean;
    currentPeriodEnd?: string;
  }> {
    const response = await this.fetchWithAuth('/subscription/cancel', {
      method: 'POST',
      body: JSON.stringify({ atPeriodEnd }),
    });

    if (!response.ok) {
      throw new Error('Failed to cancel subscription');
    }

    return response.json();
  }

  async downgradeSubscription(): Promise<{ success: boolean; message: string }> {
    const response = await this.fetchWithAuth('/subscription/downgrade', {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error('Failed to downgrade subscription');
    }

    return response.json();
  }

  async deleteAccount(): Promise<{ success: boolean }> {
    const response = await this.fetchWithAuth('/delete-account', {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error('Failed to delete account');
    }

    this.clearToken();
    return response.json();
  }

  async terminateAccount(): Promise<{ success: boolean }> {
    const response = await this.fetchWithAuth('/account/terminate', {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error('Failed to terminate account');
    }

    this.clearToken();
    return response.json();
  }

  isAuthenticated(): boolean {
    // On io.tivly.se (native app shell), authentication is cookie-based only.
    // We should not block auth checks just because there is no bearer token.
    if (typeof window !== 'undefined' && window.location.hostname.includes('io.tivly.se')) {
      return true;
    }

    return !!this.getToken();
  }

  // Unlimited invite methods
  async createUnlimitedInvite(recipientEmail: string, inviteSecret: string): Promise<{ redemptionUrl: string }> {
    const response = await fetch(`${API_BASE_URL}/invites/unlimited`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-invite-secret': inviteSecret,
      },
      body: JSON.stringify({ recipientEmail }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to create invite' }));
      throw new Error(error.error || 'Failed to create invite');
    }

    return response.json();
  }

  async validateUnlimitedInvite(token: string): Promise<{ valid: boolean; error?: string }> {
    const response = await fetch(`${API_BASE_URL}/invites/unlimited/${token}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to validate invite' }));
      return { valid: false, error: error.error || 'Invalid invite' };
    }

    return response.json();
  }

  // Folder API methods
  async getFolders(): Promise<any[]> {
    const response = await this.fetchWithAuth('/folders');
    if (!response.ok) {
      throw new Error('Failed to get folders');
    }
    const data = await response.json();
    if (Array.isArray(data)) return data;
    if (Array.isArray((data as any)?.folders)) return (data as any).folders;
    if (Array.isArray((data as any)?.user?.folders)) return (data as any).user.folders;
    return [];
  }

  async createFolder(data: { name: string; color?: string; icon?: string }): Promise<any> {
    const response = await this.fetchWithAuth('/folders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error('Failed to create folder');
    }
    return response.json();
  }

  async updateFolder(id: string, data: { name?: string; color?: string; icon?: string; order?: number }): Promise<any> {
    const response = await this.fetchWithAuth(`/folders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error('Failed to update folder');
    }
    return response.json();
  }

  async deleteFolder(id: string): Promise<void> {
    const response = await this.fetchWithAuth(`/folders/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to delete folder');
    }
  }

  // ==================== ENTERPRISE API ====================

  // Get current user's enterprise membership (non-admin endpoint)
  // Admins can pass companyId to fetch specific company info
  async getMyEnterpriseMembership(companyId?: string): Promise<{
    isMember: boolean;
    company?: {
      id: string;
      name: string;
      slug: string;
      status: string;
      planTier: string;
      billingStatus?: string;
      billingHistory?: any[];
      speakerIdentificationEnabled?: boolean;
      trial?: {
        enabled: boolean;
        startsAt: string;
        endsAt: string;
        daysTotal: number;
        daysRemaining: number | null;
        expired: boolean;
        configuredBy: string;
        manuallyDisabled: boolean;
        disabledAt: string | null;
        disabledBy: string | null;
      };
      preferences?: {
        specialPerkEnabled?: boolean;
        meetingCreatorVisibility?: string;
        storageRegion?: string;
        dataRetentionDays?: number;
        allowAdminFolderLock?: boolean;
      };
      billing?: {
        status: 'active' | 'paid' | 'unpaid' | 'canceled' | 'none';
        latestInvoice?: {
          id: string;
          status: string;
          billingType: string;
          subscriptionId?: string;
          subscriptionStatus?: string;
          cancelAtPeriodEnd?: boolean;
          cancelAt?: string | null;
          currentPeriodEnd?: string;
          amountDue?: number;
          invoiceUrl?: string;
        };
        activeSubscription?: {
          id: string;
          status: string;
          cancelAtPeriodEnd: boolean;
          cancelAt: string | null;
          currentPeriodEnd: string | null;
        };
      };
    };
    membership?: {
      role: string;
      status: string;
      title?: string;
      joinedAt?: string;
    };
  }> {
    try {
      const url = companyId ? `/enterprise/me?companyId=${companyId}` : '/enterprise/me';
      const response = await this.fetchWithAuth(url, { suppressAuthRedirect: true });
      
      if (!response.ok) {
        // Legacy 404 handling for older backends
        if (response.status === 404) {
          return { isMember: false };
        }
        console.error('[API] Unexpected enterprise membership error:', response.status);
        return { isMember: false };
      }
      
      const data = await response.json();
      
      // Handle new backend response format: { company: null, membership: null }
      if (!data.company && !data.membership) {
        return { isMember: false };
      }
      
      // Extract speakerIdentificationEnabled from company or enterprise payload
      const sisEnabled = data.company?.speakerIdentificationEnabled ?? 
                         data.company?.preferences?.speakerIdentificationEnabled ??
                         data.enterprise?.speakerIdentificationEnabled ??
                         true; // Default to true per docs
      
      return {
        isMember: true,
        company: {
          ...data.company,
          speakerIdentificationEnabled: sisEnabled,
        },
        membership: data.membership
      };
    } catch (error) {
      // Silently return false for expected cases, only log unexpected errors
      if (error instanceof Error && !error.message.includes('404')) {
        console.error('[API] Enterprise membership error:', error);
      }
      return { isMember: false };
    }
  }

  // Enterprise Billing Subscription Status (Member Endpoint)
  // GET /enterprise/companies/:companyId/billing/subscription
  async getEnterpriseCompanyBillingSubscription(companyId: string): Promise<{
    success: boolean;
    companyId: string;
    subscription: null | {
      id: string;
      status: string;
      collectionMethod?: string;
      autoChargeEnabled?: boolean;
      currentPeriodStart?: string | null;
      currentPeriodEnd?: string | null;
      startedAt?: string | null;
      cancelAtPeriodEnd?: boolean;
      cancelAt?: string | null;
      canceledAt?: string | null;
      endedAt?: string | null;
      trialEnd?: string | null;
      paymentMethodId?: string | null;
      paymentMethodSource?: string | null;
    };
    latestInvoice: null | {
      id: string;
      status: string;
      hostedInvoiceUrl?: string;
      hostedInvoicePath?: string;
      stripeInvoiceUrl?: string;
      paymentIntentClientSecret?: string;
      paymentIntentId?: string;
      paymentIntentStatus?: string;
      amountDue?: number;
      amountPaid?: number;
      amountRemaining?: number;
      amountSek?: number;
      currency?: string;
      collectionMethod?: string;
      dueDate?: string | null;
      paidAt?: string | null;
      createdAt?: string | null;
      periodStart?: string | null;
      periodEnd?: string | null;
      billingType?: 'one_time' | 'monthly' | 'yearly';
      companyName?: string;
    };
    timestamp: string;
  }> {
    const response = await this.fetchWithAuth(
      `/enterprise/companies/${companyId}/billing/subscription`,
      { suppressAuthRedirect: true }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to fetch subscription status' }));
      throw new Error((error as any).error || (error as any).message || 'Failed to fetch subscription status');
    }

    return response.json();
  }

  async getEnterpriseCompanies(): Promise<any> {
    const response = await this.fetchWithAuth('/admin/enterprise/companies');
    if (!response.ok) throw new Error('Failed to fetch enterprise companies');
    return response.json();
  }

  async createEnterpriseCompany(data: {
    name: string;
    contactEmail?: string;
    domains?: string[];
    planTier?: string;
    status?: string;
    notes?: string;
    metadata?: any;
    memberLimit?: number | null;
    dataAccessMode?: 'shared' | 'individual';
    adminFullAccessEnabled?: boolean;
    preferences?: {
      meetingCreatorVisibility?: 'shared_only' | 'always' | 'hidden';
      storageRegion?: 'eu' | 'us' | 'auto';
      dataRetentionDays?: number;
      allowAdminFolderLock?: boolean;
      speakerIdentificationEnabled?: boolean;
      specialPerkEnabled?: boolean;
    };
    members?: Array<{
      email: string;
      role?: string;
      status?: string;
      title?: string;
      notes?: string;
    }>;
  }): Promise<any> {
    const response = await this.fetchWithAuth('/admin/enterprise/companies', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create enterprise company');
    return response.json();
  }

  async getEnterpriseCompany(companyId: string): Promise<any> {
    const response = await this.fetchWithAuth(`/admin/enterprise/companies/${companyId}`);
    if (!response.ok) throw new Error('Failed to fetch enterprise company');
    return response.json();
  }

  async updateEnterpriseCompany(companyId: string, data: {
    name?: string;
    slug?: string;
    status?: string;
    planTier?: string;
    contactEmail?: string;
    domains?: string[];
    notes?: string;
    metadata?: any;
    memberLimit?: number | null;
    dataAccessMode?: 'shared' | 'individual';
    adminFullAccessEnabled?: boolean;
    preferences?: {
      meetingCreatorVisibility?: 'shared_only' | 'always' | 'hidden';
      storageRegion?: 'eu' | 'us' | 'auto';
      dataRetentionDays?: number;
      allowAdminFolderLock?: boolean;
      speakerIdentificationEnabled?: boolean;
      specialPerkEnabled?: boolean;
    };
  }): Promise<any> {
    const response = await this.fetchWithAuth(`/admin/enterprise/companies/${companyId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update enterprise company');
    return response.json();
  }

  async addEnterpriseCompanyMember(companyId: string, data: {
    email: string;
    role?: string;
    status?: string;
    title?: string;
    notes?: string;
    preferredName?: string;
  }): Promise<any> {
    const response = await this.fetchWithAuth(`/admin/enterprise/companies/${companyId}/members`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || errorData.error || 'Failed to add company member');
    }
    return response.json();
  }

  async updateEnterpriseCompanyMember(companyId: string, memberEmail: string, data: {
    role?: string;
    status?: string;
    title?: string;
    notes?: string;
    preferredName?: string;
  }): Promise<any> {
    const response = await this.fetchWithAuth(
      `/admin/enterprise/companies/${companyId}/members/${encodeURIComponent(memberEmail)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      }
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || errorData.error || 'Failed to update company member');
    }
    return response.json();
  }

  async deleteEnterpriseCompanyMember(companyId: string, memberEmail: string): Promise<any> {
    const response = await this.fetchWithAuth(
      `/admin/enterprise/companies/${companyId}/members/${encodeURIComponent(memberEmail)}`,
      {
        method: 'DELETE',
      }
    );
    if (!response.ok) throw new Error('Failed to remove company member');
    return response.json();
  }

  async deleteEnterpriseCompany(companyId: string): Promise<any> {
    const response = await this.fetchWithAuth(
      `/admin/enterprise/companies/${companyId}`,
      {
        method: 'DELETE',
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to delete company' }));
      throw new Error(error.error || 'Failed to delete company');
    }
    return response.json();
  }

  async createEnterpriseCompanyTrial(companyId: string, data: {
    days?: number;
    startsAt?: string;
    enable?: boolean;
  }): Promise<any> {
    const response = await this.fetchWithAuth(
      `/admin/enterprise/companies/${companyId}/trial`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to create trial' }));
      throw new Error(error.error || 'Failed to create trial');
    }
    return response.json();
  }

  async disableEnterpriseCompanyTrial(companyId: string): Promise<any> {
    const response = await this.fetchWithAuth(
      `/admin/enterprise/companies/${companyId}/trial`,
      {
        method: 'POST',
        body: JSON.stringify({ disable: true }),
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to disable trial' }));
      throw new Error(error.error || 'Failed to disable trial');
    }
    return response.json();
  }

  async resumeEnterpriseCompanyTrial(companyId: string, days?: number): Promise<any> {
    const response = await this.fetchWithAuth(
      `/admin/enterprise/companies/${companyId}/trial`,
      {
        method: 'POST',
        body: JSON.stringify({ enable: true, days }),
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to resume trial' }));
      throw new Error(error.error || 'Failed to resume trial');
    }
    return response.json();
  }

  // Toggle special perk for a company - bypasses billing/trial checks
  async toggleEnterpriseCompanySpecialPerk(companyId: string, enabled: boolean): Promise<{
    success: boolean;
    enabled: boolean;
    company: any;
    timestamp: string;
  }> {
    const response = await this.fetchWithAuth(
      `/admin/enterprise/companies/${companyId}/perks/special`,
      {
        method: 'POST',
        body: JSON.stringify({ enabled }),
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to toggle special perk' }));
      throw new Error(error.error || 'Failed to toggle special perk');
    }
    return response.json();
  }

  async resetUserSIS(email: string): Promise<{
    ok: boolean;
    message: string;
    sisSample: {
      status: 'missing';
      speakerName: null;
      uploadedAt: null;
      lastTranscribedAt: null;
      lastCheckedAt: null;
      lastMatchScore: null;
      matches: [];
      error: null;
    };
  }> {
    const response = await this.fetchWithAuth(
      `/admin/users/${encodeURIComponent(email)}/reset-sis`,
      { method: 'POST' }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to reset SIS sample' }));
      throw new Error(error.error || 'Failed to reset SIS sample');
    }
    return response.json();
  }

  async getSISCompanies(): Promise<{
    timestamp: string;
    companies: Array<{
      id: string;
      name: string;
      slug: string;
      status: string;
      planTier: string;
      domains: string[];
      memberCount: number;
      sisReadyCount: number;
      members: Array<{
        email: string;
        role: string;
        status: string;
        sisSample: {
          status: 'ready' | 'processing' | 'error' | 'missing';
          speakerName: string | null;
          uploadedAt: string | null;
          lastTranscribedAt: string | null;
          lastCheckedAt: string | null;
          lastMatchScore: number | null;
          matchCount: number;
        };
      }>;
    }>;
  }> {
    const response = await this.fetchWithAuth('/admin/sis/companies');
    if (!response.ok) {
      throw new Error('Failed to fetch SIS companies overview');
    }
    return response.json();
  }

  // Admin operations
  async getAdminUsers(): Promise<any> {
    const response = await this.fetchWithAuth('/admin/users');
    if (!response.ok) {
      let detail = '';
      try { detail = await response.text(); } catch {}
      throw new Error(`Failed to fetch admin users (status ${response.status})${detail ? `: ${detail}` : ''}`);
    }
    return response.json();
  }

  async getAdminUserDetail(email: string): Promise<any> {
    const response = await this.fetchWithAuth(`/admin/users/${encodeURIComponent(email)}`);
    if (!response.ok) {
      throw new Error('Failed to fetch user details');
    }
    return response.json();
  }

  async getAdminUserStripeDashboard(email: string): Promise<{ url: string }> {
    const response = await this.fetchWithAuth(`/admin/users/${encodeURIComponent(email)}/stripe-dashboard`);
    if (!response.ok) {
      throw new Error('Failed to get Stripe dashboard URL');
    }
    return response.json();
  }

  async updateAdminUserPlan(
    email: string,
    data: {
      plan: string;
      priceId?: string;
      synchronizeStripe?: boolean;
      prorationBehavior?: 'create_prorations' | 'none';
      cancelAtPeriodEnd?: boolean;
    }
  ): Promise<any> {
    // Retry logic for 502 errors
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.fetchWithAuth(`/admin/users/${encodeURIComponent(email)}/plan`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          // If it's a 502, retry after a delay
          if (response.status === 502 && attempt < maxRetries) {
            console.warn(`502 error, retrying in ${attempt * 1000}ms (attempt ${attempt}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, attempt * 1000));
            continue;
          }

          const error = await response.json().catch(() => ({ error: 'Failed to update plan' }));
          throw new Error(error.error || `Failed to update plan (${response.status})`);
        }

        return response.json();
      } catch (error) {
        lastError = error as Error;
        
        // If it's a network error and we have retries left, retry
        if (attempt < maxRetries && (error as Error).message.includes('fetch')) {
          console.warn(`Network error, retrying in ${attempt * 1000}ms (attempt ${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
          continue;
        }
        
        throw error;
      }
    }

    throw lastError || new Error('Failed to update plan after retries');
  }

  async resetUserMonthlyUsage(email: string, note?: string): Promise<any> {
    const body: any = {};
    if (note && note.trim()) {
      body.note = note.trim().slice(0, 500);
    }
    const response = await this.fetchWithAuth(
      `/admin/users/${encodeURIComponent(email)}/reset-usage`,
      {
        method: 'POST',
        body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to reset usage' }));
      throw new Error(error.error || 'Failed to reset monthly usage');
    }
    return response.json();
  }

  // Protocol count management
  async incrementProtocolCount(meetingId: string, count: number = 1): Promise<{ meetingId: string; protocolCount: number }> {
    const response = await this.fetchWithAuth(`/meetings/${encodeURIComponent(meetingId)}/protocol-count/increment`, {
      method: 'POST',
      body: JSON.stringify({ count }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to increment protocol count' }));
      throw new Error(error.error || 'Failed to increment protocol count');
    }
    return response.json();
  }

  async getProtocolCount(meetingId: string): Promise<{ meetingId: string; protocolCount: number }> {
    const response = await this.fetchWithAuth(`/meetings/${encodeURIComponent(meetingId)}/protocol-count`);
    if (!response.ok) {
      if (response.status === 404) {
        return { meetingId, protocolCount: 0 };
      }
      const error = await response.json().catch(() => ({ error: 'Failed to get protocol count' }));
      throw new Error(error.error || 'Failed to get protocol count');
    }
    return response.json();
  }

  async resetUserProtocolCounts(email: string): Promise<{ ok: boolean; reset: number; email: string }> {
    const response = await this.fetchWithAuth(`/admin/users/${encodeURIComponent(email)}/protocol-count/reset`, {
      method: 'POST',
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to reset protocol counts' }));
      throw new Error(error.error || 'Failed to reset protocol counts');
    }
    return response.json();
  }

  async deleteAdminUser(email: string): Promise<any> {
    const response = await this.fetchWithAuth(`/admin/users/${encodeURIComponent(email)}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to delete user');
    }
    return response.json();
  }

  async grantUserCredit(email: string, options: {
    type?: 'extra' | 'unlimited' | 'clear';
    extraMeetings?: number;
    expiresAt?: string;
    durationDays?: number;
    durationHours?: number;
    durationMinutes?: number;
    note?: string;
    clear?: boolean;
  }): Promise<any> {
    const response = await this.fetchWithAuth(`/admin/users/${encodeURIComponent(email)}/credit`, {
      method: 'POST',
      body: JSON.stringify(options),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to grant credit' }));
      throw new Error(error.error || 'Failed to grant credit');
    }
    return response.json();
  }

  // Agenda API methods
  async getAgendas(): Promise<any[]> {
    const response = await this.fetchWithAuth('/agendas');
    if (!response.ok) {
      throw new Error('Failed to get agendas');
    }
    const data = await response.json();
    return Array.isArray(data) ? data : (data.agendas || []);
  }

  async getAgenda(id: string): Promise<any> {
    const response = await this.fetchWithAuth(`/agendas/${id}`);
    if (!response.ok) {
      throw new Error('Failed to get agenda');
    }
    return response.json();
  }

  async createAgenda(data: { name: string; content: string }): Promise<any> {
    const response = await this.fetchWithAuth('/agendas', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error('Failed to create agenda');
    }
    return response.json();
  }

  async updateAgenda(id: string, data: { name?: string; content?: string }): Promise<any> {
    const response = await this.fetchWithAuth(`/agendas/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error('Failed to update agenda');
    }
    return response.json();
  }

  async deleteAgenda(id: string): Promise<void> {
    const response = await this.fetchWithAuth(`/agendas/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to delete agenda');
    }
  }

  // User roles API methods
  async getUserRole(email: string): Promise<{ role: string } | null> {
    const emailPath = encodeURIComponent(email);

    // Try both endpoints: without and with .json suffix
    const tryFetch = async (path: string) => this.fetchWithAuth(path);

    let response = await tryFetch(`/user-roles/${emailPath}`);
    if (!response.ok && response.status === 404) {
      response = await tryFetch(`/user-roles/${emailPath}.json`);
    }

    if (!response.ok) {
      if (response.status === 404) return null;
      let detail = '';
      try { detail = await response.text(); } catch {}
      throw new Error(`Failed to get user role (status ${response.status})${detail ? `: ${detail}` : ''}`);
    }

    // Normalize various possible response shapes into { role: string } | null
    try {
      const data = await response.json();

      let role: string | null = null;
      if (!data) {
        role = null;
      } else if (typeof data === 'string') {
        role = data;
      } else if (typeof data.role === 'string') {
        role = data.role;
      } else if (data.role && typeof data.role === 'object') {
        // Handle nested role objects like { role: { role: 'admin' } } or { role: { name: 'admin' } }
        if (typeof data.role.role === 'string') role = data.role.role;
        else if (typeof data.role.name === 'string') role = data.role.name;
        else if (typeof data.role.type === 'string') role = data.role.type;
      } else if (Array.isArray(data) && data.length) {
        const first = data[0];
        if (typeof first === 'string') role = first;
        else if (typeof first?.role === 'string') role = first.role;
        else if (first?.role && typeof first.role === 'object') {
          if (typeof first.role.role === 'string') role = first.role.role;
          else if (typeof first.role.name === 'string') role = first.role.name;
        }
      }

      return role ? { role: role.toLowerCase() } : null;
    } catch {
      return null;
    }
  }

  async getAllUserRoles(): Promise<any[]> {
    const response = await this.fetchWithAuth('/user-roles');
    if (!response.ok) {
      let detail = '';
      try { detail = await response.text(); } catch {}
      throw new Error(`Failed to get user roles (status ${response.status})${detail ? `: ${detail}` : ''}`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : (data.roles || []);
  }

  async createUserRole(email: string, role: string): Promise<any> {
    const response = await this.fetchWithAuth('/user-roles', {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to create user role' }));
      throw new Error(error.error || 'Failed to create user role');
    }
    return response.json();
  }

  async deleteUserRole(email: string): Promise<void> {
    const response = await this.fetchWithAuth(`/user-roles/${encodeURIComponent(email)}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to delete user role');
    }
  }

  // Enterprise admin controls
  async getEnterpriseCompanyMeetings(companyId: string, memberEmail?: string): Promise<any> {
    const params = memberEmail ? `?memberEmail=${encodeURIComponent(memberEmail)}` : '';
    const response = await this.fetchWithAuth(`/enterprise/companies/${companyId}/meetings${params}`);
    if (!response.ok) throw new Error('Failed to fetch company meetings');
    return response.json();
  }

  async createEnterpriseCompanyBilling(
    companyId: string,
    data: {
      billingType: 'one_time' | 'monthly' | 'yearly';
      amountSek: number;
      oneTimeAmountSek?: number;
      combineOneTime?: boolean;
    }
  ): Promise<{
    success: boolean;
    companyId: string;
    billingType: string;
    invoiceUrl: string;
    portalUrl?: string;
    subscriptionId?: string;
    oneTimeInvoiceUrl?: string;
    oneTimeInvoiceId?: string;
  }> {
    // Build payload with optional oneTimeAmountSek and combineOneTime
    const payload: any = {
      billingType: data.billingType,
      amountSek: data.amountSek
    };
    
    // Only include oneTimeAmountSek if it's provided and greater than 0
    if (data.oneTimeAmountSek && data.oneTimeAmountSek > 0) {
      payload.oneTimeAmountSek = data.oneTimeAmountSek;
      // Include combineOneTime flag if provided
      if (data.combineOneTime !== undefined) {
        payload.combineOneTime = data.combineOneTime;
      }
    }
    
    console.log('🔵 Creating billing:', { companyId, payload });
    
    const response = await this.fetchWithAuth(
      `/admin/enterprise/companies/${companyId}/billing`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    
    console.log('🔵 Billing response status:', response.status);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to create billing' }));
      console.error('🔴 Billing error:', error);
      throw new Error(error.error || error.message || 'Failed to create company billing');
    }
    return response.json();
  }

  async getEnterpriseCompanyBillingHistory(companyId: string): Promise<{
    billingHistory: Array<{
      id: string;
      billingType: 'one_time' | 'monthly' | 'yearly';
      amountSek: number;
      status: string;
      invoiceUrl: string;
      invoiceId?: string;
      portalUrl?: string;
      subscriptionId?: string;
      createdAt: string;
      createdBy: string;
    }>;
    summary?: {
      activeSubscriptions: number;
      totalInvoices: number;
      totalRevenue: number;
    };
  }> {
    const response = await this.fetchWithAuth(
      `/admin/enterprise/companies/${companyId}/billing`
    );
    if (!response.ok) {
      // 404 is expected if no billing history exists yet
      if (response.status === 404) {
        return { billingHistory: [] };
      }
      const error = await response.json().catch(() => ({ error: 'Failed to fetch billing history' }));
      throw new Error(error.error || 'Failed to fetch company billing history');
    }
    return response.json();
  }

  async refreshInvoiceStatus(companyId: string, invoiceId: string): Promise<{
    success: boolean;
    invoice: {
      id: string;
      status: string;
      invoiceUrl: string;
      amountSek: number;
    };
  }> {
    const response = await this.fetchWithAuth(
      `/admin/enterprise/companies/${companyId}/billing/${invoiceId}`
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to refresh invoice' }));
      throw new Error(error.error || 'Failed to refresh invoice status');
    }
    return response.json();
  }

  async sendInvoiceEmail(companyId: string, invoiceId: string): Promise<{
    success: boolean;
    message?: string;
  }> {
    const response = await this.fetchWithAuth(
      `/admin/enterprise/companies/${companyId}/billing/${invoiceId}/send`,
      {
        method: 'POST',
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to send invoice' }));
      throw new Error(error.error || 'Failed to send invoice email');
    }
    return response.json();
  }

  async deleteInvoiceHistoryEntry(companyId: string, entryId: string): Promise<{
    success: boolean;
  }> {
    const response = await this.fetchWithAuth(
      `/admin/enterprise/companies/${companyId}/billing/history/${entryId}`,
      {
        method: 'DELETE',
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to delete entry' }));
      throw new Error(error.error || 'Failed to delete history entry');
    }
    return response.json();
  }

  // Member-safe invoice detail endpoint - fetches fresh paymentIntentClientSecret
  async getEnterpriseInvoiceDetail(invoiceId: string): Promise<{
    success: boolean;
    invoice: {
      id: string;
      invoiceId: string;
      status: string;
      amountSek: number;
      oneTimeAmountSek?: number;
      billingType: 'one_time' | 'monthly' | 'yearly';
      createdAt: string;
      dueAt?: string;
      paymentIntentClientSecret?: string;
      paymentIntentId?: string;
      paymentIntentStatus?: string;
      subscriptionId?: string;
      companyName?: string;
      combineOneTime?: boolean;
      hostedInvoiceUrl?: string;
      hostedInvoicePath?: string;
      stripeInvoiceUrl?: string;
    };
  }> {
    const response = await this.fetchWithAuth(
      `/enterprise/billing/${invoiceId}`,
      { suppressAuthRedirect: true }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to fetch invoice' }));
      throw new Error(error.error || error.message || 'Failed to fetch invoice details');
    }
    return response.json();
  }

  async cancelEnterpriseSubscription(
    companyId: string, 
    subscriptionId: string, 
    atPeriodEnd: boolean = true
  ): Promise<{
    success: boolean;
    subscriptionId: string;
    status: string;
    cancelAt?: string;
    canceledAt?: string;
  }> {
    const response = await this.fetchWithAuth(
      `/admin/enterprise/companies/${companyId}/billing/subscriptions/${subscriptionId}/cancel`,
      {
        method: 'POST',
        body: JSON.stringify({ atPeriodEnd }),
      }
    );
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to cancel subscription' }));
      throw new Error(error.error || 'Failed to cancel subscription');
    }
    return response.json();
  }

  // Get transcription status for a meeting (polling endpoint)
  // Uses meetingId-based polling via /asr/status
  async getTranscriptionStatus(meetingId: string): Promise<{
    success: boolean;
    status: 'queued' | 'processing' | 'done' | 'completed' | 'failed' | 'error';
    transcript?: string;
    path?: string;
    jsonPath?: string;
    duration?: number;
    processing_time?: number;
    progress?: number;
    error?: string;
    updatedAt?: string;
  }> {
    const token = this.getToken();
    if (!token) {
      throw new Error('Authentication required');
    }

    try {
      const response = await fetch(`${API_BASE_URL}/asr/status?meetingId=${encodeURIComponent(meetingId)}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      // Handle specific HTTP status codes
      if (response.status === 404) {
        // Job not found yet - treat as queued (still being registered)
        console.log('📊 ASR status: 404 - job not registered yet, treating as queued');
        return {
          success: true,
          status: 'queued',
          progress: 0,
        };
      }

      if (response.status === 202) {
        // Accepted but still processing
        const data = await response.json().catch(() => ({}));
        return {
          success: true,
          status: data.status || 'processing',
          progress: data.progress || 0,
        };
      }

      if (!response.ok) {
        // Other errors - keep polling but log
        console.warn('📊 ASR status check failed:', response.status);
        return {
          success: false,
          status: 'queued', // Assume still queued, keep polling
          error: `Status check returned ${response.status}`
        };
      }

      const data = await response.json();
      
      // Normalize status values
      let normalizedStatus = data.status;
      if (normalizedStatus === 'completed') normalizedStatus = 'done';
      
      console.log('📊 ASR status:', normalizedStatus, data.progress ? `${data.progress}%` : '');
      
      return {
        success: true,
        status: normalizedStatus,
        transcript: data.transcript,
        progress: data.progress,
        duration: data.duration,
        processing_time: data.processing_time,
        error: data.error,
      };
    } catch (error: any) {
      // On network error, assume still queued and continue polling
      console.warn('📊 ASR status network error:', error.message);
      return {
        success: false,
        status: 'queued',
        error: error.message || 'Network error'
      };
    }
  }

  // Legacy endpoint for backwards compatibility
  async getTranscriptionStatusLegacy(meetingId: string): Promise<any> {
    const token = this.getToken();
    if (!token) {
      throw new Error('Authentication required');
    }
    
    const response = await fetch(`${API_BASE_URL}/meetings/${meetingId}/transcription`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText || 'Failed to get transcription status' };
      }
      return {
        success: false,
        status: 'failed',
        error: errorData.error || 'transcription_status_failed'
      };
    }

    return response.json();
  }

  // Upload audio for transcription (Library-first flow)
  async uploadForTranscription(
    audioFile: File | Blob,
    meetingId: string,
    options?: {
      meetingTitle?: string;
      language?: string;
      modelSize?: 'tiny' | 'base' | 'small' | 'medium' | 'large';
      onProgress?: (progress: number) => void;
    }
  ): Promise<{
    success: boolean;
    status?: 'processing' | 'done' | 'failed';
    transcript?: string;
    path?: string;
    jsonPath?: string;
    duration?: number;
    processing_time?: number;
    error?: string;
  }> {
    const token = this.getToken();
    if (!token) {
      throw new Error('Authentication required');
    }

    const fileSizeMB = ((audioFile as File).size || (audioFile as Blob).size) / 1024 / 1024;
    const fileName = (audioFile as File).name || 'audio.wav';

    console.log('📤 Uploading audio for transcription:', {
      fileName,
      fileSize: `${fileSizeMB.toFixed(2)}MB`,
      fileType: audioFile.type,
      meetingId,
      language: options?.language || 'sv'
    });

    // Validate file size (250MB limit)
    if (fileSizeMB > 250) {
      throw new Error('File size exceeds 250MB limit');
    }

    const formData = new FormData();
    formData.append('audioFile', audioFile, fileName);
    formData.append('file', audioFile, fileName); // Alternative field name
    formData.append('meetingId', meetingId);
    formData.append('language', options?.language || 'sv');
    if (options?.meetingTitle) {
      formData.append('meetingTitle', options.meetingTitle);
    }
    if (options?.modelSize) {
      formData.append('modelSize', options.modelSize);
    }

    try {
      options?.onProgress?.(10);

      const response = await fetch(`${API_BASE_URL}/transcribe`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      options?.onProgress?.(50);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Upload for transcription failed:', {
          status: response.status,
          statusText: response.statusText,
          errorBody: errorText
        });

        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || 'Failed to upload for transcription' };
        }

        return {
          success: false,
          status: 'failed',
          error: errorData.error || 'upload_failed'
        };
      }

      const data = await response.json();
      options?.onProgress?.(100);

      console.log('✅ Upload successful:', {
        status: data.status,
        path: data.path
      });

      return {
        success: true,
        status: data.status || 'processing',
        transcript: data.transcript,
        path: data.path,
        jsonPath: data.jsonPath,
        duration: data.duration,
        processing_time: data.processing_time
      };
    } catch (error: any) {
      console.error('❌ Upload error:', error);
      return {
        success: false,
        status: 'failed',
        error: error.message || 'Network error during upload'
      };
    }
  }

  // Transcription API - Enhanced with meetingId support and retry
  async transcribeAudio(
    audioFile: File | Blob, 
    language: string = 'sv', 
    options?: { 
      meetingId?: string;
      onProgress?: (progress: number) => void;
    }
  ): Promise<TranscribeResponse> {
    const token = this.getToken();
    if (!token) {
      throw new Error('Authentication required');
    }

    const fileSizeMB = ((audioFile as File).size || (audioFile as Blob).size) / 1024 / 1024;
    const fileName = (audioFile as File).name || 'audio.wav';

    console.log('🎤 Transcribing audio:', {
      fileName,
      fileSize: `${fileSizeMB.toFixed(2)}MB`,
      fileType: audioFile.type,
      language,
      meetingId: options?.meetingId
    });

    // Validate file size (250MB limit)
    if (fileSizeMB > 250) {
      throw new Error('File size exceeds 250MB limit');
    }

    const formData = new FormData();
    formData.append('audioFile', audioFile, fileName);
    formData.append('file', audioFile, fileName); // Alternative field name
    formData.append('language', language);
    if (options?.meetingId) {
      formData.append('meetingId', options.meetingId);
    }

    try {
      // Report initial progress
      options?.onProgress?.(10);

      const response = await fetch(`${API_BASE_URL}/transcribe`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      // Report upload complete
      options?.onProgress?.(50);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Transcription failed:', {
          status: response.status,
          statusText: response.statusText,
          errorBody: errorText
        });

        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || 'Failed to transcribe audio' };
        }

        // Return failure response for retry handling
        return {
          success: false,
          error: errorData.error || errorData.message || 'transcription_failed'
        };
      }

      const data: TranscribeResponse = await response.json();
      
      // Report complete
      options?.onProgress?.(100);

      // Normalize response - handle both new and legacy formats
      const transcript = data.transcript || data.text || '';
      
      console.log('✅ Transcription successful:', {
        textLength: transcript.length,
        path: data.path,
        jsonPath: data.jsonPath,
        duration: data.duration,
        processing_time: data.processing_time
      });

      return {
        success: data.success !== false,
        transcript,
        text: transcript, // Legacy compatibility
        path: data.path,
        jsonPath: data.jsonPath,
        duration: data.duration,
        processing_time: data.processing_time
      };
    } catch (error: any) {
      console.error('❌ Transcription error:', error);
      return {
        success: false,
        error: error.message || 'Network error during transcription'
      };
    }
  }

  // Legacy wrapper for backward compatibility
  async transcribeAudioSimple(audioFile: File, language: string = 'sv'): Promise<string> {
    const result = await this.transcribeAudio(audioFile, language);
    if (!result.success) {
      throw new Error(result.error || 'Transcription failed');
    }
    return result.transcript || result.text || '';
  }

  // Maintenance mode
  async getMaintenanceStatus(): Promise<{ success: boolean; maintenance: MaintenanceStatus }> {
    const response = await this.fetchWithAuth('/maintenance');
    if (!response.ok) {
      throw new Error('Failed to fetch maintenance status');
    }
    return response.json();
  }

  async toggleMaintenance(): Promise<{ success: boolean; message: string; maintenance: MaintenanceStatus }> {
    const response = await this.fetchWithAuth('/admin/maintenance/toggle', {
      method: 'POST',
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to toggle maintenance' }));
      throw new Error((error as any).error || 'Failed to toggle maintenance');
    }
    return response.json();
  }

  // SIS (Speaker Identification System) API methods
  async getSISSampleStatus(): Promise<{
    ok: boolean;
    disabled?: boolean;
    sisSample: {
      status: 'ready' | 'processing' | 'error' | 'disabled' | 'missing' | null;
      speakerName?: string;
      uploadedAt?: string;
      lastTranscribedAt?: string;
      lastCheckedAt?: string;
      lastMatchScore?: number;
      matchCount?: number;
      matches?: Array<{
        meetingId: string;
        meetingOwnerEmail?: string;
        sampleOwnerEmail?: string;
        score: number;
        confidencePercent?: number;
        matchedWords: number;
        totalSampleWords: number;
        updatedAt: string;
      }>;
      error?: string | null;
    } | null;
  }> {
    const response = await this.fetchWithAuth('/sis/sample');
    if (!response.ok) {
      if (response.status === 404) {
        return { ok: true, sisSample: null };
      }
      // Handle 403 when SIS is disabled for enterprise
      if (response.status === 403) {
        return { ok: true, disabled: true, sisSample: { status: 'disabled' } };
      }
      throw new Error('Failed to get SIS sample status');
    }
    const data = await response.json();
    // Handle { status: 'disabled' } response from backend
    if (data.status === 'disabled' || data.sisSample?.status === 'disabled') {
      return { ok: true, disabled: true, sisSample: { status: 'disabled' } };
    }
    return data;
  }

  async uploadSISSample(audioBlob: Blob, speakerName: string): Promise<{
    ok: boolean;
    sisSample?: {
      status: 'ready' | 'processing' | 'error';
      speakerName?: string;
      uploadedAt?: string;
      lastTranscribedAt?: string;
      lastCheckedAt?: string;
      lastMatchScore?: number;
      matchCount?: number;
      matches?: Array<{
        meetingId: string;
        meetingOwnerEmail?: string;
        sampleOwnerEmail?: string;
        score: number;
        confidencePercent?: number;
        matchedWords: number;
        totalSampleWords: number;
        updatedAt: string;
      }>;
      error?: string | null;
    };
    error?: string;
  }> {
    const token = this.getToken();
    if (!token) {
      throw new Error('Authentication required');
    }

    const formData = new FormData();
    formData.append('audio', audioBlob, 'voice-sample.webm');
    formData.append('speakerName', speakerName);

    const response = await fetch(`${API_BASE_URL}/sis/sample`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to upload voice sample' }));
      // Handle 403 when SIS is disabled for the enterprise
      if (response.status === 403) {
        return { ok: false, error: error.error || error.message || 'Talaridentifiering är inaktiverad för ditt företag' };
      }
      return { ok: false, error: error.error || 'Failed to upload voice sample' };
    }

    return response.json();
  }
  // Update preferred name (all plans)
  async updatePreferredName(preferredName: string | null): Promise<{ preferredName: string | null }> {
    const response = await this.fetchWithAuth('/me/preferred-name', {
      method: 'PUT',
      body: JSON.stringify({ preferredName }),
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || errorData.error || 'Kunde inte uppdatera visningsnamn');
    }
    
    return response.json();
  }

  // ==================== SUPPORT ACCESS API ====================

  // Generate a support code for user (user endpoint)
  async generateSupportCode(): Promise<{ code: string; expiresAt: string }> {
    const response = await this.fetchWithAuth('/support/generate', {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to generate support code' }));
      throw new Error((error as any).error || 'Failed to generate support code');
    }

    return response.json();
  }

  // Revoke active support code (user endpoint)
  async revokeSupportCode(): Promise<{ success: boolean }> {
    const response = await this.fetchWithAuth('/support/revoke', {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to revoke support code' }));
      throw new Error((error as any).error || 'Failed to revoke support code');
    }

    return response.json();
  }

  // Admin: Claim a support code (admin endpoint)
  async claimSupportCode(code: string): Promise<{ supportToken: string; expiresAt: string; userEmail: string }> {
    const response = await this.fetchWithAuth('/admin/support/claim', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Invalid or expired support code' }));
      if ((error as any).error === 'support_expired') {
        throw new Error('Supportkoden har upphört');
      }
      if ((error as any).error === 'support_revoked') {
        throw new Error('Supportkoden har återkallats');
      }
      throw new Error((error as any).error || 'Ogiltig supportkod');
    }

    return response.json();
  }

  // Admin: Get user data via support token (support endpoint)
  async getSupportUserData(supportToken: string): Promise<{
    user: { email: string; displayName?: string; plan?: { plan?: string } };
    meetings: any[];
    meetingCount: number;
  }> {
    const response = await fetch(`${API_BASE_URL}/support/user`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supportToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get user data' }));
      if ((error as any).error === 'support_expired') {
        throw new Error('support_expired');
      }
      if ((error as any).error === 'support_revoked') {
        throw new Error('support_revoked');
      }
      throw new Error((error as any).error || 'Failed to get user data');
    }

    return response.json();
  }

  // Admin: Get specific meeting via support token (support endpoint)
  async getSupportMeeting(supportToken: string, meetingId: string): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/support/meetings/${meetingId}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supportToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get meeting' }));
      if ((error as any).error === 'support_expired') {
        throw new Error('support_expired');
      }
      if ((error as any).error === 'support_revoked') {
        throw new Error('support_revoked');
      }
      throw new Error((error as any).error || 'Failed to get meeting');
    }

    return response.json();
  }

  // ===== CHAT COUNTER METHODS =====

  /**
   * Get current chat message count for the authenticated user
   * Returns { success: true, chatMessageCount: number }
   */
  async getChatMessageCount(): Promise<{ success: boolean; chatMessageCount: number }> {
    const response = await this.fetchWithAuth('/me');
    if (!response.ok) {
      throw new Error('Failed to get chat message count');
    }
    const data = await response.json();
    const user = data.user || data;
    return {
      success: true,
      chatMessageCount: user.chatMessageCount || 0,
    };
  }

  /**
   * Increment chat message counter
   * Called after each successful chat message
   * @param count - Number to increment by (default 1)
   * @returns { success: true, chatMessageCount: number }
   */
  async incrementChatCounter(count: number = 1): Promise<{ success: boolean; chatMessageCount: number }> {
    const response = await this.fetchWithAuth('/ai/chat-counter/increment', {
      method: 'POST',
      body: JSON.stringify({ count }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to increment chat counter' }));
      // If rate limited or limit exceeded
      if (response.status === 429) {
        throw new Error('chat_limit_exceeded');
      }
      throw new Error((error as any).error || 'Failed to increment chat counter');
    }
    return response.json();
  }

  /**
   * Admin: Reset chat counter for a user
   * @param email - User email to reset
   * @returns { success: true, chatMessageCount: 0, userEmail: string }
   */
  async resetChatCounter(email: string): Promise<{ success: boolean; chatMessageCount: number; userEmail: string }> {
    const response = await this.fetchWithAuth(`/admin/users/${encodeURIComponent(email)}/chat-counter/reset`, {
      method: 'POST',
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to reset chat counter' }));
      throw new Error((error as any).error || 'Failed to reset chat counter');
    }
    return response.json();
  }

  /**
   * Get enterprise company stats (for enterprise members - owners/admins/members)
   * @param companyId - The company ID to fetch stats for
   * @returns Company stats with totals and scoreboard
   */
  async getEnterpriseCompanyStats(companyId: string): Promise<{
    company: any;
    scope: { type: string; memberCount: number };
    viewer: { email: string; preferredName: string; role: string };
    totals: {
      memberCount: number;
      missingMemberCount: number;
      limitedMemberCount: number;
      unlimitedMemberCount: number;
      totalMeetingCount: number;
      totalMeetingLimit: number;
      totalSlotsRemaining: number;
      activeMemberCount: number;
      meetingLimitCoveragePercent: number;
      averageMeetingsPerMember: number;
    };
    scoreboard: Array<{
      email: string;
      preferredName?: string;
      plan: string;
      paymentStatus: string;
      role: string;
      verified: boolean;
      meetingUsage: {
        meetingCount: number;
        meetingLimit: number | null;
        meetingSlotsRemaining: number | null;
        meetingLimitBase: number | null;
        override?: any;
      };
      usagePercent: number | null;
      lastLoginAt?: string;
      lastMeetingAt?: string;
      updatedAt?: string;
      missing?: boolean;
    }>;
  }> {
    const response = await this.fetchWithAuth(`/enterprise/companies/${companyId}/stats`);
    if (!response.ok) {
      throw new Error('Failed to fetch enterprise company stats');
    }
    return response.json();
  }
}

export const apiClient = new ApiClient();
export type { User, AuthResponse, VerifyEmailResponse };
