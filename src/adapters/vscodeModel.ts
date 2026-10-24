import * as vscode from "vscode";
import type { ChatMessage } from "../core/types";
import type { CancellationSignal } from "../ports/CancellationSignal";
import type { ModelPort } from "../ports/ModelPort";
import { mapModelError } from "./errorMapping";

function message(input: ChatMessage): vscode.LanguageModelChatMessage {
  return input.role === "user"
    ? vscode.LanguageModelChatMessage.User(input.text)
    : vscode.LanguageModelChatMessage.Assistant(input.text);
}

function linkCancellation(signal?: CancellationSignal) {
  const source = new vscode.CancellationTokenSource();
  const subscription = signal?.onCancellationRequested(() => source.cancel());
  if (signal?.isCancellationRequested) source.cancel();
  let disposed = false;
  return {
    token: source.token,
    cancel() {
      if (!disposed) source.cancel();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      subscription?.dispose();
      source.dispose();
    },
  };
}

function textStream(
  iterator: AsyncIterator<string, unknown>,
  cancellation: ReturnType<typeof linkCancellation>,
): AsyncIterableIterator<string> {
  let finished = false;
  let closed = false;
  // Unlike a generator, this can clean up when return() precedes the first next().
  return {
    [Symbol.asyncIterator]() {
      return this;
    },
    async next() {
      if (finished) return { done: true, value: undefined };
      try {
        const next = await iterator.next();
        if (next.done) {
          finished = closed = true;
          cancellation.dispose();
        }
        return next;
      } catch (error) {
        finished = true;
        cancellation.cancel();
        cancellation.dispose();
        throw mapModelError(error);
      }
    },
    async return() {
      if (closed) return { done: true, value: undefined };
      finished = closed = true;
      cancellation.cancel();
      try {
        await iterator.return?.();
        return { done: true, value: undefined };
      } finally {
        cancellation.dispose();
      }
    },
  };
}

export function vscodeModel(model: vscode.LanguageModelChat): ModelPort {
  return {
    name: model.name,
    id: model.id,
    family: model.family,
    vendor: model.vendor,
    maxInputTokens: model.maxInputTokens,
    async sendRequest(messages, signal) {
      const converted = messages.map(message);
      const cancellation = linkCancellation(signal);
      try {
        const response = await model.sendRequest(converted, {}, cancellation.token);
        return textStream(response.text[Symbol.asyncIterator](), cancellation);
      } catch (error) {
        cancellation.cancel();
        cancellation.dispose();
        throw mapModelError(error);
      }
    },
    async countTokens(input, signal) {
      const converted = typeof input === "string" ? input : message(input);
      const cancellation = linkCancellation(signal);
      try {
        return await model.countTokens(converted, cancellation.token);
      } finally {
        cancellation.dispose();
      }
    },
  };
}
