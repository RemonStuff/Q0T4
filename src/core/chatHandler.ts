import type { CancellationSignal } from "../ports/CancellationSignal";
import type { ChatOutputPort } from "../ports/ChatOutputPort";
import type { ModelPort } from "../ports/ModelPort";
import type { ClockPort } from "../ports/ClockPort";
import type { ModelSelectorPort } from "../ports/ModelSelectorPort";
import type {
  PromptReference,
  ReferenceReaderPort,
  ResolvedReference,
} from "../ports/ReferenceReaderPort";
import type { UsageSink } from "../ports/UsageSink";
import { countInput } from "./budget/countInput";
import { paceWarning } from "./budget/paceWarning";
import { preCheck } from "./budget/preCheck";
import type { PreCheckResult } from "./budget/preCheck";
import { recordingPolicy } from "./budget/recordingPolicy";
import type { RecordingOutcome } from "./budget/recordingPolicy";
import { StreamGuard } from "./budget/streamGuard";
import { createCancellation } from "./cancellation/createCancellation";
import { costAmount } from "./cost/costAmount";
import type { CostModel } from "./cost/costModel";
import { formatRequestError } from "./errors/formatRequestError";
import { formatFooter } from "./format/footer";
import { formatNoModel } from "./format/formatNoModel";
import { formatRefusal } from "./format/formatRefusal";
import { formatStopped } from "./format/formatStopped";
import { formatPaceWarning, formatWarning } from "./format/warnings";
import { buildMessages } from "./messages/buildMessages";
import { resolveModel } from "./models/resolveModel";
import type { ModelResolution } from "./models/resolveModel";
import type {
  BudgetUnit,
  Cost,
  HistoryTurn,
  ResultMetadata,
  StoppedReason,
  SubjectName,
} from "./types";

export interface ChatHandlerRequest {
  readonly prompt: string;
  readonly history: readonly HistoryTurn[];
  readonly model: ModelPort;
  readonly command?: string;
  /** Limits which history is sent: only this subject's, or none. Without it all history is sent. */
  readonly historyScope?: { readonly subject: SubjectName; readonly includeHistory?: boolean };
  readonly references?: readonly PromptReference[];
  readonly availability?: "available" | "unavailable";
}

export interface Deps {
  readonly selector: ModelSelectorPort;
  readonly output: ChatOutputPort;
  readonly signal: CancellationSignal;
  readonly referenceReader: ReferenceReaderPort;
  readonly budget?: BudgetContext;
  /** Where usage is recorded. Needs `budget` too: the cost comes from its `CostModel`. */
  readonly recording?: RecordingContext;
  /** Appends the usage footer and warning to the reply. Needs `budget` too. */
  readonly footer?: FooterContext;
}

export interface FooterContext {
  /** `warnAtPercent` from the settings. */
  readonly warnAtPercent: number;
  /** `dailyPaceWarning` from the settings; with `budget.usedToday` it enables the pace warning. */
  readonly dailyPaceWarning?: number;
}

export interface RecordingContext {
  readonly sink: UsageSink;
  readonly clock: ClockPort;
  readonly newId: () => string;
  /** Called when recording fails; the reply and result are unaffected. */
  readonly onError?: (error: unknown) => void;
}

export interface BudgetContext {
  readonly subject: SubjectName;
  readonly costModel: CostModel;
  readonly used: Cost;
  readonly budget: Cost;
  /** Short label for the footer, e.g. `Mon`. */
  readonly resetLabel: string;
  /** Longer label for the refusal, e.g. `Mon 19 Oct`; falls back to `resetLabel`. */
  readonly resetLabelLong?: string;
  readonly extraAllowance?: Cost;
  /** What the subject used today before this request; enables the daily pace warning. */
  readonly usedToday?: Cost;
}

type OutcomeMetadata =
  | {
      readonly outcome: "completed" | "cancelled" | "noModel" | "error";
      readonly model?: string;
    }
  | {
      readonly outcome: "refused";
      readonly stopped: "precheck";
    }
  | {
      readonly outcome: "stopped";
      readonly stopped: "budget";
      readonly model: string;
    };

