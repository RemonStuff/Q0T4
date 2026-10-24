import { normaliseModelName, providerId, PriceParseError } from "./normalise";
import type { ModelPrice, PriceThreshold, PriceTier } from "./priceTable";

export interface TierRecord {
  readonly model: string;
  readonly provider: string;
  readonly tier: string;
  readonly threshold: PriceThreshold | undefined;
  readonly input: number | undefined;
  readonly cachedInput: number | undefined;
  readonly cacheWrite: number | undefined;
  readonly output: number | undefined;
  readonly line: number;
}

/** Groups the records of one model into its tiers, in the order they appear. */
export function buildModels(records: readonly TierRecord[]): ModelPrice[] {
  const models = new Map<string, { model: string; provider: string; tiers: PriceTier[] }>();
  for (const record of records) {
    const model = normaliseModelName(record.model);
    const provider = providerId(record.provider);
    if (record.input === undefined) {
      throw new PriceParseError(`${model} has no input price`, record.line);
    }
    if (record.output === undefined) {
      throw new PriceParseError(`${model} has no output price`, record.line);
    }
    const key = `${model.toLowerCase()}\u0000${provider}`;
    const entry = models.get(key) ?? { model, provider, tiers: [] };
    models.set(key, entry);
    if (entry.tiers.some((tier) => tier.tier === record.tier)) {
      throw new PriceParseError(`${model} has the ${record.tier} tier twice`, record.line);
    }
    entry.tiers.push({
      tier: record.tier,
      ...(record.threshold === undefined ? {} : { threshold: record.threshold }),
      input: record.input,
      ...(record.cachedInput === undefined ? {} : { cachedInput: record.cachedInput }),
      ...(record.cacheWrite === undefined ? {} : { cacheWrite: record.cacheWrite }),
      output: record.output,
    });
  }
  return [...models.values()];
}

/** Runs `parse` and gives the bare parse error it throws the line it happened on. */
export function atLine<T>(line: number, parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    throw new PriceParseError((error as Error).message, line);
  }
}
