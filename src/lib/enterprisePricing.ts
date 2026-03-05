export type PricingTier = 'Team' | 'Enterprise' | 'Scale';

export const PRICING_TIERS: Record<PricingTier, { price: number; minUsers: number; maxUsers: number | null }> = {
  Team: { price: 1990, minUsers: 1, maxUsers: 5 },
  Enterprise: { price: 4990, minUsers: 1, maxUsers: 20 },
  Scale: { price: 0, minUsers: 21, maxUsers: null }, // Custom pricing
};

const TIER_RANK: Record<PricingTier, number> = {
  Team: 0,
  Enterprise: 1,
  Scale: 2,
};

export function normalizeTier(value: unknown): PricingTier | null {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  if (!v) return null;
  // Legacy aliases
  if (v === 'entry' || v === 'growth' || v === 'small' || v === 'enterprise_small') return 'Team';
  if (v === 'core' || v === 'standard' || v === 'enterprise_standard') return 'Enterprise';
  if (v === 'scale' || v === 'enterprise_scale') return 'Scale';
  if (v === 'team') return 'Team';
  if (v === 'enterprise') return 'Enterprise';
  return null;
}

export function maxTier(...tiers: Array<PricingTier | null | undefined>): PricingTier {
  const filtered = tiers.filter(Boolean) as PricingTier[];
  if (filtered.length === 0) return 'Team';
  return filtered.reduce((best, t) => (TIER_RANK[t] > TIER_RANK[best] ? t : best), filtered[0]);
}

export function parseEmployeeCountRange(raw: unknown): { min?: number; max?: number } {
  if (!raw) return {};
  const s = String(raw)
    .replace(/\s+/g, ' ')
    .replace(/ca\.?/gi, '')
    .trim();

  // Examples: "200-500", "50 – 100", "100+", "10", "1-10"
  const rangeMatch = s.match(/(\d[\d\s]*)\s*[-–—]\s*(\d[\d\s]*)/);
  if (rangeMatch) {
    const min = Number(rangeMatch[1].replace(/\s/g, ''));
    const max = Number(rangeMatch[2].replace(/\s/g, ''));
    return {
      ...(Number.isFinite(min) ? { min } : {}),
      ...(Number.isFinite(max) ? { max } : {}),
    };
  }

  const plusMatch = s.match(/(\d[\d\s]*)\s*\+/);
  if (plusMatch) {
    const min = Number(plusMatch[1].replace(/\s/g, ''));
    return Number.isFinite(min) ? { min } : {};
  }

  const singleMatch = s.match(/(\d[\d\s]*)/);
  if (singleMatch) {
    const n = Number(singleMatch[1].replace(/\s/g, ''));
    return Number.isFinite(n) ? { min: n, max: n } : {};
  }

  return {};
}

export function tierFromEmployees(employees: { min?: number; max?: number }): PricingTier | null {
  const max = employees.max ?? employees.min;
  if (!max) return null;
  if (max > 20) return 'Scale';
  if (max > 5) return 'Enterprise';
  return 'Team';
}

export function tierFromMemberLimit(memberLimit: number | null | undefined): PricingTier | null {
  if (memberLimit === null || memberLimit === undefined) return null;
  if (memberLimit >= 21) return 'Scale';
  if (memberLimit >= 6) return 'Enterprise';
  if (memberLimit >= 1) return 'Team';
  return null;
}
