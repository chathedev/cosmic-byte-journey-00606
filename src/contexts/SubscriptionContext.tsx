import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { subscriptionService, UserPlan } from '@/lib/subscription';
import { meetingStorage } from '@/utils/meetingStorage';
import { apiClient } from '@/lib/api';
import { setDebugAdminStatus } from '@/lib/debugLogger';

// Payment routing is PURELY domain-based:
// - io.tivly.se = Apple IAP via RevenueCat
// - app.tivly.se = Stripe checkout

export interface EnterpriseBillingRecord {
  id: string;
  status: string; // 'paid' | 'open' | 'draft' | 'void' | 'uncollectible'
  billingType: string; // 'monthly' | 'yearly' | 'one_time'
  subscriptionId?: string;
  subscriptionStatus?: string; // 'active' | 'canceled' | 'past_due' | 'trialing'
  cancelAtPeriodEnd?: boolean;
  cancelAt?: string | null;
  currentPeriodEnd?: string;
  amountDue?: number;
  invoiceUrl?: string;
}

export interface EnterpriseMembership {
  isMember: boolean;
  company?: {
    id: string;
    name: string;
    slug: string;
    status: string;
    planTier: string;
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
      status: 'active' | 'unpaid' | 'canceled' | 'none';
      latestInvoice?: EnterpriseBillingRecord;
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
  sisSample?: {
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
  };
}

// Domain-based payment detection
export type PaymentDomain = 'ios' | 'web' | 'unknown';

export const getPaymentDomain = (): PaymentDomain => {
  if (typeof window === 'undefined') return 'unknown';
  const hostname = window.location.hostname;
  if (hostname === 'io.tivly.se') return 'ios';
  if (hostname === 'app.tivly.se') return 'web';
  // Development/preview environments default to web behavior
  return 'web';
};

interface SubscriptionContextType {
  userPlan: UserPlan | null;
  isLoading: boolean;
  requiresPayment: boolean;
  paymentDomain: PaymentDomain;
  enterpriseMembership: EnterpriseMembership | null;
  isAdmin: boolean;
  refreshPlan: () => Promise<void>;
  refreshEnterpriseMembership: () => Promise<void>;
  canCreateMeeting: () => Promise<{ allowed: boolean; reason?: string }>;
  canGenerateProtocol: (meetingId: string, protocolCount: number) => Promise<{ allowed: boolean; reason?: string }>;
  incrementMeetingCount: (meetingId: string) => Promise<void>;
  incrementProtocolCount: (meetingId: string) => Promise<void>;
}

export const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [userPlan, setUserPlan] = useState<UserPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Start as loading to prevent flash
  const [requiresPayment, setRequiresPayment] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [enterpriseMembership, setEnterpriseMembership] = useState<EnterpriseMembership | null>(null);
  
  // PURE DOMAIN-BASED payment routing - no Capacitor detection
  const paymentDomain = useMemo(() => getPaymentDomain(), []);

  // Log payment domain (in useEffect to avoid render-phase warnings)
  useEffect(() => {
    console.log('[SubscriptionContext] 💳 Payment domain:', paymentDomain, '| hostname:', typeof window !== 'undefined' ? window.location.hostname : 'N/A');
  }, [paymentDomain]);
  
