// The parsed per-model price table (docs/PLAN.md §9.1). Rates are USD per 1M tokens.

export interface PriceThreshold {
  readonly op: "lte" | "gt";
  readonly tokens: number;
}

export interface PriceTier {
  readonly tier: string;
  /** Input-size bound for this tier; absent when the model has a single tier. */
  readonly threshold?: PriceThreshold;
  readonly input: number;
  readonly cachedInput?: number;
  readonly cacheWrite?: number;
  readonly output: number;
}

export interface ModelPrice {
  /** Display name, e.g. "Claude Sonnet 5.5". */
  readonly model: string;
  readonly provider: string;
  readonly tiers: readonly PriceTier[];
}

export interface PriceTable {
  /** ISO 8601 instant of the successful fetch. */
  readonly fetchedAt: string;
  readonly source: "github-docs-yaml" | "github-docs-article" | "manual";
  readonly etag?: string;
  readonly models: readonly ModelPrice[];
}
