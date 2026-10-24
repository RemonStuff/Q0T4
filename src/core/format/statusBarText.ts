import type { StatusBarState } from "../../ports/UiPort";
import type { BudgetUnit } from "../types";
import { formatAmount, formatAmountCompact } from "./amount";
import { percentText, sortStatusRows } from "./statusTable";
import type { StatusRow } from "./statusTable";
import { usageLevel } from "./warnings";

export interface StatusBarInput {
  readonly unit: BudgetUnit;
  /** The row of the subject the item shows. */
  readonly shown: StatusRow;
  /** Every subject, for the tooltip. */
  readonly rows: readonly StatusRow[];
  /** `warnAtPercent` from the settings. */
  readonly warnAtPercent: number;
  /** E.g. `Mon 19 Oct`. */
  readonly resetLabelLong: string;
}

const TOOLTIP_LIMIT = 10;

/** `$(` would draw an icon, so a subject name gets it escaped. */
const plain = (text: string) => text.replaceAll("$(", "\\$(");

/**
 * The status bar item: `$(pulse) RemonStuff/Q0T4 113k/150k` (credits: `2.1k/3.3k cr`) with a
 * warning or error state, and a tooltip with every subject's usage and the reset date. Used
 * rounds up and the budget down, like the footer.
 */
export function formatStatusBar(input: StatusBarInput): StatusBarState {
  const { unit, shown } = input;
  const used = formatAmountCompact(shown.used, unit, "up");
  const budget = formatAmountCompact(shown.budget, unit, "down");
  const level = usageLevel({
    unit,
    used: shown.used,
    budget: shown.budget,
    warnAtPercent: input.warnAtPercent,
  });
  return {
    text: `$(pulse) ${plain(shown.subject)} ${used}/${budget}${unit === "credits" ? " cr" : ""}`,
    tooltip: tooltip(input),
    level: level === "ok" ? "normal" : level === "warn" ? "warning" : "error",
  };
}

function tooltip(input: StatusBarInput): string {
  const { unit, shown } = input;
  const listed = input.rows.some((r) => r.subject.toLowerCase() === shown.subject.toLowerCase())
    ? input.rows
    : [...input.rows, shown];
  const sorted = sortStatusRows(listed, unit);
  const lines = sorted.slice(0, TOOLTIP_LIMIT).map((row) => {
    const unitLabel = unit === "credits" ? " credits" : "";
    return (
      `${row.subject}: ${formatAmount(row.used, unit, "up")} / ` +
      `${formatAmount(row.budget, unit, "down")}${unitLabel} (${percentText(row.used, row.budget, unit)})`
    );
  });
  const more = sorted.length - lines.length;
  return [
    "Q0T4 usage this week",
    ...lines,
    ...(more > 0 ? [`and ${more} more`] : []),
    `Resets ${input.resetLabelLong}`,
  ].join("\n");
}
