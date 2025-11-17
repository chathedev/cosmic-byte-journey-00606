import { apiClient } from './api';

const BACKEND_URL = 'https://api.tivly.se';

export interface UserPlan {
  plan: 'free' | 'pro' | 'plus' | 'unlimited' | 'enterprise';
  meetingsUsed: number;
  meetingsLimit: number | null; // null = unlimited
  protocolsUsed: number;
  protocolsLimit: number;
  renewDate?: string;
  customerId?: string;
  subscriptionId?: string;
  cancelAt?: string; // When subscription will be cancelled
  cancelAtPeriodEnd?: boolean; // Is subscription scheduled to cancel?
  planCancelledAt?: string; // Standardized cancellation date
}

export interface SubscriptionCheckoutParams {
  userId: string;
  planName: 'pro' | 'plus';
  customerEmail?: string;
  successUrl?: string;
  cancelUrl?: string;
}

// Normalize plan response to ensure limits are present
const normalizePlan = (raw: any, meetingCount: number = 0): UserPlan => {
  const planKey = (raw?.plan || raw?.type || 'free') as string;

  const defaults: Record<string, { meetingsLimit: number | null; protocolsLimit: number }> = {
    free: { meetingsLimit: 1, protocolsLimit: 1 },
    pro: { meetingsLimit: 10, protocolsLimit: 1 }, // 10 meetings per month
    plus: { meetingsLimit: null, protocolsLimit: 1 }, // Truly unlimited
    enterprise: { meetingsLimit: null, protocolsLimit: 999999 }, // Enterprise unlimited
  };

  const limits = defaults[planKey] || defaults.free;

  return {
    plan: planKey as UserPlan['plan'],
    meetingsUsed: meetingCount,
    meetingsLimit: Number(raw?.meetingsLimit ?? limits.meetingsLimit) || limits.meetingsLimit,
    protocolsUsed: Number(raw?.protocolsUsed ?? 0) || 0,
    protocolsLimit: Number(raw?.protocolsLimit ?? limits.protocolsLimit) || limits.protocolsLimit,
    renewDate: raw?.renewDate,
    customerId: raw?.customerId,
    subscriptionId: raw?.subscriptionId,
  };
};

