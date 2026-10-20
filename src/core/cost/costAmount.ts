import type { BudgetUnit, Cost } from "../types";

export function costAmount(cost: Cost, unit: BudgetUnit): number {
  const amount = cost[unit];
  if (amount === undefined) throw new TypeError(`A ${unit} amount is required.`);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError(`The ${unit} amount must be finite and nonnegative.`);
  }
  return amount;
}