  const loadPlan = useCallback(async (opts?: { background?: boolean }) => {
    const background = !!opts?.background;
    if (!user) {
      setUserPlan(null);
      setRequiresPayment(false);
      setIsLoading(false); // Set to false when no user
      return;
    }

    try {
      // Set loading state immediately
      if (!background) setIsLoading(true);
      
      // iOS app (io.tivly.se) subscription purchases are handled via RevenueCat
      // Backend is the single source of truth for subscription status
      if (paymentDomain === 'ios') {
        console.log('🍎 [SubscriptionContext] iOS domain detected - using backend for subscription status');
      }
      
      // Check payment status
      const exemptedEmails = ['roynewr@gmail.com', 'magisktboendevidhavet@gmail.com'];
      const paymentStatus = (user as any).paymentStatus || (typeof user.plan === 'object' ? (user.plan as any)?.paymentStatus : null);
      
      // Show payment required popup if status is requires_payment_method and not exempted
      if (paymentStatus === 'requires_payment_method' && !exemptedEmails.includes(user.email || '')) {
        setRequiresPayment(true);
      } else if (paymentStatus === 'paid') {
        setRequiresPayment(false);
      }
      
      // Determine admin role from backend - STRICT CHECK
      let admin = false;
      const platform = window.location.hostname.includes('io.tivly.se') ? 'IOS' : 'WEB';
      console.log(`[SubscriptionContext] 🔐 Checking admin role for ${user.email} on ${platform}`);
      
      try {
        const roleData = await apiClient.getUserRole((user.email || '').toLowerCase());
        admin = !!roleData && (roleData.role === 'admin' || roleData.role === 'owner');
        console.log(`[SubscriptionContext] ✅ Admin check result for ${user.email}:`, admin, roleData);
      } catch (error) {
        console.log(`[SubscriptionContext] ❌ Admin check failed (defaulting to false):`, error);
        admin = false;
      }
      setIsAdmin(admin);
      setDebugAdminStatus(admin); // Enable debug logs for admins
      
      // TRUST THE BACKEND - use the plan data directly from the user object
      const backendPlanType = typeof user.plan === 'string' ? user.plan : user.plan?.plan;
      const backendMeetingCount = user.meetingCount || 0;
      
      // Validate and normalize plan type (support common aliases)
      const validPlans = ['free', 'pro', 'plus', 'unlimited', 'enterprise'] as const;
      const aliasMap: Record<string, UserPlan['plan']> = {
        'gratis': 'free',
        'free plan': 'free',
        'standard': 'pro',
        'obegränsad': 'unlimited',
        'obegränsat': 'unlimited',
      };
      const planStr = String(backendPlanType || '').toLowerCase().trim();
      
      // Detect enterprise membership from user payload hints
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

      const normalizedPlan: UserPlan['plan'] = admin
        ? 'unlimited'
        : (enterpriseDetected
            ? 'enterprise'
            : ((validPlans as readonly string[]).includes(planStr)
                ? (planStr as UserPlan['plan'])
                : (aliasMap[planStr] ?? 'free')));
      
      console.log(`[SubscriptionContext] 📋 Plan normalization:`, {
        platform,
        email: user.email,
        isAdmin: admin,
        backendPlanType,
        planStr,
        enterpriseDetected,
        normalizedPlan
      });
      // For unlimited and enterprise plans, set no limits
      const isUnlimited = normalizedPlan === 'unlimited' || normalizedPlan === 'enterprise';

      // Default limits per plan
      const defaultMeetingLimits: Record<UserPlan['plan'], number> = { free: 1, pro: 10, plus: 30, unlimited: 0, enterprise: 0 };
      const defaultProtocolsLimits: Record<UserPlan['plan'], number> = { free: 1, pro: 1, plus: 5, unlimited: 999999, enterprise: 999999 };

      // Determine limits: trust backend plan; gifts can raise numeric limits but don't change plan
      const used = backendMeetingCount;
      
      // Calculate effective meeting limit with overrides (gifted meetings)
      let meetingLimit: number | null;
      if (isUnlimited) {
        meetingLimit = null;
      } else {
        // Check for adminMeetingOverride (gifted meetings)
        const override = (user as any)?.adminMeetingOverride;
        
        if (override && override.type) {
          if (override.type === 'unlimited') {
            meetingLimit = null;
          } else if (override.type === 'extra') {
            // Base limit + extra gifted meetings
            const userPlanObj = typeof user.plan === 'object' ? user.plan : null;
            const baseLimit = Number.isFinite(Number(userPlanObj?.meetingsLimit)) && Number(userPlanObj?.meetingsLimit) > 0
              ? Number(userPlanObj.meetingsLimit)
              : defaultMeetingLimits[normalizedPlan];
            const extraMeetings = Number(override.extraMeetings) || 0;
            meetingLimit = baseLimit + extraMeetings;
          } else {
            const userPlanObj = typeof user.plan === 'object' ? user.plan : null;
            meetingLimit = Number.isFinite(Number(userPlanObj?.meetingsLimit)) && Number(userPlanObj?.meetingsLimit) > 0
              ? Number(userPlanObj.meetingsLimit)
              : defaultMeetingLimits[normalizedPlan];
          }
        } else {
          const userPlanObj = typeof user.plan === 'object' ? user.plan : null;
          meetingLimit = Number.isFinite(Number(userPlanObj?.meetingsLimit)) && Number(userPlanObj?.meetingsLimit) > 0
            ? Number(userPlanObj.meetingsLimit)
            : defaultMeetingLimits[normalizedPlan];
        }
      }

      const protocolsUsed = typeof user.plan === 'object' ? Number(user.plan?.protocolsUsed ?? 0) || 0 : 0;
      const protocolsLimit = isUnlimited
        ? 999999
        : (typeof user.plan === 'object' && Number.isFinite(Number(user.plan?.protocolsLimit)) && Number(user.plan?.protocolsLimit) > 0
            ? Number(user.plan?.protocolsLimit)
            : defaultProtocolsLimits[normalizedPlan]);

      let plan: UserPlan = {
        plan: normalizedPlan,
        meetingsUsed: used,
        meetingsLimit: meetingLimit,
        protocolsUsed: protocolsUsed,
        protocolsLimit: protocolsLimit,
        renewDate: typeof user.plan === 'object' ? user.plan?.renewsAt || user.plan?.renewDate : undefined,
        customerId: typeof user.plan === 'object' ? user.plan?.customerId : undefined,
        subscriptionId: typeof user.plan === 'object' ? user.plan?.subscriptionId : undefined,
        cancelAt: (user as any)?.stripe?.cancelAt || (user as any)?.plan?.cancelAt,
        cancelAtPeriodEnd: (user as any)?.stripe?.cancelAtPeriodEnd || (user as any)?.plan?.cancelAtPeriodEnd,
        planCancelledAt: (user as any)?.planCancelledAt || (user as any)?.plan?.planCancelledAt,
      };
      
      console.log(`[SubscriptionContext] 📊 [${platform}] Final plan for ${user.email}:`, {
        plan: plan.plan,
        isAdmin: admin,
        meetingsUsed: plan.meetingsUsed,
        meetingsLimit: plan.meetingsLimit,
        protocolsLimit: plan.protocolsLimit
      });
      
      // Only update if plan data actually changed to prevent unnecessary re-renders
      setUserPlan(prevPlan => {
        if (JSON.stringify(prevPlan) === JSON.stringify(plan)) {
          return prevPlan;
        }
        return plan;
      });

      // Background verify with backend plan to avoid stale or 'test' flags
      try {
        if (user) {
          console.log(`[SubscriptionContext] 🔄 Background plan refresh for ${user.email} (admin=${admin})`);
          const latest = await subscriptionService.getUserPlan(user.uid);
          console.log(`[SubscriptionContext] 📥 Backend returned plan:`, latest);
          
          const latestPlan: UserPlan = admin 
            ? { ...latest, plan: 'unlimited' as const, meetingsLimit: null, protocolsLimit: 999999 } 
            : latest;
          
          console.log(`[SubscriptionContext] 🎯 Final background plan (admin=${admin}):`, latestPlan);
          
          const rank: Record<UserPlan['plan'], number> = { free: 0, pro: 1, plus: 2, unlimited: 3, enterprise: 4 };
          setUserPlan(prev => {
            if (!prev) return latestPlan;
            if (JSON.stringify(prev) === JSON.stringify(latestPlan)) return prev;
            return rank[latestPlan.plan] >= rank[prev.plan]
              ? latestPlan
              : { ...prev, ...latestPlan, plan: prev.plan };
          });
        }
      } catch (e) {
        console.warn('[SubscriptionContext] ⚠️ Plan background refresh failed, using user payload plan.', e);
      }
    } catch (error) {
      console.error('❌ Failed to load subscription plan:', error);
      // Fallback to free plan on error
      const freePlan: UserPlan = {
        plan: 'free',
        meetingsUsed: 0,
        meetingsLimit: 1,
        protocolsUsed: 0,
        protocolsLimit: 1,
      };
      setUserPlan(prev => JSON.stringify(prev) === JSON.stringify(freePlan) ? prev : freePlan);
    } finally {
      if (!background) setIsLoading(false);
    }
  }, [user]);