export const subscriptionService = {
  // Get user's current plan and usage from backend GET /meetings
  async getUserPlan(userId: string): Promise<UserPlan> {
    try {
      // Check if we have a valid auth token first
      if (!apiClient.isAuthenticated()) {
        console.warn('No auth token - returning default free plan');
        return {
          plan: 'free',
          meetingsUsed: 0,
          meetingsLimit: 1,
          protocolsUsed: 0,
          protocolsLimit: 1,
        };
      }

      // Always read the canonical plan from /me and use /meetings only for usage counts
      const defaultMeetingLimits: Record<string, number | null> = { free: 1, pro: 10, plus: null }; // Pro: 10/month, Plus: unlimited
      const defaultProtocolsLimits: Record<string, number> = { free: 1, pro: 1, plus: 1 };

      let user: any = null;
      let snapshot: any = null;

      try {
        user = await apiClient.getMe();
      } catch (e) {
        console.warn('getMe failed:', e);
        // If getMe fails, don't continue - return default
        throw e;
      }

      // Hard override: this admin user has unlimited forever
      const usedCumulative = Math.max(0, Number((user as any)?.meetingCount ?? 0) || 0);
      if ((user as any)?.email === 'vildewretling@gmail.com') {
        return {
          plan: 'unlimited',
          meetingsUsed: usedCumulative,
          meetingsLimit: null,
          protocolsUsed: Math.max(0, Number(((user as any)?.plan || {}).protocolsUsed ?? 0) || 0),
          protocolsLimit: 999999,
          planCancelledAt: (user as any)?.planCancelledAt,
        };
      }

      // Fetch snapshot to reflect effective limits (e.g., gifts) without changing plan level
      try {
        snapshot = await apiClient.getMeetings();
      } catch (e) {
        console.warn('getMeetings snapshot failed:', e);
      }

      const planRaw: any = (user as any)?.plan || {};
      const planTypeRaw = typeof (user as any)?.plan === 'string' ? (user as any).plan : planRaw.plan;
      const planStr = String(planTypeRaw || '').toLowerCase().trim();

      // Map a few known aliases but otherwise trust backend plan
      const aliasMap: Record<string, UserPlan['plan']> = {
        'gratis': 'free',
        'free plan': 'free',
        'standard': 'pro',
        'obegränsad': 'unlimited',
        'obegränsat': 'unlimited',
        'unlimited': 'unlimited',
      };

      // Detect enterprise membership hints from backend user payload
      const u: any = user;
      const enterpriseDetected = (
        planStr === 'enterprise' ||
        u?.planTier === 'enterprise' ||
        u?.enterprise?.active === true ||
        u?.enterprise?.status === 'active' ||
        !!u?.enterprise?.companyName ||
        (u?.plan?.planTier === 'enterprise') ||
        (u?.company?.planTier === 'enterprise' && (u?.company?.status ?? 'active') === 'active') ||
        (Array.isArray(u?.companies) && u.companies.some((c: any) => c?.planTier === 'enterprise' && (c?.status ?? 'active') === 'active'))
      );

      const validPlans = ['free','pro','plus','unlimited','enterprise'] as const;
      const normalizedPlan: UserPlan['plan'] = enterpriseDetected
        ? 'enterprise'
        : ((validPlans.includes(planStr as any) ? (planStr as any) : (aliasMap[planStr] ?? 'free')) as UserPlan['plan']);

      // Use cumulative count from /me only
      const meetingsUsed = Math.max(0, Number((user as any)?.meetingCount ?? 0) || 0);

      // Limits: gifts can raise numeric limits (from snapshot or user.plan), Plus, unlimited, and enterprise have unlimited meetings
      let meetingsLimit: number | null;
      if (normalizedPlan === 'unlimited' || normalizedPlan === 'plus' || normalizedPlan === 'enterprise') {
        meetingsLimit = null; // Truly unlimited
      } else if (normalizedPlan === 'pro') {
        // Pro has a limit of 10 meetings per month
        const fromSnapshot = Number((snapshot as any)?.meetingLimit);
        const fromUser = Number((planRaw as any)?.meetingsLimit);
        meetingsLimit = Number.isFinite(fromSnapshot) && fromSnapshot > 0
          ? fromSnapshot
          : (Number.isFinite(fromUser) && fromUser > 0 ? fromUser : 10);
      } else {
        const fromSnapshot = Number((snapshot as any)?.meetingLimit);
        const fromUser = Number((planRaw as any)?.meetingsLimit);
        meetingsLimit = Number.isFinite(fromSnapshot) && fromSnapshot > 0
          ? fromSnapshot
          : (Number.isFinite(fromUser) && fromUser > 0 ? fromUser : defaultMeetingLimits[normalizedPlan] ?? 1);
      }

      const protocolsUsed = Math.max(0, Number((planRaw as any)?.protocolsUsed ?? 0) || 0);
      let protocolsLimit: number;
      if (normalizedPlan === 'unlimited' || normalizedPlan === 'enterprise') {
        protocolsLimit = 999999;
      } else {
        const fromUserProt = Number((planRaw as any)?.protocolsLimit);
        protocolsLimit = Number.isFinite(fromUserProt) && fromUserProt > 0
          ? fromUserProt
          : defaultProtocolsLimits[normalizedPlan];
      }

      return {
        plan: normalizedPlan,
        meetingsUsed,
        meetingsLimit,
        protocolsUsed,
        protocolsLimit,
        customerId: (planRaw as any)?.customerId || (user as any)?.stripe?.customerId,
        subscriptionId: (planRaw as any)?.subscriptionId || (user as any)?.stripe?.subscriptionId,
        cancelAt: (user as any)?.stripe?.cancelAt || (planRaw as any)?.cancelAt,
        cancelAtPeriodEnd: (user as any)?.stripe?.cancelAtPeriodEnd || (planRaw as any)?.cancelAtPeriodEnd,
        planCancelledAt: (user as any)?.planCancelledAt, // Extract from root user object
      };
    } catch (error) {
      console.warn('Failed to get user plan:', error);
      return {
        plan: 'free',
        meetingsUsed: 0,
        meetingsLimit: 1,
        protocolsUsed: 0,
        protocolsLimit: 1,
      };
    }
  },

  // Create Stripe embedded checkout session
  async createCheckoutSession(params: SubscriptionCheckoutParams): Promise<{
    sessionId: string;
    clientSecret: string;
    publishableKey: string;
  }> {
    const response = await fetch(`${BACKEND_URL}/create-checkout-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        'X-JWT-Secret': import.meta.env.VITE_JWT_SECRET || '',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to create checkout session' }));
      throw new Error(error.error || 'Failed to create checkout session');
    }

    return response.json();
  },

  // Create subscription intent for custom Elements checkout
  async createSubscriptionIntent(params: {
    plan: 'pro' | 'plus';
  }): Promise<{
    publishableKey: string;
    clientSecret: string;
    subscriptionId: string;
    customerId: string;
    paymentIntentId?: string;
    subscriptionStatus: string;
    message: string;
  }> {
    const response = await fetch(`${BACKEND_URL}/create-subscription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        'X-JWT-Secret': import.meta.env.VITE_JWT_SECRET || '',
      },
      body: JSON.stringify({
        plan: params.plan,
        successUrl: 'https://app.tivly.se/billing/success',
        cancelUrl: 'https://app.tivly.se/billing/cancel',
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to create subscription' }));
      throw new Error(error.error || 'Failed to create subscription');
    }

    return response.json();
  },

  // Cancel subscription (keep access until period end)
  async cancelSubscription(atPeriodEnd: boolean = true): Promise<{
    success: boolean;
    status?: string;
    cancelAtPeriodEnd?: boolean;
    currentPeriodEnd?: string;
  }> {
    const result = await apiClient.cancelSubscription(atPeriodEnd);
    // Refresh user plan after cancellation
    await apiClient.getMe();
    return result;
  },

  // Check if user can create a meeting
  async canCreateMeeting(userId: string): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const user = await apiClient.getMe();
      
      // vildewretling@gmail.com has unlimited access
      if (user.email === 'vildewretling@gmail.com') {
        return { allowed: true };
      }
      
      const plan = await this.getUserPlan(userId);
      
      // Unlimited, enterprise plan or null limit = no restrictions
      if (plan.plan === 'unlimited' || plan.plan === 'enterprise' || plan.meetingsLimit === null) {
        return { allowed: true };
      }
      
      const allowed = plan.meetingsUsed < plan.meetingsLimit;
      return {
        allowed,
        reason: allowed ? undefined : 'Meeting limit reached for your plan'
      };
    } catch (error) {
      return { allowed: false, reason: 'Failed to check meeting limit' };
    }
  },

  // Check if user can generate a protocol
  async canGenerateProtocol(
    userId: string, 
    meetingId: string,
    meetingProtocolCount: number = 0
  ): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const user = await apiClient.getMe();
      
      // vildewretling@gmail.com has unlimited access
      if (user.email === 'vildewretling@gmail.com') {
        return { allowed: true };
      }
      
      const plan = await this.getUserPlan(userId);
      
      // Unlimited or enterprise plan = no protocol limits
      if (plan.plan === 'unlimited' || plan.plan === 'enterprise') {
        return { allowed: true };
      }
      
      // For all other users (free, standard, plus): 1 protocol per meeting
      if (meetingProtocolCount >= 1) {
        return {
          allowed: false,
          reason: `Du har redan genererat ett protokoll för detta möte.`
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error('Error checking protocol generation permission:', error);
      return { allowed: false, reason: 'Kunde inte kontrollera gränser' };
    }
  },

  // Increment meeting count - rely on cumulative count from /me (never list size)
  async incrementMeetingCount(
    userId: string,
    meetingId: string
  ): Promise<{ meetingCount: number; meetingLimit: number | null; meetingSlotsRemaining: number | null }> {
    try {
      // Ask backend to increment user's cumulative meeting count
      const incRes: any = await apiClient.incrementMeetings(1);
      const incUser = incRes?.user || incRes;

      // Fetch fresh user snapshot for authoritative cumulative count and limits
      let me: any = null;
      try {
        me = await apiClient.getMe();
      } catch (e) {
        console.warn('getMe after increment failed, fallback to increment response');
      }

      // Prefer cumulative count from /me, fallback to increment response
      const meetingCount = Number(me?.meetingCount ?? incUser?.meetingCount ?? 0) || 0;

      // Prefer plan limit from /me, fallback to /meetings snapshot (limit only)
      let meetingLimit: number | null = (me?.plan?.meetingsLimit ?? null) as number | null;
      if (meetingLimit === undefined) meetingLimit = null;

      if (meetingLimit === null) {
        try {
          const snapshot = await apiClient.getMeetings();
          meetingLimit = (snapshot?.meetingLimit ?? null) as number | null;
        } catch (e) {
          console.warn('getMeetings for meetingLimit failed');
        }
      }

      const meetingSlotsRemaining = meetingLimit === null ? null : Math.max(0, (meetingLimit as number) - meetingCount);

      console.log('✅ Meeting incremented (cumulative):', { meetingId, meetingCount, meetingLimit });

      return { meetingCount, meetingLimit, meetingSlotsRemaining };
    } catch (error) {
      console.error('❌ Failed to increment meeting count:', error);
      throw error;
    }
  },

  // Increment protocol count
  async incrementProtocolCount(userId: string, meetingId: string): Promise<void> {
    // Protocol count is tracked per meeting, handled by meetingStorage
    // This is a no-op for the subscription service
  },
};
