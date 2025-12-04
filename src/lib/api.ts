import { getUserIP } from '@/utils/ipDetection';
 
const API_BASE_URL = 'https://api.tivly.se';

interface User {
  id: string;
  uid: string; // Alias for id to maintain compatibility
  email: string;
  displayName?: string;
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
    if (response.status === 401 && !suppressAuthRedirect && !(token && token.startsWith('test_unlimited_user_'))) {
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
    // Handle test user - return immediately without backend call
    const token = this.getToken();
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
      
      return {
        isMember: true,
        company: data.company,
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
    dataAccessMode?: 'shared' | 'individual';
    adminFullAccessEnabled?: boolean;
    preferences?: {
      meetingCreatorVisibility?: 'shared_only' | 'always' | 'hidden';
      storageRegion?: 'eu' | 'us' | 'auto';
      dataRetentionDays?: number;
      allowAdminFolderLock?: boolean;
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
    dataAccessMode?: 'shared' | 'individual';
    adminFullAccessEnabled?: boolean;
    preferences?: {
      meetingCreatorVisibility?: 'shared_only' | 'always' | 'hidden';
      storageRegion?: 'eu' | 'us' | 'auto';
      dataRetentionDays?: number;
      allowAdminFolderLock?: boolean;
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
  }): Promise<any> {
    const response = await this.fetchWithAuth(`/admin/enterprise/companies/${companyId}/members`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to add company member');
    return response.json();
  }

  async updateEnterpriseCompanyMember(companyId: string, memberEmail: string, data: {
    role?: string;
    status?: string;
    title?: string;
    notes?: string;
  }): Promise<any> {
    const response = await this.fetchWithAuth(
      `/admin/enterprise/companies/${companyId}/members/${encodeURIComponent(memberEmail)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      }
    );
    if (!response.ok) throw new Error('Failed to update company member');
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
}

export const apiClient = new ApiClient();
export type { User, AuthResponse, VerifyEmailResponse };
