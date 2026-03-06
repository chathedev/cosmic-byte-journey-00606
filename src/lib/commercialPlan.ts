export type CommercialPlan = 'free' | 'pro' | 'team' | 'enterprise' | 'unlimited' | 'unknown';

const TEAM_VALUES = new Set(['team', 'enterprise_small']);
const ENTERPRISE_VALUES = new Set(['enterprise', 'enterprise_standard', 'enterprise_scale']);
const PRO_VALUES = new Set(['pro', 'standard', 'plus', 'max']);

export const normalizeCommercialPlan = (value?: string | null): CommercialPlan => {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return 'unknown';

  if (TEAM_VALUES.has(v)) return 'team';
  if (ENTERPRISE_VALUES.has(v)) return 'enterprise';
  if (PRO_VALUES.has(v)) return 'pro';
  if (v === 'free') return 'free';
  if (v === 'unlimited') return 'unlimited';

  return 'unknown';
};

export const getCommercialPlan = (...values: Array<string | null | undefined>): CommercialPlan => {
  for (const value of values) {
    const normalized = normalizeCommercialPlan(value);
    if (normalized !== 'unknown') return normalized;
  }
  return 'unknown';
};

export const getCommercialPlanLabel = (
  ...values: Array<string | null | undefined>
): string => {
  const plan = getCommercialPlan(...values);
  if (plan === 'team') return 'Team';
  if (plan === 'enterprise') return 'Enterprise';
  if (plan === 'pro') return 'Pro';
  if (plan === 'free') return 'Gratis';
  if (plan === 'unlimited') return 'Unlimited';
  return 'Team';
};