  // Load enterprise membership
  const loadEnterpriseMembership = useCallback(async () => {
    if (!user) {
      setEnterpriseMembership(null);
      return;
    }
    
    console.log('[SubscriptionContext] 🏢 Loading enterprise membership for:', user.email);
    
    // Admins keep their admin powers but get enterprise features from real companies
    // No virtual company - admins should be added to real enterprise companies
    
    try {
      const membership = await apiClient.getMyEnterpriseMembership();
      console.log('[SubscriptionContext] 🏢 Enterprise API response:', membership);
      
      if (membership?.isMember) {
        // Extract SIS enabled flag from backend response
        const sisEnabled = membership.company?.speakerIdentificationEnabled ?? 
                          (membership as any)?.company?.preferences?.speakerIdentificationEnabled ??
                          true; // Default to true per docs
        
        // Fetch SIS sample status only if SIS is enabled
        let sisSample: EnterpriseMembership['sisSample'] = undefined;
        
        if (sisEnabled) {
          try {
            const sisStatus = await apiClient.getSISSampleStatus();
            console.log('[SubscriptionContext] 🎤 SIS sample status:', sisStatus);
            
            // Handle disabled state from backend
            if (sisStatus?.disabled || sisStatus?.sisSample?.status === 'disabled') {
              sisSample = { status: 'disabled' };
            } else {
              sisSample = sisStatus?.sisSample || undefined;
            }
          } catch (sisError) {
            console.log('[SubscriptionContext] 🎤 SIS sample check failed:', sisError);
          }
        } else {
          // SIS is disabled at company level
          sisSample = { status: 'disabled' };
        }
        
        setEnterpriseMembership({
          ...membership,
          company: {
            ...membership.company,
            speakerIdentificationEnabled: sisEnabled,
          },
          sisSample,
        });
        return;
      }
      
      // Fallback: check user object for enterprise data
      const u: any = user;
      if (u?.enterprise?.companyName || u?.company?.name) {
        console.log('[SubscriptionContext] 🏢 Using fallback enterprise data from user object');
        const sisEnabled = u?.enterprise?.speakerIdentificationEnabled || 
                          u?.company?.speakerIdentificationEnabled || 
                          u?.company?.preferences?.speakerIdentificationEnabled;
        
        let sisSample = undefined;
        if (sisEnabled) {
          try {
            const sisStatus = await apiClient.getSISSampleStatus();
            sisSample = sisStatus?.sisSample || undefined;
          } catch {}
        }
        
        setEnterpriseMembership({
          isMember: true,
          company: {
            id: u.enterprise?.companyId || u.company?.id || '',
            name: u.enterprise?.companyName || u.company?.name || 'Enterprise',
            slug: u.enterprise?.companySlug || u.company?.slug || '',
            status: 'active',
            planTier: 'enterprise',
            speakerIdentificationEnabled: sisEnabled,
          },
          membership: {
            role: u.enterprise?.role || u.companyRole || 'member',
            status: 'active',
            title: u.enterprise?.title || u.jobTitle,
            joinedAt: u.enterprise?.joinedAt || u.createdAt,
          },
          sisSample,
        });
        return;
      }
      
      setEnterpriseMembership({ isMember: false });
    } catch (error) {
      console.log('[SubscriptionContext] 🏢 Enterprise membership check failed:', error);
      
      // Fallback: check user object even on API failure
      const u: any = user;
      if (u?.enterprise?.companyName || u?.company?.name) {
        setEnterpriseMembership({
          isMember: true,
          company: {
            id: u.enterprise?.companyId || u.company?.id || '',
            name: u.enterprise?.companyName || u.company?.name || 'Enterprise',
            slug: u.enterprise?.companySlug || u.company?.slug || '',
            status: 'active',
            planTier: 'enterprise',
            speakerIdentificationEnabled: u?.enterprise?.speakerIdentificationEnabled || u?.company?.speakerIdentificationEnabled,
          },
          membership: {
            role: u.enterprise?.role || u.companyRole || 'member',
            status: 'active',
          },
        });
      } else {
        setEnterpriseMembership({ isMember: false });
      }
    }
  }, [user]);

