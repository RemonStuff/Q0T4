import type { ChatMessage } from "../core/types";
import type { CancellationSignal } from "./CancellationSignal";

/**
 * A language model as core sees it. Implemented by `adapters/vscodeModel`
 * over `vscode.LanguageModelChat` (#11).
 */
export interface ModelPort {
  /** Display name shown in the model picker, e.g. "GPT-5 mini". */
  readonly name: string;
  readonly id: string;
  readonly family: string;
  readonly vendor: string;
  readonly maxInputTokens: number;
  /** Streams the reply as text parts. Rejects if the request can't be made. */
  sendRequest(
    messages: readonly ChatMessage[],
    signal: CancellationSignal,
  ): Promise<AsyncIterable<string>>;
  countTokens(input: string | ChatMessage, signal?: CancellationSignal): Promise<number>;
}
