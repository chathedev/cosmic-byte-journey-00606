import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/api';
import { useSubscription } from '@/contexts/SubscriptionContext';

// Chat limits per plan (per month)
const CHAT_LIMITS: Record<string, number | null> = {
  free: 0,       // No chat access for free
  pro: 100,      // 100 messages/month for pro
  enterprise: 500, // 500 messages/month for enterprise
  unlimited: null, // No limit
};

interface ChatLimitState {
  chatMessageCount: number;
  chatMessageLimit: number | null;
  isLoading: boolean;
  error: string | null;
}

export function useChatLimit() {
  const { userPlan, isAdmin } = useSubscription();
  const [state, setState] = useState<ChatLimitState>({
    chatMessageCount: 0,
    chatMessageLimit: null,
    isLoading: false,
    error: null,
  });

  // Get limit based on plan
  const getChatLimit = useCallback(() => {
    if (isAdmin) return null; // Admins have unlimited
    
    const plan = userPlan?.plan?.toLowerCase() || 'free';
    
    // Check for unlimited plans
    if (plan === 'unlimited' || plan === 'enterprise') {
      return CHAT_LIMITS.enterprise; // Enterprise still has high limit
    }
    
    return CHAT_LIMITS[plan] ?? CHAT_LIMITS.free;
  }, [userPlan, isAdmin]);

  // Fetch current chat count from backend
  const fetchChatCount = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const data = await apiClient.getChatMessageCount();
      const limit = getChatLimit();
      
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
  }, [getChatLimit]);

  // Check if user can send a message
  const canSendMessage = useCallback(() => {
    const limit = getChatLimit();
    
    // No limit = always can send
    if (limit === null) return true;
    
    // Check against current count
    return state.chatMessageCount < limit;
  }, [state.chatMessageCount, getChatLimit]);

  // Get remaining messages
  const getRemainingMessages = useCallback(() => {
    const limit = getChatLimit();
    
    if (limit === null) return null; // Unlimited
    
    return Math.max(0, limit - state.chatMessageCount);
  }, [state.chatMessageCount, getChatLimit]);

  // Increment chat counter (called after successful chat)
  const incrementCounter = useCallback(async (count: number = 1) => {
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

  return {
    ...state,
    chatLimit: getChatLimit(),
    canSendMessage,
    getRemainingMessages,
    incrementCounter,
    fetchChatCount,
    isOverLimit: !canSendMessage(),
  };
}
