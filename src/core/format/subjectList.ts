import type { BudgetUnit, Cost, SubjectName } from "../types";
import { formatAmount } from "./amount";
import { markdownLiteral } from "./markdownLiteral";

export interface SubjectListItem {
  readonly subject: SubjectName;
  readonly limit: Cost;
  /** The limit comes from `defaultLimit`, not from the subject's own `weeklyLimit`. */
  readonly limitIsDefault: boolean;
  readonly description?: string;
  /** The repo of the open folder. */
  readonly current: boolean;
  /** `q0t4.fallbackSubject`. */
  readonly fallback: boolean;
  /** The subject of this conversation. */
  readonly thread: boolean;
}

export interface SubjectListInput {
  readonly unit: BudgetUnit;
  readonly subjects: readonly SubjectListItem[];
  /** What any repo without a limit of its own gets. */
  readonly defaultLimit: Cost;
}

const HINT =
  "Use `/use <subject> <question>` to charge a question to a subject, or `/use <subject>` to switch this conversation. Set a repo's limit in the `q0t4.subjects` setting.";

const perWeek = (cost: Cost, unit: BudgetUnit) =>
  `${formatAmount(cost, unit, "down")}${unit === "credits" ? " credits" : ""}`;

function order(a: SubjectListItem, b: SubjectListItem): number {
  if (a.current !== b.current) return a.current ? -1 : 1;
  return a.subject.toLowerCase().localeCompare(b.subject.toLowerCase());
}

function line(item: SubjectListItem, unit: BudgetUnit): string {
  const marks: string[] = [];
  if (item.current) marks.push("current repo");
  if (item.fallback) marks.push("fallback subject");
  if (item.thread) marks.push("this conversation");
  const limit = `${perWeek(item.limit, unit)}${item.limitIsDefault ? " (default)" : ""} a week`;
  const description =
    item.description === undefined ? "" : ` — ${markdownLiteral(item.description)}`;
  return `- **${markdownLiteral(item.subject)}**: ${[limit, ...marks].join(" · ")}${description}`;
}

/**
 * The `/subjects` reply: every known subject with its weekly limit, where the limit comes
 * from, its description and what it is (current repo, fallback, this conversation), then
 * the default limit for new repos and hints for `/use` and the settings.
 */
export function formatSubjectList(input: SubjectListInput): string {
  const { unit } = input;
  const items = [...input.subjects].sort(order).map((item) => line(item, unit));
  return [
    "**Known subjects**",
    "",
    ...items,
    "",
    `Any other repo gets the default limit of ${perWeek(input.defaultLimit, unit)} a week.`,
    "",
    HINT,
  ].join("\n");
}
