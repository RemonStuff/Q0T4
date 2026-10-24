import type { PriceTier } from "./priceTable";

/** USD per 1M tokens, as costed for one request. */
export interface Rates {
  readonly input: number;
  readonly output: number;
}

/** The input rate: a cache write can cost more than plain input, so the higher one is used. */
export function inputRate(tier: PriceTier): number {
  return Math.max(tier.input, tier.cacheWrite ?? 0);
}

function applies(tier: PriceTier, inputTokens: number): boolean {
  const { threshold } = tier;
  if (threshold === undefined) return false;
  return threshold.op === "lte" ? inputTokens <= threshold.tokens : inputTokens > threshold.tokens;
}

/**
 * The tier a request of `inputTokens` falls in: the one whose threshold matches, else a
 * tier without a threshold, else the last. A model always has at least one tier.
 */
export function pickTier(tiers: readonly PriceTier[], inputTokens: number): PriceTier {
  const found =
    tiers.find((tier) => applies(tier, inputTokens)) ??
    tiers.find((tier) => tier.threshold === undefined);
  return found ?? (tiers.at(-1) as PriceTier);
}