  useEffect(() => {
    loadPlan();
    loadEnterpriseMembership();
  }, [loadPlan, loadEnterpriseMembership]);

  const refreshPlan = useCallback(async () => {
    if (!user) {
      setUserPlan(null);
      return;
    }
    try {
      // Check admin status first
      let admin = false;
      try {
        const roleData = await apiClient.getUserRole((user.email || '').toLowerCase());
        admin = !!roleData && (roleData.role === 'admin' || roleData.role === 'owner');
      } catch {}
      setIsAdmin(admin);
      setDebugAdminStatus(admin); // Enable debug logs for admins
      
      // Force a backend fetch to get the latest counters
      let plan = await subscriptionService.getUserPlan(user.uid);
      
      // Override to unlimited for admins
      if (admin) {
        plan = { ...plan, plan: 'unlimited' as const, meetingsLimit: null, protocolsLimit: 999999 };
      }
      
      setUserPlan(prev => {
        if (!prev) return plan;
        if (JSON.stringify(prev) === JSON.stringify(plan)) return prev;
        const rank: Record<UserPlan['plan'], number> = { free: 0, pro: 1, plus: 2, unlimited: 3, enterprise: 4 };
        return rank[plan.plan] >= rank[prev.plan]
          ? plan
          : { ...prev, ...plan, plan: prev.plan };
      });
    } catch (error) {
      console.error('❌ Failed to refresh plan from backend:', error);
    }
  }, [user]);

