import type { CostModel } from "../cost/costModel";
import type { DayKey, LedgerEntry, ModelRef, SubjectName } from "../types";

/**
 * How a request ended, as far as usage is concerned (docs/PLAN.md §4, issue #16).
 *
 * - `completed`, `cancelled`, `failed` and `budgetStopped` all had a model reply
 *   that started streaming, so input and the output counted so far are charged.
 * - `requestRejected` (`sendRequest` rejected before any chunk) and `refused`
 *   (the pre-check said no) never used the model, so nothing is charged.
 */
export type RecordingOutcome =
  "completed" | "cancelled" | "failed" | "budgetStopped" | "requestRejected" | "refused";

export interface RecordingInput {
  readonly outcome: RecordingOutcome;
  readonly subject: SubjectName;
  readonly model: ModelRef;
  readonly inputTokens: number;
  /** Counted from the accumulated reply text, never estimated. */
  readonly outputTokens: number;
  readonly costModel: CostModel;
  readonly id: string;
  readonly at: Date;
  /** IANA zone used for the entry's local `day`. */
  readonly timeZone: string;
}

/** Decides what is charged for one request: a ledger entry, or `null` for nothing. */
export function recordingPolicy(input: RecordingInput): LedgerEntry | null {
  const { outcome } = input;
  if (outcome === "requestRejected" || outcome === "refused") return null;

  const { cost, rates } = input.costModel.cost(input.model, {
    input: input.inputTokens,
    output: input.outputTokens,
  });
  return {
    v: 1,
    id: input.id,
    kind: "usage",
    at: input.at.toISOString(),
    day: dayKey(input.at, input.timeZone),
    subject: input.subject,
    source: "q0t4",
    model: { name: input.model.name, family: input.model.family },
    tokens: { input: input.inputTokens, output: input.outputTokens },
    ...(rates === undefined ? {} : { rates }),
    cost,
    stopped: outcome === "budgetStopped" || outcome === "cancelled",
  };
}

function dayKey(at: Date, timeZone: string): DayKey {
  // The `en-CA` locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}