/**
 * With a budget context the metadata also carries the usage fields of
 * `ResultMetadata` (docs/PLAN.md §2 step 8); without one it is the plain outcome.
 */
export interface ChatHandlerResult {
  readonly metadata: OutcomeMetadata & Partial<ResultMetadata>;
}

interface Usage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cost: Cost;
}

/** What the handler learned along the way, for recording and metadata. */
interface Run {
  model?: ModelPort;
  inputTokens: number;
  guard?: StreamGuard;
  outcome?: RecordingOutcome;
}

export async function chatHandler(
  request: ChatHandlerRequest,
  deps: Deps,
): Promise<ChatHandlerResult> {
  const run: Run = { inputTokens: 0 };
  let result: ChatHandlerResult;
  try {
    result = await handle(request, deps, run);
  } catch (error) {
    await measureAndRecord(deps, run);
    throw error;
  }
  const usage = await measureAndRecord(deps, run);
  const final = withUsage(result, deps.budget, usage);
  writeFooter(deps, run, final, usage);
  return final;
}

async function handle(
  request: ChatHandlerRequest,
  deps: Deps,
  run: Run,
): Promise<ChatHandlerResult> {
  const { selector, output, signal } = deps;
  if (signal.isCancellationRequested) return result("cancelled");
  if (request.command !== undefined) {
    output.markdown(
      "Slash commands aren't available yet. Send a normal message to talk to the selected model.",
    );
    return result("error");
  }

  let resolution: ModelResolution;
  try {
    resolution = await resolveModel(request.model, selector, request.availability);
  } catch {
    return reportFailure(deps);
  }

  if (signal.isCancellationRequested) return result("cancelled");
  if (resolution.kind === "noModel") {
    output.markdown(formatNoModel());
    return result("noModel");
  }

  const model = resolution.model;
  run.model = model;
  const references: ResolvedReference[] = [];
  let skipped = false;
  for (const ref of [...(request.references ?? [])].reverse()) {
    let resolved: ResolvedReference | undefined;
    try {
      resolved = await deps.referenceReader.read(ref);
    } catch {
      if (signal.isCancellationRequested) return result("cancelled");
      output.markdown(
        "Q0T4 couldn't read an attached reference. Check that it is accessible and try again.",
      );
      return result("error");
    }
    if (signal.isCancellationRequested) return result("cancelled");
    if (resolved === undefined) skipped = true;
    else references.push(resolved);
  }
  if (skipped) {
    output.progress("Some attached references could not be included (unsupported content).");
  }
  if (signal.isCancellationRequested) return result("cancelled");
  const messages = buildMessages(request.prompt, request.history, references, request.historyScope);
  const budget = deps.budget;
  let cancellation: ReturnType<typeof createCancellation> | undefined;
  let guard: StreamGuard | undefined;
  if (budget !== undefined) {
    let decision: PreCheckResult;
    let inputCost: Cost;
    try {
      run.inputTokens = await countInput(model, messages, signal);
      const { cost } = budget.costModel.cost(model, { input: run.inputTokens, output: 0 });
      inputCost = cost;
      decision = preCheck({
        unit: budget.costModel.unit,
        used: budget.used,
        input: cost,
        budget: budget.budget,
        ...(budget.extraAllowance === undefined ? {} : { extraAllowance: budget.extraAllowance }),
      });
    } catch {
      return reportFailure(deps);
    }
    if (signal.isCancellationRequested) return result("cancelled");
    if (!decision.allowed) {
      output.markdown(
        formatRefusal({
          decision,
          unit: budget.costModel.unit,
          subject: budget.subject,
          resetLabel: budget.resetLabelLong ?? budget.resetLabel,
        }),
      );
      return { metadata: { outcome: "refused", stopped: "precheck" } };
    }
    cancellation = createCancellation(signal);
    try {
      guard = new StreamGuard({
        ...budget,
        input: inputCost,
        model,
        signal,
        cancel: cancellation.cancel,
      });
      run.guard = guard;
    } catch {
      cancellation.dispose();
      return reportFailure(deps);
    }
  }
  // Once `sendRequest` is called, anything that goes wrong is recorded as a failed stream.
  try {
    let stream: AsyncIterable<string>;
    try {
      stream = await model.sendRequest(messages, cancellation?.signal ?? signal);
    } catch {
      run.outcome = "requestRejected";
      cancellation?.cancel();
      return reportFailure(deps, model);
    }
    run.outcome = "failed";

    const streamed = await forwardStream(stream, output, signal, guard, cancellation?.cancel);
    if (signal.isCancellationRequested) {
      run.outcome = "cancelled";
      return result("cancelled", model);
    }
    if (streamed.failed) return reportFailure(deps, model, streamed.hasOutput);
    if (guard?.stopped && budget !== undefined) {
      run.outcome = "budgetStopped";
      output.markdown(`${streamed.hasOutput ? "\n\n" : ""}${formatStopped(budget.subject)}`);
      return { metadata: { outcome: "stopped", stopped: "budget", model: model.name } };
    }
    run.outcome = "completed";
    return result("completed", model);
  } finally {
    cancellation?.dispose();
  }
}

