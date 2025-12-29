export type PricingTier = 'Entry' | 'Growth' | 'Core' | 'Scale';

export const PRICING_TIERS: Record<PricingTier, { price: number; minUsers: number; maxUsers: number | null }> = {
  Entry: { price: 2000, minUsers: 1, maxUsers: 5 },
  Growth: { price: 3900, minUsers: 6, maxUsers: 10 },
  Core: { price: 6900, minUsers: 11, maxUsers: 20 },
  Scale: { price: 14900, minUsers: 21, maxUsers: null },
};

const TIER_RANK: Record<PricingTier, number> = {
  Entry: 0,
  Growth: 1,
  Core: 2,
  Scale: 3,
};

export function normalizeTier(value: unknown): PricingTier | null {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  if (!v) return null;
  if (v === 'entry') return 'Entry';
  if (v === 'growth') return 'Growth';
  if (v === 'core') return 'Core';
  if (v === 'scale') return 'Scale';
  return null;
}

export function maxTier(...tiers: Array<PricingTier | null | undefined>): PricingTier {
  const filtered = tiers.filter(Boolean) as PricingTier[];
  if (filtered.length === 0) return 'Entry';
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
  if (max > 50) return 'Core';
  if (max > 20) return 'Growth';
  if (max < 10) return 'Entry';
  return 'Growth';
}

export function tierFromMemberLimit(memberLimit: number | null | undefined): PricingTier | null {
  if (memberLimit === null || memberLimit === undefined) return null;
  if (memberLimit >= 21) return 'Scale';
  if (memberLimit >= 11) return 'Core';
  if (memberLimit >= 6) return 'Growth';
  if (memberLimit >= 1) return 'Entry';
  return null;
}
