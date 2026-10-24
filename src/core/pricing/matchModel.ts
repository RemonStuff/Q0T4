import type { ModelRef, PriceOverride } from "../types";
import { normaliseModelName } from "./normalise";
import type { ModelPrice, PriceTable } from "./priceTable";

/** Case-insensitive, whitespace-collapsed form of a model name, without footnote markers. */
export function normaliseName(name: string): string {
  return normaliseModelName(name).toLowerCase();
}

/** `GPT-5 mini` and `gpt-5-mini` are both `gpt-5-mini`; `claude-sonnet-5.5` is `claude-sonnet-5-5`. */
export function slug(text: string): string {
  return normaliseModelName(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The `(fast mode) (preview)` parts of a name: a variant must not be priced as its base model. */
function qualifiers(name: string): string {
  return (name.match(/\([^)]*\)/g) ?? [])
    .map((part) => part.toLowerCase())
    .sort()
    .join("");
}

/**
 * The price-table entry for a model, in this order: its display name, then the slug of
 * the table's name against the model's `family`, then against its `id` (docs/PLAN.md §9.1).
 * A slug match is refused when the two names carry different `( … )` qualifiers.
 */
export function matchModel(table: PriceTable, model: ModelRef): ModelPrice | undefined {
  const wanted = normaliseName(model.name);
  const byName = table.models.find((entry) => normaliseName(entry.model) === wanted);
  if (byName !== undefined) return byName;
  for (const key of [model.family, model.id]) {
    if (key === undefined || slug(key) === "") continue;
    const found = table.models.find(
      (entry) =>
        slug(entry.model) === slug(key) && qualifiers(entry.model) === qualifiers(model.name),
    );
    if (found !== undefined) return found;
  }
  return undefined;
}

export type PriceMatch =
  | { readonly kind: "override"; readonly key: string; readonly price: PriceOverride }
  | { readonly kind: "table"; readonly entry: ModelPrice }
  /** `auto`: the Auto model hides the real one, so the user should be told to pick a model. */
  | { readonly kind: "unknown"; readonly auto?: true };

function findOverride(
  overrides: Readonly<Record<string, PriceOverride>>,
  model: ModelRef,
): { key: string; price: PriceOverride } | undefined {
  const keys = Object.keys(overrides);
  const wanted = normaliseName(model.name);
  const tests = [
    (key: string) => normaliseName(key) === wanted,
    (key: string) => model.family !== "" && slug(key) === slug(model.family),
    (key: string) => model.id !== undefined && slug(key) === slug(model.id),
  ];
  for (const test of tests) {
    const key = keys.find(test);
    if (key !== undefined) return { key, price: overrides[key] as PriceOverride };
  }
  return undefined;
}

const isAuto = (model: ModelRef): boolean =>
  [model.name, model.family, model.id ?? ""].some((text) => slug(text) === "auto");

/**
 * Finds the price of a model: a `modelPrices` override (by name, family or id), the price
 * table, or nothing. The Auto model is nothing, unless the user priced it themselves.
 */
export function resolvePrice(
  table: PriceTable,
  model: ModelRef,
  overrides: Readonly<Record<string, PriceOverride>>,
): PriceMatch {
  const override = findOverride(overrides, model);
  if (override !== undefined) return { kind: "override", ...override };
  if (isAuto(model)) return { kind: "unknown", auto: true };
  const entry = matchModel(table, model);
  return entry === undefined ? { kind: "unknown" } : { kind: "table", entry };
}
