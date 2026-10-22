import { costAmount } from "../cost/costAmount";
import type { BudgetUnit, Cost } from "../types";

export interface WarningInput {
  readonly unit: BudgetUnit;
  readonly used: Cost;
  readonly budget: Cost;
  /** `warnAtPercent` from the settings: a percentage of the weekly budget. */
  readonly warnAtPercent: number;
}

/** The weekly-usage warning, or `null` below `warnAtPercent`. Pace and price warnings come later. */
export function formatWarning(input: WarningInput): string | null {
  const used = costAmount(input.used, input.unit);
  const budget = costAmount(input.budget, input.unit);
  if (used >= budget) return "⛔ Weekly budget reached.";
  if (used * 100 >= input.warnAtPercent * budget) {
    return `⚠️ ${Math.floor((used * 100) / budget)}% of the weekly budget used.`;
  }
  return null;
}
