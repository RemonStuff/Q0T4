import { costAmount } from "../cost/costAmount";
import type { BudgetUnit, Cost } from "../types";

export interface PreCheckInput {
  readonly unit: BudgetUnit;
  readonly used: Cost;
  readonly input: Cost;
  readonly budget: Cost;
  readonly extraAllowance?: Cost;
}

export interface PreCheckRefusal {
  readonly allowed: false;
  readonly used: Cost;
  readonly budget: Cost;
  readonly remaining: Cost;
}

export type PreCheckResult = { readonly allowed: true } | PreCheckRefusal;

export function preCheck(input: PreCheckInput): PreCheckResult {
  const { unit, used } = input;
  validateCost(used, unit);
  validateCost(input.input, unit);
  const budget = effectiveBudget(input);
  const limit = costAmount(budget, unit);
  if (limit > 0 && costAmount(used, unit) + costAmount(input.input, unit) <= limit) {
    return { allowed: true };
  }

  return {
    allowed: false,
    used,
    budget,
    remaining: {
      tokens: Math.max(0, budget.tokens - used.tokens),
      ...(budget.credits === undefined || used.credits === undefined
        ? {}
        : { credits: Math.max(0, budget.credits - used.credits) }),
    },
  };
}

export function effectiveBudget(
  input: Pick<PreCheckInput, "unit" | "budget" | "extraAllowance">,
): Cost {
  const { unit, budget, extraAllowance } = input;
  validateCost(budget, unit);
  if (extraAllowance === undefined) return budget;
  validateCost(extraAllowance, unit);
  const total: Cost = {
    tokens: budget.tokens + extraAllowance.tokens,
    ...(budget.credits === undefined || extraAllowance.credits === undefined
      ? {}
      : { credits: budget.credits + extraAllowance.credits }),
  };
  validateCost(total, unit);
  return total;
}

function validateCost(cost: Cost, unit: BudgetUnit): void {
  costAmount(cost, "tokens");
  if (unit === "credits" || cost.credits !== undefined) costAmount(cost, "credits");
}
