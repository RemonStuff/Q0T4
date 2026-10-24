import type { ModelRef } from "../types";
import type { ModelPrice, PriceTable } from "./priceTable";

/** Case-insensitive, whitespace-collapsed form of a model name. */
export function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * The price-table entry for a model. For now this matches the display name only;
 * #52 adds the family and id slugs and the override keys.
 */
export function matchModel(table: PriceTable, model: ModelRef): ModelPrice | undefined {
  const wanted = normaliseName(model.name);
  return table.models.find((entry) => normaliseName(entry.model) === wanted);
}
