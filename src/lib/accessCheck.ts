import { User, apiClient } from '@/lib/api';
import { UserPlan } from '@/lib/subscription';

/**
 * Check if user is an admin (has admin role in backend)
 */
export const isUserAdmin = async (user: User | null): Promise<boolean> => {
  if (!user?.email) return false;
  
  try {
    const roleData = await apiClient.getUserRole(user.email.toLowerCase());
    return roleData && (roleData.role === 'admin' || roleData.role === 'owner');
  } catch {
    return false;
  }
};

/**
 * Check if user has unlimited access (admin, standard, unlimited, enterprise)
 * Standard is the new Plus plan with unlimited access
 */
export const hasUnlimitedAccess = (user: User | null, userPlan: UserPlan | null): boolean => {
  if (!user || !userPlan) return false;
  
  // Pro, unlimited, and enterprise get unlimited access
  if (userPlan.plan === 'pro' || userPlan.plan === 'unlimited' || userPlan.plan === 'enterprise') return true;
  
  return false;
};

/**
 * Check if user has Plus-level access (standard, unlimited, enterprise)
 * Standard is the new Plus plan - all features unlocked
 */
export const hasPlusAccess = (user: User | null, userPlan: UserPlan | null): boolean => {
  if (!user) return false;
  
  // Pro, unlimited and enterprise plans all get full access
  if (userPlan?.plan === 'pro' || userPlan?.plan === 'unlimited' || userPlan?.plan === 'enterprise') return true;
  
  return hasUnlimitedAccess(user, userPlan);
};

/**
 * Check if library should be locked
 */
export const isLibraryLocked = (user: User | null, userPlan: UserPlan | null): boolean => {
  if (!user || !userPlan) return true;
  
  // Never lock when unlimited access present
  if (hasUnlimitedAccess(user, userPlan)) return false;
  
  // Lock only for free users
  return userPlan.plan === 'free';
};
