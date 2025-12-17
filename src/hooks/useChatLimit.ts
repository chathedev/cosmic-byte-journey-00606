import { useState, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api';
import { useSubscription } from '@/contexts/SubscriptionContext';

// Monthly chat limits per plan
const MONTHLY_LIMITS: Record<string, number | null> = {
  free: 0,
  pro: 100,
  enterprise: 500,
  unlimited: null,
};

// Hidden rate limits (per hour/day) - applies to all plans
const HOURLY_LIMIT = 20;
const DAILY_LIMIT = 50;

interface ChatLimitState {
  chatMessageCount: number;
  chatMessageLimit: number | null;
  isLoading: boolean;
  error: string | null;
}

interface RateLimitTracker {
  hourly: { count: number; resetTime: number };
  daily: { count: number; resetTime: number };
}

export function useChatLimit() {
  const { userPlan, isAdmin } = useSubscription();
  const [state, setState] = useState<ChatLimitState>({
    chatMessageCount: 0,
    chatMessageLimit: null,
    isLoading: false,
    error: null,
  });
  
  // Hidden rate limit tracking (client-side, resets on page refresh intentionally)
  const rateLimitRef = useRef<RateLimitTracker>({
    hourly: { count: 0, resetTime: Date.now() + 60 * 60 * 1000 },
    daily: { count: 0, resetTime: Date.now() + 24 * 60 * 60 * 1000 },
  });

  // Get monthly limit based on plan
  const getMonthlyLimit = useCallback(() => {
    if (isAdmin) return null; // Admins have unlimited
    
    const plan = userPlan?.plan?.toLowerCase() || 'free';
    
    if (plan === 'unlimited') return null;
    if (plan === 'enterprise') return MONTHLY_LIMITS.enterprise;
    
    return MONTHLY_LIMITS[plan] ?? MONTHLY_LIMITS.free;
  }, [userPlan, isAdmin]);

  // Check and update rate limits
  const checkRateLimits = useCallback((): { allowed: boolean; reason?: string } => {
    if (isAdmin) return { allowed: true };
    
    const now = Date.now();
    const tracker = rateLimitRef.current;
    
    // Reset hourly counter if time passed
    if (now >= tracker.hourly.resetTime) {
      tracker.hourly = { count: 0, resetTime: now + 60 * 60 * 1000 };
    }
    
    // Reset daily counter if time passed
    if (now >= tracker.daily.resetTime) {
      tracker.daily = { count: 0, resetTime: now + 24 * 60 * 60 * 1000 };
    }
    
    // Check hourly limit
    if (tracker.hourly.count >= HOURLY_LIMIT) {
      return { allowed: false, reason: 'hourly' };
    }
    
    // Check daily limit
    if (tracker.daily.count >= DAILY_LIMIT) {
      return { allowed: false, reason: 'daily' };
    }
    
    return { allowed: true };
  }, [isAdmin]);

  // Fetch current chat count from backend
  const fetchChatCount = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const data = await apiClient.getChatMessageCount();
      const limit = getMonthlyLimit();
      
      setState({
        chatMessageCount: data.chatMessageCount || 0,
        chatMessageLimit: limit,
        isLoading: false,
        error: null,
      });
      
      return data.chatMessageCount || 0;
    } catch (error) {
      console.error('Failed to fetch chat count:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to fetch chat count',
      }));
      return 0;
    }
  }, [getMonthlyLimit]);

  // Check if user can send a message (monthly + rate limits)
  const canSendMessage = useCallback((): { allowed: boolean; reason?: string } => {
    // Check rate limits first
    const rateCheck = checkRateLimits();
    if (!rateCheck.allowed) {
      return rateCheck;
    }
    
    // Check monthly limit
    const monthlyLimit = getMonthlyLimit();
    if (monthlyLimit === null) return { allowed: true };
    if (state.chatMessageCount >= monthlyLimit) {
      return { allowed: false, reason: 'monthly' };
    }
    
    return { allowed: true };
  }, [state.chatMessageCount, getMonthlyLimit, checkRateLimits]);

  // Get remaining messages (monthly only - rate limits are hidden)
  const getRemainingMessages = useCallback(() => {
    const limit = getMonthlyLimit();
    if (limit === null) return null;
    return Math.max(0, limit - state.chatMessageCount);
  }, [state.chatMessageCount, getMonthlyLimit]);

  // Increment chat counter (called after successful chat)
  const incrementCounter = useCallback(async (count: number = 1) => {
    // Update rate limit counters
    const tracker = rateLimitRef.current;
    tracker.hourly.count += count;
    tracker.daily.count += count;
    
    try {
      const data = await apiClient.incrementChatCounter(count);
      
      setState(prev => ({
        ...prev,
        chatMessageCount: data.chatMessageCount || prev.chatMessageCount + count,
      }));
      
      return data.chatMessageCount;
    } catch (error) {
      console.error('Failed to increment chat counter:', error);
      // Optimistically increment locally even if API fails
      setState(prev => ({
        ...prev,
        chatMessageCount: prev.chatMessageCount + count,
      }));
      return state.chatMessageCount + count;
    }
  }, [state.chatMessageCount]);

  const canSendResult = canSendMessage();

  return {
    ...state,
    chatLimit: getMonthlyLimit(),
    canSendMessage: () => canSendResult.allowed,
    canSendMessageResult: canSendResult,
    getRemainingMessages,
    incrementCounter,
    fetchChatCount,
    isOverLimit: !canSendResult.allowed,
  };
}
