import type { ChatMessage } from "../../src/core/types";
import type { CancellationSignal } from "../../src/ports/CancellationSignal";
import type { ModelPort } from "../../src/ports/ModelPort";
import type { ModelSelector, ModelSelectorPort } from "../../src/ports/ModelSelectorPort";

export interface FakeModelOptions {
  readonly id?: string;
  readonly name?: string;
  readonly family?: string;
  readonly vendor?: string;
  readonly maxInputTokens?: number;
  /** The reply, streamed one chunk at a time. */
  readonly chunks?: readonly string[];
  /** Replaces the default `ceil(chars / 4)` tokenizer. */
  readonly countTokens?: (text: string) => number;
  /** `sendRequest` rejects with this, before anything streams. */
  readonly failBeforeFirstChunk?: Error;
  /** The stream throws `error` after yielding `after` chunks. */
  readonly failAfterChunk?: { readonly after: number; readonly error: Error };
}

/** A scripted language model with a deterministic tokenizer. */
export class FakeModel implements ModelPort {
  readonly id: string;
  readonly name: string;
  readonly family: string;
  readonly vendor: string;
  readonly maxInputTokens: number;
  readonly calls = {
    sendRequest: [] as (readonly ChatMessage[])[],
    countTokens: [] as (string | ChatMessage)[],
  };

  constructor(private readonly options: FakeModelOptions = {}) {
    this.id = options.id ?? "fake-model";
    this.name = options.name ?? "Fake Model";
    this.family = options.family ?? "fake-family";
    this.vendor = options.vendor ?? "q0t4-test";
    this.maxInputTokens = options.maxInputTokens ?? 128_000;
  }

  async sendRequest(
    messages: readonly ChatMessage[],
    signal: CancellationSignal,
  ): Promise<AsyncIterable<string>> {
    this.calls.sendRequest.push(messages);
    if (this.options.failBeforeFirstChunk) throw this.options.failBeforeFirstChunk;
    return this.stream(signal);
  }

  async countTokens(input: string | ChatMessage): Promise<number> {
    this.calls.countTokens.push(input);
    const text = typeof input === "string" ? input : input.text;
    return this.options.countTokens ? this.options.countTokens(text) : Math.ceil(text.length / 4);
  }

  private async *stream(signal: CancellationSignal): AsyncGenerator<string> {
    const { chunks = [], failAfterChunk } = this.options;
    for (const [index, chunk] of chunks.entries()) {
      if (failAfterChunk && index === failAfterChunk.after) throw failAfterChunk.error;
      if (signal.isCancellationRequested) return;
      yield chunk;
    }
    if (failAfterChunk && failAfterChunk.after >= chunks.length) throw failAfterChunk.error;
  }
}

/** Selects from a fixed list of models by vendor, family and id. */
export class FakeModelSelector implements ModelSelectorPort {
  constructor(private readonly models: readonly ModelPort[]) {}

  async select(selector: ModelSelector): Promise<readonly ModelPort[]> {
    return this.models.filter(
      (m) =>
        (selector.vendor === undefined || m.vendor === selector.vendor) &&
        (selector.family === undefined || m.family === selector.family) &&
        (selector.id === undefined || m.id === selector.id),
    );
  }
}
