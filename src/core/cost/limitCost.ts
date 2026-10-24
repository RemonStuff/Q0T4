import type { BudgetUnit, Cost } from "../types";

/** A budget limit as a `Cost` in the active unit; the other unit stays 0. */
export function limitCost(unit: BudgetUnit, amount: number): Cost {
  return unit === "credits" ? { tokens: 0, credits: amount } : { tokens: amount };
}
