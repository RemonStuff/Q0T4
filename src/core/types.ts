// Shared domain types for Q0T4's core. Unit-agnostic: budgets are measured in
// tokens or GitHub AI Credits (docs/PLAN.md §9), so amounts are a `Cost` and
// usage is stored as append-only ledger entries (docs/PLAN.md §4).

export type SubjectName = string;

/** A local calendar day, `YYYY-MM-DD`. */
export type DayKey = string;

export const BUDGET_UNITS = ["tokens", "credits"] as const;
export type BudgetUnit = (typeof BUDGET_UNITS)[number];

/** An amount in both units. `credits` is present only when a price was known. */
export interface Cost {
  readonly tokens: number;
  readonly credits?: number;
}

/** The prices a ledger entry was costed with, so it's never repriced. */
export interface RateSnapshot {
  /** USD per 1M input tokens. */
  readonly input: number;
  /** USD per 1M output tokens. */
  readonly output: number;
  readonly tier: string;
  readonly tableDate: string;
  readonly tableSource: string;
}

export interface ModelRef {
  readonly name: string;
  readonly family: string;
  readonly id?: string;
  readonly vendor?: string;
}

export interface ChatMessage {
  readonly role: "user" | "assistant";
  readonly text: string;
}

export type HistoryTurn =
  | { readonly kind: "request"; readonly prompt: string; readonly command?: string }
  | { readonly kind: "response"; readonly text: string; readonly metadata?: unknown };

export type ModelErrorKind = "NoPermissions" | "NotFound" | "Blocked" | "Unknown";

export interface SubjectConfig {
  readonly weeklyLimit?: number;
  readonly monthlyShare?: number;
  readonly description?: string;
}

export type ResetDay =
  "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

/** Settings after validation (docs/PLAN.md §3). Pool and price settings join in #51 and #56. */
export interface Q0T4Config {
  readonly budgetUnit: BudgetUnit;
  readonly subjects: Readonly<Record<SubjectName, SubjectConfig>>;
  readonly defaultLimit: number;
  readonly fallbackSubject: SubjectName;
  readonly resetDay: ResetDay;
  readonly warnAtPercent: number;
  readonly dailyPaceWarning: number;
  readonly includeHistory: boolean;
}

export const STOPPED_REASONS = [false, "budget", "cancelled", "precheck"] as const;
export type StoppedReason = (typeof STOPPED_REASONS)[number];

/** Returned as `ChatResult.metadata`; must stay JSON-serialisable. */
export interface ResultMetadata {
  readonly v: 1;
  readonly subject: SubjectName;
  /** Display name of the model that answered; absent when no model was called. */
  readonly model?: string;
  readonly unit: BudgetUnit;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cost: Cost;
  readonly stopped: StoppedReason;
}

export type LedgerSource = "q0t4" | "q0t4-pricing" | "untracked" | `api:${string}`;

interface LedgerEntryBase {
  readonly v: 1;
  readonly id: string;
  /** ISO 8601 instant. */
  readonly at: string;
  readonly day: DayKey;
  readonly subject: SubjectName;
  readonly source: LedgerSource;
}

export type LedgerEntry =
  | (LedgerEntryBase & {
      readonly kind: "usage";
      readonly model: ModelRef;
      readonly tokens: { readonly input: number; readonly output: number };
      readonly rates?: RateSnapshot;
      readonly cost: Cost;
      readonly borrowed?: Cost;
      readonly stopped: boolean;
    })
  /** A `/sync` correction; credits may be negative (over-estimate credited back). */
  | (LedgerEntryBase & { readonly kind: "untracked"; readonly cost: Cost })
  /** "Reset This Week": weekly totals count only entries after this marker. */
  | (LedgerEntryBase & { readonly kind: "reset" })
  /** A subject's weekly budget, fixed for the week (docs/PLAN.md §9.2). */
  | (LedgerEntryBase & {
      readonly kind: "budget";
      readonly week: DayKey;
      readonly unit: BudgetUnit;
      readonly amount: number;
    })
  /** Permission to borrow from the reserve for one subject and week. */
  | (LedgerEntryBase & { readonly kind: "reserve-grant"; readonly week: DayKey });

export type LedgerKind = LedgerEntry["kind"];

// --- guards -----------------------------------------------------------------

type Fields = Record<string, unknown>;

const isRecord = (value: unknown): value is Fields =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isOptional = (value: unknown, check: (v: unknown) => boolean): boolean =>
  value === undefined || check(value);

const isUnit = (value: unknown): value is BudgetUnit =>
  (BUDGET_UNITS as readonly unknown[]).includes(value);

const isDayKey = (value: unknown): value is DayKey =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

const isInstant = (value: unknown): value is string =>
  typeof value === "string" && value.includes("T") && !Number.isNaN(Date.parse(value));

/** Token counts are never negative; credits may be (a `/sync` credit back). */
const isCost = (value: unknown, allowNegativeCredits = false): value is Cost =>
  isRecord(value) &&
  isCount(value["tokens"]) &&
  isOptional(value["credits"], allowNegativeCredits ? isFiniteNumber : isCount);

const isSource = (value: unknown): value is LedgerSource =>
  value === "q0t4" ||
  value === "q0t4-pricing" ||
  value === "untracked" ||
  (typeof value === "string" && /^api:.+/.test(value));

const isModelRef = (value: unknown): value is ModelRef =>
  isRecord(value) && isNonEmptyString(value["name"]) && typeof value["family"] === "string";

const isRateSnapshot = (value: unknown): value is RateSnapshot =>
  isRecord(value) &&
  isCount(value["input"]) &&
  isCount(value["output"]) &&
  typeof value["tier"] === "string" &&
  typeof value["tableDate"] === "string" &&
  typeof value["tableSource"] === "string";

export function isResultMetadata(value: unknown): value is ResultMetadata {
  return (
    isRecord(value) &&
    value["v"] === 1 &&
    isNonEmptyString(value["subject"]) &&
    isOptional(value["model"], isNonEmptyString) &&
    isUnit(value["unit"]) &&
    isCount(value["inputTokens"]) &&
    isCount(value["outputTokens"]) &&
    isCost(value["cost"]) &&
    (STOPPED_REASONS as readonly unknown[]).includes(value["stopped"])
  );
}

export function isLedgerEntry(value: unknown): value is LedgerEntry {
  if (
    !isRecord(value) ||
    value["v"] !== 1 ||
    !isNonEmptyString(value["id"]) ||
    !isInstant(value["at"]) ||
    !isDayKey(value["day"]) ||
    !isNonEmptyString(value["subject"]) ||
    !isSource(value["source"])
  ) {
    return false;
  }
  switch (value["kind"]) {
    case "usage": {
      const tokens = value["tokens"];
      return (
        isModelRef(value["model"]) &&
        isRecord(tokens) &&
        isCount(tokens["input"]) &&
        isCount(tokens["output"]) &&
        isOptional(value["rates"], isRateSnapshot) &&
        isCost(value["cost"]) &&
        isOptional(value["borrowed"], (b) => isCost(b)) &&
        typeof value["stopped"] === "boolean"
      );
    }
    case "untracked":
      return isCost(value["cost"], true);
    case "reset":
      return true;
    case "budget":
      return isDayKey(value["week"]) && isUnit(value["unit"]) && isCount(value["amount"]);
    case "reserve-grant":
      return isDayKey(value["week"]);
    default:
      return false;
  }
}
