import type { Disposable } from "./Disposable";

/**
 * Cancellation as core sees it. `vscode.CancellationToken` satisfies this
 * structurally, so adapters pass the chat's token straight through.
 */
export interface CancellationSignal {
  readonly isCancellationRequested: boolean;
  onCancellationRequested(listener: () => void): Disposable;
}
