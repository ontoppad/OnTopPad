/** Hold-time tiers used for payout weights. Same table in the keeper and the UI. */
export const DAY = 86_400;

export const TIERS = [
  { key: "rookie", label: "Rookie", from: 0, mult: 1 },
  { key: "pro", label: "Pro", from: 3 * DAY, mult: 1.5 },
  { key: "legend", label: "Legend", from: 7 * DAY, mult: 2 },
] as const;

export type Tier = (typeof TIERS)[number];

export function tierFor(ageSeconds: number): Tier {
  let t: Tier = TIERS[0];
  for (const tier of TIERS) if (ageSeconds >= tier.from) t = tier;
  return t;
}

export function nextTier(ageSeconds: number): { tier: Tier; in: number } | null {
  const next = TIERS.find((t) => t.from > ageSeconds);
  return next ? { tier: next, in: next.from - ageSeconds } : null;
}

/** A holding lot: `amount` tokens held since `since` (unix seconds). */
export interface Lot {
  amount: number;
  since: number;
}

export function weightOf(lots: Lot[], now: number): number {
  return lots.reduce((w, l) => w + l.amount * tierFor(now - l.since).mult, 0);
}
