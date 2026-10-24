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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isOptionalNumber = (value: unknown): boolean => value === undefined || isNumber(value);
const SOURCES: readonly unknown[] = ["github-docs-yaml", "github-docs-article", "manual"];

const isThreshold = (value: unknown): boolean =>
  value === undefined ||
  (isRecord(value) && (value["op"] === "lte" || value["op"] === "gt") && isNumber(value["tokens"]));

const isTier = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value["tier"] === "string" &&
  isNumber(value["input"]) &&
  isNumber(value["output"]) &&
  isOptionalNumber(value["cachedInput"]) &&
  isOptionalNumber(value["cacheWrite"]) &&
  isThreshold(value["threshold"]);

const isModelPrice = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value["model"] === "string" &&
  typeof value["provider"] === "string" &&
  Array.isArray(value["tiers"]) &&
  value["tiers"].every(isTier);

/** True when `value` has the shape of a stored `PriceTable`. Rate values are validated elsewhere. */
export function isPriceTable(value: unknown): value is PriceTable {
  return (
    isRecord(value) &&
    typeof value["fetchedAt"] === "string" &&
    SOURCES.includes(value["source"]) &&
    (value["etag"] === undefined || typeof value["etag"] === "string") &&
    Array.isArray(value["models"]) &&
    value["models"].every(isModelPrice)
  );
}
