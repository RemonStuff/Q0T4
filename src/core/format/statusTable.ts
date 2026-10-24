import { costAmount } from "../cost/costAmount";
import type { BudgetUnit, Cost, SubjectName } from "../types";
import { formatAmount } from "./amount";
import { markdownLiteral } from "./markdownLiteral";
import { formatStalePrices } from "./priceNotices";
import { usageLevel } from "./warnings";

export interface StatusRow {
  readonly subject: SubjectName;
  /** Usage this week, after the subject's latest reset marker. */
  readonly used: Cost;
  readonly budget: Cost;
  /** Usage today. */
  readonly today: Cost;
  /** Requests recorded this week. */
  readonly requests: number;
  /** The budget comes from `defaultLimit`, not from the subject's own `weeklyLimit`. */
  readonly limitIsDefault: boolean;
  /** The repo of the open folder; listed first. */
  readonly current: boolean;
}

/** The price table behind a credits-mode table. */
export interface PriceInfo {
  readonly source: "github-docs-yaml" | "github-docs-article" | "manual";
  /** ISO 8601 instant. */
  readonly fetchedAt: string;
  /** How many `q0t4.modelPrices` overrides are active. */
  readonly overrides: number;
  readonly stale: boolean;
}

export interface StatusTableInput {
  readonly unit: BudgetUnit;
  readonly rows: readonly StatusRow[];
  /** E.g. `Mon 19 Oct`. */
  readonly resetLabelLong: string;
  /** `warnAtPercent` from the settings. */
  readonly warnAtPercent: number;
  /** Credits mode: where the prices come from, when they were fetched and how many overrides apply. */
  readonly prices?: PriceInfo;
}

const NO_SUBJECTS = "No subjects yet. Send a question to start tracking usage.";

/** The current repo first, then by usage this week, then by name. */
export function sortStatusRows(rows: readonly StatusRow[], unit: BudgetUnit): StatusRow[] {
  return [...rows].sort(order(unit));
}

/** `74%`, or `–` when the budget is 0. Rounded down, like the warnings. */
export function percentText(used: Cost, budget: Cost, unit: BudgetUnit): string {
  const total = costAmount(budget, unit);
  return total === 0 ? "–" : `${Math.floor((costAmount(used, unit) * 100) / total)}%`;
}

function order(unit: BudgetUnit) {
  return (a: StatusRow, b: StatusRow): number => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    const byUsage = costAmount(b.used, unit) - costAmount(a.used, unit);
    if (byUsage !== 0) return byUsage;
    return a.subject.toLowerCase().localeCompare(b.subject.toLowerCase());
  };
}

function percentCell(row: StatusRow, input: StatusTableInput): string {
  const level = usageLevel({
    unit: input.unit,
    used: row.used,
    budget: row.budget,
    warnAtPercent: input.warnAtPercent,
  });
  const percent = percentText(row.used, row.budget, input.unit);
  return level === "ok" ? percent : `${percent} ${level === "warn" ? "⚠️" : "⛔"}`;
}

/**
 * The `/status` reply: a markdown table with one row per subject, the current repo first
 * and then by usage this week, and the reset date below. Amounts round like the footer:
 * used up, budgets down. Pool columns and the reserve line join in #61.
 */
const SOURCE_LABEL: Readonly<Record<PriceInfo["source"], string>> = {
  "github-docs-yaml": "GitHub docs data file",
  "github-docs-article": "GitHub docs article",
  manual: "manual prices (q0t4.modelPrices)",
};

function priceLines(prices: PriceInfo): string {
  const count =
    prices.overrides === 0
      ? "no overrides"
      : `${prices.overrides} override${prices.overrides === 1 ? "" : "s"}`;
  const line = `Prices: ${SOURCE_LABEL[prices.source]}, ${prices.source === "manual" ? "" : `fetched ${prices.fetchedAt.slice(0, 10)}, `}${count}.`;
  return prices.stale ? `${line}\n\n${formatStalePrices(prices.fetchedAt)}` : line;
}

export function formatStatusTable(input: StatusTableInput): string {
  const { unit } = input;
  const reset =
    `Weekly budgets reset on ${markdownLiteral(input.resetLabelLong)}.` +
    (input.prices === undefined ? "" : `\n\n${priceLines(input.prices)}`);
  if (input.rows.length === 0) return `${NO_SUBJECTS}\n\n${reset}`;

  const suffix = unit === "credits" ? " (credits)" : "";
  const lines = [
    `| Subject | Used${suffix} | Weekly budget${suffix} | % | Today${suffix} | Requests |`,
    "|---|---|---|---|---|---|",
  ];
  for (const row of sortStatusRows(input.rows, unit)) {
    const budget = `${formatAmount(row.budget, unit, "down")}${row.limitIsDefault ? " (default)" : ""}`;
    lines.push(
      `| ${markdownLiteral(row.subject)} | ${formatAmount(row.used, unit, "up")} | ${budget} | ` +
        `${percentCell(row, input)} | ${formatAmount(row.today, unit, "up")} | ${row.requests} |`,
    );
  }
  return `${lines.join("\n")}\n\n${reset}`;
}
