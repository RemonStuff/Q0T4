import type { CancellationSignal } from "../../ports/CancellationSignal";

export function createCancellation(parent: CancellationSignal) {
  let cancelled = parent.isCancellationRequested;
  let disposed = false;
  const listeners = new Set<() => void>();
  function cancel() {
    if (cancelled || disposed) return;
    cancelled = true;
    for (const listener of listeners) listener();
    listeners.clear();
  }
  const subscription = cancelled ? undefined : parent.onCancellationRequested(cancel);
  const signal: CancellationSignal = {
    get isCancellationRequested() {
      return cancelled || (!disposed && parent.isCancellationRequested);
    },
    onCancellationRequested(listener) {
      listeners.add(listener);
      return {
        dispose: () => {
          listeners.delete(listener);
        },
      };
    },
  };
  return {
    signal,
    cancel,
    dispose() {
      if (disposed) return;
      disposed = true;
      subscription?.dispose();
      listeners.clear();
    },
  };
}
