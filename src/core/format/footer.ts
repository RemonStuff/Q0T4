import type { BudgetUnit, Cost, SubjectName } from "../types";
import { formatAmount } from "./amount";
import { markdownLiteral } from "./markdownLiteral";

/** Hidden marker before everything Q0T4 appends to a reply, so history can strip it (#18). */
export const FOOTER_SENTINEL = "<!-- q0t4:footer -->";

export interface FooterInput {
  readonly subject: SubjectName;
  readonly unit: BudgetUnit;
  readonly used: Cost;
  readonly budget: Cost;
  readonly resetLabel: string;
  /** Display name of the model that answered; absent when no model was called. */
  readonly modelName?: string | undefined;
}

/**
 * `*RemonStuff/Q0T4: 112k / 150k this week · resets Mon · GPT-5*` behind the sentinel.
 * Used is rounded up and the budget down, so the footer never overstates what is left.
 * The pool parts (month, reserve) join in #61.
 */
export function formatFooter(input: FooterInput): string {
  const { subject, unit, used, budget, resetLabel, modelName } = input;
  const usedText = formatAmount(used, unit, "up");
  const budgetText = formatAmount(budget, unit, "down");
  const unitLabel = unit === "credits" ? " credits" : "";
  const model = modelName === undefined ? "" : ` · ${markdownLiteral(modelName)}`;
  return (
    `${FOOTER_SENTINEL}\n\n` +
    `*${markdownLiteral(subject)}: ${usedText} / ${budgetText}${unitLabel} this week · ` +
    `resets ${markdownLiteral(resetLabel)}${model}*`
  );
}
