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
import { preCheck } from "./budget/preCheck";
import type { PreCheckResult } from "./budget/preCheck";
import { recordingPolicy } from "./budget/recordingPolicy";
import type { RecordingOutcome } from "./budget/recordingPolicy";
import { StreamGuard } from "./budget/streamGuard";
import { createCancellation } from "./cancellation/createCancellation";
import type { CostModel } from "./cost/costModel";
import { formatRequestError } from "./errors/formatRequestError";
import { formatNoModel } from "./format/formatNoModel";
import { formatRefusal } from "./format/formatRefusal";
import { formatStopped } from "./format/formatStopped";
import { buildMessages } from "./messages/buildMessages";
import { resolveModel } from "./models/resolveModel";
import type { ModelResolution } from "./models/resolveModel";
import type { Cost, HistoryTurn, SubjectName } from "./types";

export interface ChatHandlerRequest {
  readonly prompt: string;
  readonly history: readonly HistoryTurn[];
  readonly model: ModelPort;
  readonly command?: string;
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
  readonly resetLabel: string;
  readonly extraAllowance?: Cost;
}

export interface ChatHandlerResult {
  readonly metadata:
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
}

export async function chatHandler(
  request: ChatHandlerRequest,
  deps: Deps,
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
  const messages = buildMessages(request.prompt, request.history, references);
  const budget = deps.budget;
  let cancellation: ReturnType<typeof createCancellation> | undefined;
  let guard: StreamGuard | undefined;
  let inputTokens = 0;
  if (budget !== undefined) {
    let decision: PreCheckResult;
    let inputCost: Cost;
    try {
      inputTokens = await countInput(model, messages, signal);
      const { cost } = budget.costModel.cost(model, { input: inputTokens, output: 0 });
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
          resetLabel: budget.resetLabel,
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
    } catch {
      cancellation.dispose();
      return reportFailure(deps);
    }
  }
  // Once `sendRequest` is called, anything that goes wrong is recorded as a failed stream.
  let outcome: RecordingOutcome | undefined;
  try {
    let stream: AsyncIterable<string>;
    try {
      stream = await model.sendRequest(messages, cancellation?.signal ?? signal);
    } catch {
      outcome = "requestRejected";
      cancellation?.cancel();
      return reportFailure(deps, model);
    }
    outcome = "failed";

    const streamed = await forwardStream(stream, output, signal, guard, cancellation?.cancel);
    if (signal.isCancellationRequested) {
      outcome = "cancelled";
      return result("cancelled", model);
    }
    if (streamed.failed) return reportFailure(deps, model, streamed.hasOutput);
    if (guard?.stopped && budget !== undefined) {
      outcome = "budgetStopped";
      output.markdown(`${streamed.hasOutput ? "\n\n" : ""}${formatStopped(budget.subject)}`);
      return { metadata: { outcome: "stopped", stopped: "budget", model: model.name } };
    }
    outcome = "completed";
    return result("completed", model);
  } finally {
    cancellation?.dispose();
    if (outcome !== undefined && budget !== undefined && deps.recording !== undefined) {
      await recordUsage({ recording: deps.recording, budget, model, guard, inputTokens, outcome });
    }
  }
}

interface RecordUsage {
  readonly recording: RecordingContext;
  readonly budget: BudgetContext;
  readonly model: ModelPort;
  readonly guard: StreamGuard | undefined;
  readonly inputTokens: number;
  readonly outcome: RecordingOutcome;
}

/** Runs in `finally`: always records, and a failure here never changes the reply or result. */
async function recordUsage(usage: RecordUsage): Promise<void> {
  const { recording, budget, model, guard, inputTokens, outcome } = usage;
  try {
    const outputTokens =
      guard === undefined || outcome === "requestRejected" ? 0 : await guard.countForRecording();
    const at = recording.clock.now();
    const entry = recordingPolicy({
      outcome,
      subject: budget.subject,
      model: { name: model.name, family: model.family },
      inputTokens,
      outputTokens,
      costModel: budget.costModel,
      id: recording.newId(),
      at,
      timeZone: recording.clock.timeZone(),
    });
    if (entry === null) return;
    await recording.sink.record(entry);
  } catch (error) {
    try {
      recording.onError?.(error);
    } catch {
      // A failing error hook must not break the reply either.
    }
  }
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
