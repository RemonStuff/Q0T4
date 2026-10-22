import { costAmount } from "../cost/costAmount";
import type { BudgetUnit, Cost } from "../types";

/** Which way an amount is rounded; footers round used up and the budget down. */
export type Rounding = "down" | "up";

// Tolerance for binary floating point, so 4.35 * 10 doesn't land just below 43.5.
const EPSILON = 1e-9;

function round(value: number, decimals: number, rounding: Rounding): number {
  const factor = 10 ** decimals;
  return rounding === "down"
    ? Math.floor(value * factor + EPSILON) / factor
    : Math.ceil(value * factor - EPSILON) / factor;
}

function trimmed(value: number, decimals: number): string {
  return value.toFixed(decimals).replace(/\.?0+$/, "");
}

/** Compact tokens: `950`, `112k`, `1.25M`. */
export function formatTokens(tokens: number, rounding: Rounding = "down"): string {
  const whole = round(tokens, 0, rounding);
  if (whole < 1000) return String(whole);
  const thousands = round(whole / 1000, 0, rounding);
  if (thousands < 1000) return `${thousands}k`;
  return `${trimmed(round(whole / 1e6, 2, rounding), 2)}M`;
}

/** Credits with thousands separators, and one decimal below 10: `2,100`, `7.4`. */
export function formatCredits(credits: number, rounding: Rounding = "down"): string {
  if (credits < 10) {
    const tenths = round(credits, 1, rounding);
    if (tenths < 10) return trimmed(tenths, 1);
  }
  return round(credits, 0, rounding).toLocaleString("en-US");
}

/** The amount in the active unit; a missing credits amount throws, never shows as 0. */
export function formatAmount(cost: Cost, unit: BudgetUnit, rounding: Rounding = "down"): string {
  const amount = costAmount(cost, unit);
  return unit === "tokens" ? formatTokens(amount, rounding) : formatCredits(amount, rounding);
}