const CHARGED: readonly RecordingOutcome[] = ["completed", "cancelled", "failed", "budgetStopped"];

/**
 * Runs once per request, also when the handler throws: measures what was used,
 * records it, and adds the usage fields to the metadata. A failure here never
 * changes the reply; recording failures go to the optional `onError` hook.
 */
async function measureAndRecord(deps: Deps, run: Run): Promise<Usage | undefined> {
  const { budget, recording } = deps;
  let usage: Usage | undefined;
  if (budget !== undefined) {
    try {
      const charged = run.outcome !== undefined && CHARGED.includes(run.outcome);
      const inputTokens = charged ? run.inputTokens : 0;
      const outputTokens =
        charged && run.guard !== undefined ? await run.guard.countForRecording() : 0;
      usage = {
        inputTokens,
        outputTokens,
        cost:
          charged && run.model !== undefined
            ? budget.costModel.cost(run.model, { input: inputTokens, output: outputTokens }).cost
            : zeroCost(budget.costModel.unit),
      };
      if (recording !== undefined && run.outcome !== undefined && run.model !== undefined) {
        const entry = recordingPolicy({
          outcome: run.outcome,
          subject: budget.subject,
          model: { name: run.model.name, family: run.model.family },
          inputTokens,
          outputTokens,
          costModel: budget.costModel,
          id: recording.newId(),
          at: recording.clock.now(),
          timeZone: recording.clock.timeZone(),
        });
        if (entry !== null) await recording.sink.record(entry);
      }
    } catch (error) {
      try {
        recording?.onError?.(error);
      } catch {
        // A failing error hook must not break the reply either.
      }
    }
  }
  return usage;
}

/**
 * The footer comes after the reply and recording, so a failed write never hides it.
 * It stays out of a cancelled chat, a slash command and a missing model: the footer
 * needs a resolved model, and a cancelled chat should stay silent.
 */
function writeFooter(
  deps: Deps,
  run: Run,
  result: ChatHandlerResult,
  usage: Usage | undefined,
): void {
  const { budget, footer, output } = deps;
  if (budget === undefined || footer === undefined || usage === undefined) return;
  if (run.model === undefined || result.metadata.outcome === "cancelled") return;
  const unit = budget.costModel.unit;
  const used = addCost(budget.used, usage.cost, unit);
  const answered = run.outcome !== undefined && CHARGED.includes(run.outcome);
  output.markdown(
    `\n\n${formatFooter({
      subject: budget.subject,
      unit,
      used,
      budget: budget.budget,
      resetLabel: budget.resetLabel,
      modelName: answered ? run.model.name : undefined,
    })}`,
  );
  const warning = formatWarning({
    unit,
    used,
    budget: budget.budget,
    warnAtPercent: footer.warnAtPercent,
  });
  if (warning !== null) output.markdown(`\n\n${warning}`);
  if (footer.dailyPaceWarning !== undefined && budget.usedToday !== undefined) {
    const pace = paceWarning({
      unit,
      usedToday: addCost(budget.usedToday, usage.cost, unit),
      weeklyBudget: budget.budget,
      percent: footer.dailyPaceWarning,
    });
    if (pace !== null) output.markdown(`\n\n${formatPaceWarning({ unit, pace })}`);
  }
}

