import { costAmount } from "../cost/costAmount";
import type { BudgetUnit, Cost } from "../types";

export interface PaceInput {
  readonly unit: BudgetUnit;
  /** Everything used today, including the request being answered. */
  readonly usedToday: Cost;
  readonly weeklyBudget: Cost;
  /** `dailyPaceWarning` from the settings: a percentage of the weekly budget. */
  readonly percent: number;
}

export interface PaceWarning {
  readonly usedToday: number;
  /** The daily amount that triggers the warning, in the active unit. */
  readonly threshold: number;
  readonly percent: number;
}

/**
 * Warns, without blocking, when a subject has used `percent`% of its weekly budget
 * within one local day. The caller passes today's usage from the ledger, so the
 * warning ends at local midnight by itself.
 */
export function paceWarning(input: PaceInput): PaceWarning | null {
  const used = costAmount(input.usedToday, input.unit);
  const budget = costAmount(input.weeklyBudget, input.unit);
  // Compared as `used * 100 >= percent * budget` to avoid rounding at the boundary.
  if (used <= 0 || used * 100 < input.percent * budget) return null;
  return { usedToday: used, threshold: (budget * input.percent) / 100, percent: input.percent };
}
