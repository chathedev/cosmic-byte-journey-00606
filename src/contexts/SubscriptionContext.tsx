import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { subscriptionService, UserPlan } from '@/lib/subscription';
import { meetingStorage } from '@/utils/meetingStorage';
import { apiClient } from '@/lib/api';

interface SubscriptionContextType {
  userPlan: UserPlan | null;
  isLoading: boolean;
  requiresPayment: boolean;
  refreshPlan: () => Promise<void>;
  canCreateMeeting: () => Promise<{ allowed: boolean; reason?: string }>;
  canGenerateProtocol: (meetingId: string, protocolCount: number) => Promise<{ allowed: boolean; reason?: string }>;
  incrementMeetingCount: (meetingId: string) => Promise<void>;
  incrementProtocolCount: (meetingId: string) => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [userPlan, setUserPlan] = useState<UserPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [requiresPayment, setRequiresPayment] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const loadPlan = useCallback(async (opts?: { background?: boolean }) => {
    const background = !!opts?.background;
    if (!user) {
      setUserPlan(null);
      setRequiresPayment(false);
      if (!background) setIsLoading(false);
      return;
    }

    try {
      if (!background) setIsLoading(true);
      
      // Check payment status
      const exemptedEmails = ['roynewr@gmail.com', 'magisktboendevidhavet@gmail.com'];
      const paymentStatus = (user as any).paymentStatus || (typeof user.plan === 'object' ? (user.plan as any)?.paymentStatus : null);
      
      // Show payment required popup if status is requires_payment_method and not exempted
      if (paymentStatus === 'requires_payment_method' && !exemptedEmails.includes(user.email || '')) {
        setRequiresPayment(true);
      } else if (paymentStatus === 'paid') {
        setRequiresPayment(false);
      }
      
      // Determine admin role from backend
      let admin = false;
      try {
        const roleData = await apiClient.getUserRole((user.email || '').toLowerCase());
        admin = !!roleData && (roleData.role === 'admin' || roleData.role === 'owner');
      } catch {}
      setIsAdmin(admin);
      
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
      };
      
      console.log('📊 Plan loaded from backend user object:', plan);
      
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
          const latest = await subscriptionService.getUserPlan(user.uid);
          const latestPlan: UserPlan = isAdmin 
            ? { ...latest, plan: 'unlimited' as const, meetingsLimit: null, protocolsLimit: 999999 } 
            : latest;
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
        console.warn('Plan background refresh failed, using user payload plan.', e);
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

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

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
      // First check if meeting is already counted using backend state
      const wasCounted = await meetingStorage.markCountedIfNeeded(meetingId);
      
      if (!wasCounted) {
        console.log('⏭️ Meeting already counted, skipping increment:', meetingId);
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
    <SubscriptionContext.Provider value={{ userPlan, isLoading, requiresPayment, refreshPlan, canCreateMeeting, canGenerateProtocol, incrementMeetingCount, incrementProtocolCount }}>
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