/** Sums two costs in the active unit; the pre-check already rejected a missing amount. */
function addCost(a: Cost, b: Cost, unit: BudgetUnit): Cost {
  const tokens = a.tokens + b.tokens;
  return unit === "credits"
    ? { tokens, credits: costAmount(a, unit) + costAmount(b, unit) }
    : { tokens };
}

function withUsage(
  result: ChatHandlerResult,
  budget: BudgetContext | undefined,
  usage: Usage | undefined,
): ChatHandlerResult {
  if (budget === undefined || usage === undefined) return result;
  const { outcome } = result.metadata;
  const stopped: StoppedReason =
    outcome === "refused"
      ? "precheck"
      : outcome === "stopped"
        ? "budget"
        : outcome === "cancelled"
          ? "cancelled"
          : false;
  // `stopped` follows from `outcome`, which the spread cannot show the type checker.
  const metadata = {
    ...result.metadata,
    v: 1,
    subject: budget.subject,
    unit: budget.costModel.unit,
    ...usage,
    stopped,
  } as ChatHandlerResult["metadata"];
  return { metadata };
}

function zeroCost(unit: BudgetUnit): Cost {
  return unit === "credits" ? { tokens: 0, credits: 0 } : { tokens: 0 };
}

function result(
  outcome: Exclude<ChatHandlerResult["metadata"]["outcome"], "refused" | "stopped">,
  model?: ModelPort,
): ChatHandlerResult {
  return { metadata: model === undefined ? { outcome } : { outcome, model: model.name } };
}

function reportFailure(deps: Deps, model?: ModelPort, partial = false): ChatHandlerResult {
  if (deps.signal.isCancellationRequested) return result("cancelled", model);
  deps.output.markdown(`${partial ? "\n\n" : ""}${formatRequestError()}`);
  return result("error", model);
}

async function forwardStream(
  stream: AsyncIterable<string>,
  output: ChatOutputPort,
  signal: CancellationSignal,
  guard?: StreamGuard,
  cancel?: () => void,
): Promise<{ readonly failed: boolean; readonly hasOutput: boolean }> {
  let iterator: AsyncIterator<string, unknown>;
  try {
    iterator = stream[Symbol.asyncIterator]();
  } catch {
    cancel?.();
    return { failed: true, hasOutput: false };
  }

  let done = false;
  let failed = false;
  let hasOutput = false;
  try {
    // Read explicitly so output failures are not caught as model failures.
    while (!signal.isCancellationRequested) {
      let next: IteratorResult<string, unknown>;
      try {
        next = await iterator.next();
      } catch {
        failed = true;
        break;
      }
      if (next.done) {
        done = true;
        break;
      }
      if (signal.isCancellationRequested) break;
      output.markdown(next.value);
      hasOutput ||= next.value.length > 0;
      if (signal.isCancellationRequested) break;
      if (guard !== undefined) {
        try {
          if ((await guard.onChunk(next.value)) === "stop") break;
        } catch {
          failed = true;
          break;
        }
      }
    }
    if (!failed && !signal.isCancellationRequested && guard !== undefined) {
      try {
        await guard.finalCount();
      } catch {
        failed = true;
      }
    }
  } finally {
    if (failed || !done) cancel?.();
    if (!done) {
      try {
        await iterator.return?.();
      } catch {
        failed = true;
      }
    }
  }
  return { failed, hasOutput };
}
