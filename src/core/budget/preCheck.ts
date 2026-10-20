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
  const { unit, used, budget, extraAllowance } = input;
  validateCost(used, unit);
  validateCost(input.input, unit);
  validateCost(budget, unit);
  if (extraAllowance !== undefined) validateCost(extraAllowance, unit);

  const effectiveBudget: Cost =
    extraAllowance === undefined
      ? budget
      : {
          tokens: budget.tokens + extraAllowance.tokens,
          ...(budget.credits === undefined || extraAllowance.credits === undefined
            ? {}
            : { credits: budget.credits + extraAllowance.credits }),
        };
  validateCost(effectiveBudget, unit);
  const limit = costAmount(effectiveBudget, unit);
  if (limit > 0 && costAmount(used, unit) + costAmount(input.input, unit) <= limit) {
    return { allowed: true };
  }

  return {
    allowed: false,
    used,
    budget: effectiveBudget,
    remaining: {
      tokens: Math.max(0, effectiveBudget.tokens - used.tokens),
      ...(effectiveBudget.credits === undefined || used.credits === undefined
        ? {}
        : { credits: Math.max(0, effectiveBudget.credits - used.credits) }),
    },
  };
}

function validateCost(cost: Cost, unit: BudgetUnit): void {
  costAmount(cost, "tokens");
  if (unit === "credits" || cost.credits !== undefined) costAmount(cost, "credits");
}
