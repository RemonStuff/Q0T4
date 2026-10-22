import type { PaceWarning } from "../budget/paceWarning";
import { costAmount } from "../cost/costAmount";
import type { BudgetUnit, Cost } from "../types";
import { formatCredits, formatTokens } from "./amount";

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

export interface PaceWarningInput {
  readonly unit: BudgetUnit;
  readonly pace: PaceWarning;
}

/** `⚠️ Daily pace: 62k used today, at least 30% of the weekly budget (60k).` */
export function formatPaceWarning({ unit, pace }: PaceWarningInput): string {
  // Used rounds up and the threshold down, so the two numbers never contradict the warning.
  const [used, threshold] =
    unit === "tokens"
      ? [formatTokens(pace.usedToday, "up"), formatTokens(pace.threshold, "down")]
      : [
          `${formatCredits(pace.usedToday, "up")} credits`,
          `${formatCredits(pace.threshold, "down")} credits`,
        ];
  return `⚠️ Daily pace: ${used} used today, at least ${pace.percent}% of the weekly budget (${threshold}).`;
}
