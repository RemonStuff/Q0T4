import { normaliseModelName } from "./normalise";
import type { PriceTable } from "./priceTable";

export type Validation =
  { readonly ok: true } | { readonly ok: false; readonly failures: string[] };

/** A rate may change by up to this factor, either way, between two tables. */
const MAX_CHANGE = 3;
const TOLERANCE = 1e-9;

const key = (name: string) => normaliseModelName(name).toLowerCase();
const positive = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * Checks a fetched table before it replaces the current one: it has models with tiers, every
 * rate is positive, the required models are there, and no rate moved more than 3× from
 * `previous`. Returns every failing check, so the warning can name them all.
 */
export function validateTable(
  next: PriceTable,
  previous: PriceTable | undefined,
  requiredModels: readonly string[],
): Validation {
  const failures: string[] = [];

  if (next.models.length === 0) failures.push("the table has no models");
  for (const model of next.models) {
    if (model.tiers.length === 0) failures.push(`${model.model} has no tiers`);
    for (const tier of model.tiers) {
      const rates = { input: tier.input, output: tier.output } as Record<string, unknown>;
      if (tier.cachedInput !== undefined) rates["cached input"] = tier.cachedInput;
      if (tier.cacheWrite !== undefined) rates["cache write"] = tier.cacheWrite;
      for (const [name, value] of Object.entries(rates)) {
        if (!positive(value)) {
          failures.push(
            `${model.model} (${tier.tier}): ${name} rate must be positive, got ${String(value)}`,
          );
        }
      }
    }
  }

  const present = new Set(next.models.map((model) => key(model.model)));
  for (const required of requiredModels) {
    if (!present.has(key(required))) failures.push(`missing required model: ${required}`);
  }

  if (previous !== undefined) {
    const before = new Map(
      previous.models.flatMap((model) =>
        model.tiers.map((tier) => [`${key(model.model)}\u0000${tier.tier}`, tier] as const),
      ),
    );
    for (const model of next.models) {
      for (const tier of model.tiers) {
        const old = before.get(`${key(model.model)}\u0000${tier.tier}`);
        if (old === undefined) continue;
        for (const name of ["input", "output"] as const) {
          const a = old[name];
          const b = tier[name];
          if (!positive(a) || !positive(b)) continue;
          if (Math.max(a, b) / Math.min(a, b) > MAX_CHANGE + TOLERANCE) {
            failures.push(
              `${model.model} (${tier.tier}): ${name} rate changed from ${a} to ${b}, more than ${MAX_CHANGE}×`,
            );
          }
        }
      }
    }
  }

  return failures.length === 0 ? { ok: true } : { ok: false, failures };
}