  const canCreateMeeting = async () => {
    if (!user) return { allowed: false, reason: 'Du måste vara inloggad' };
    
    // Admins always allowed
    if (isAdmin) return { allowed: true };
    
    // Get plan - handle both nested (user.plan.plan) and direct (user.plan) structures
    const planType = typeof user.plan === 'string' ? user.plan : user.plan?.plan;
    
    // Block test users from creating meetings
    if (planType === 'test') {
      return { allowed: false, reason: 'Test-läge: Du kan bara navigera i appen, inte skapa möten' };
    }
    
    // Unlimited plan = no limits
    if (planType === 'unlimited') {
      return { allowed: true };
    }
    
    return subscriptionService.canCreateMeeting(user.uid);
  };

  const canGenerateProtocol = async (meetingId: string, protocolCount: number = 0) => {
    if (!user) return { allowed: false, reason: 'Du måste vara inloggad' };
    
    // Admins always allowed
    if (isAdmin) return { allowed: true };
    
    // Get plan - handle both nested (user.plan.plan) and direct (user.plan) structures
    const planType = typeof user.plan === 'string' ? user.plan : user.plan?.plan;
    
    // Block test users from generating protocols
    if (planType === 'test') {
      return { allowed: false, reason: 'Test-läge: Du kan bara navigera i appen, inte generera protokoll' };
    }
    
    // Unlimited plan = no limits
    if (planType === 'unlimited') {
      return { allowed: true };
    }
    
    return subscriptionService.canGenerateProtocol(user.uid, meetingId, protocolCount);
  };

  const incrementMeetingCount = async (meetingId: string) => {
    if (!user) {
      console.error('❌ No user - cannot increment meeting');
      return;
    }

    try {
      console.log('🔍 incrementMeetingCount called for:', meetingId);
      
      // First check if meeting is already counted using backend state + local cache
      const wasCounted = await meetingStorage.markCountedIfNeeded(meetingId);
      
      if (!wasCounted) {
        console.log('⏭️ Meeting already counted (continued or duplicate call), skipping increment:', meetingId);
        // Still refresh to ensure UI is in sync with backend
        await refreshPlan();
        return;
      }
      
      console.log('📊 Meeting NOT yet counted, proceeding with increment:', meetingId);
      
      // Mark meeting as completed in backend
      await meetingStorage.markCompleted(meetingId);
      
      // Increment count in backend (only called if wasCounted === true)
      const result = await subscriptionService.incrementMeetingCount(user.uid, meetingId);
      
      console.log('✅ Meeting count incremented successfully:', result);
      
      // Update UI optimistically with backend response
      setUserPlan(prev => prev ? {
        ...prev,
        meetingsUsed: result.meetingCount,
        meetingsLimit: result.meetingLimit,
      } : prev);
      
      // Refresh to ensure we have latest data
      await refreshPlan();
    } catch (error) {
      console.error('❌ Failed to increment meeting count:', error);
      // Refresh plan to get accurate state from backend
      await refreshPlan();
      throw error;
    }
  };

  const incrementProtocolCount = async (meetingId: string) => {
    if (!user) return;
    
    // Skip increment for admins
    if (isAdmin) {
      console.log('⏭️ Admin mode: skipping protocol count increment');
      return;
    }
    
    // Get plan - handle both nested (user.plan.plan) and direct (user.plan) structures
    const planType = typeof user.plan === 'string' ? user.plan : user.plan?.plan;
    
    // Skip increment for test users and unlimited users
    if (planType === 'test' || planType === 'unlimited') {
      console.log('⏭️ Test/Unlimited mode: skipping protocol count increment');
      return;
    }
    
    try {
      await subscriptionService.incrementProtocolCount(user.uid, meetingId);
      await refreshPlan();
    } catch (error) {
      console.warn('Failed to increment protocol count:', error);
      // Still refresh plan
      await refreshPlan();
    }
  };

  return (
    <SubscriptionContext.Provider value={{ userPlan, isLoading, requiresPayment, paymentDomain, enterpriseMembership, isAdmin, refreshPlan, refreshEnterpriseMembership: loadEnterpriseMembership, canCreateMeeting, canGenerateProtocol, incrementMeetingCount, incrementProtocolCount }}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within SubscriptionProvider');
  }
  return context;
};