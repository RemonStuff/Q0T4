import type { PreCheckRefusal } from "../budget/preCheck";
import { costAmount } from "../cost/costAmount";
import type { BudgetUnit, SubjectName } from "../types";
import { markdownLiteral } from "./markdownLiteral";

export interface RefusalContext {
  readonly decision: PreCheckRefusal;
  readonly unit: BudgetUnit;
  readonly subject: SubjectName;
  readonly resetLabel: string;
}

export function formatRefusal(context: RefusalContext): string {
  const { decision, unit, subject, resetLabel } = context;
  return (
    `This request doesn't fit the budget for ${markdownLiteral(subject)}.\n\n` +
    `Used: ${costAmount(decision.used, unit)} ${unit}. ` +
    `Budget: ${costAmount(decision.budget, unit)} ${unit}. ` +
    `Remaining: ${costAmount(decision.remaining, unit)} ${unit}.\n` +
    `Resets: ${markdownLiteral(resetLabel)}.\n\n` +
    "Check `/status` or use `/use <subject>` to choose another subject."
  );
}
