import type { CancellationSignal } from "../ports/CancellationSignal";
import type { ChatOutputPort } from "../ports/ChatOutputPort";
import type { ModelPort } from "../ports/ModelPort";
import type { ModelSelectorPort } from "../ports/ModelSelectorPort";
import type {
  PromptReference,
  ReferenceReaderPort,
  ResolvedReference,
} from "../ports/ReferenceReaderPort";
import { formatRequestError } from "./errors/formatRequestError";
import { formatNoModel } from "./format/formatNoModel";
import { buildMessages } from "./messages/buildMessages";
import { resolveModel } from "./models/resolveModel";
import type { ModelResolution } from "./models/resolveModel";
import type { HistoryTurn } from "./types";

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
}

export interface ChatHandlerResult {
  readonly metadata: {
    readonly outcome: "completed" | "cancelled" | "noModel" | "error";
    readonly model?: string;
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
  let stream: AsyncIterable<string>;
  try {
    stream = await model.sendRequest(messages, signal);
  } catch {
    return reportFailure(deps, model);
  }

  const streamed = await forwardStream(stream, output, signal);
  if (signal.isCancellationRequested) return result("cancelled", model);
  if (streamed.failed) return reportFailure(deps, model, streamed.hasOutput);
  return result("completed", model);
}

function result(
  outcome: ChatHandlerResult["metadata"]["outcome"],
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
): Promise<{ readonly failed: boolean; readonly hasOutput: boolean }> {
  let iterator: AsyncIterator<string, unknown>;
  try {
    iterator = stream[Symbol.asyncIterator]();
  } catch {
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
    }
  } finally {
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
