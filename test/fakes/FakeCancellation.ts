import type { CancellationSignal } from "../../src/ports/CancellationSignal";
import type { Disposable } from "../../src/ports/Disposable";

/** A cancellation signal the test triggers with `cancel()`. */
export class FakeCancellation implements CancellationSignal {
  private cancelled = false;
  private readonly listeners = new Set<() => void>();

  get isCancellationRequested(): boolean {
    return this.cancelled;
  }

  onCancellationRequested(listener: () => void): Disposable {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    for (const listener of this.listeners) listener();
  }
}
