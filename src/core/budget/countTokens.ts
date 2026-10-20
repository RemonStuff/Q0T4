import type { CancellationSignal } from "../../ports/CancellationSignal";
import type { Disposable } from "../../ports/Disposable";
import type { ModelPort } from "../../ports/ModelPort";
import { Cancelled } from "../errors/cancelled";
import { CountError } from "../errors/countError";
import type { ChatMessage } from "../types";

export async function countTokens(
  model: ModelPort,
  inputs: readonly (ChatMessage | string)[],
  signal: CancellationSignal,
  kind: "input" | "output",
): Promise<number> {
  if (signal.isCancellationRequested) throw new Cancelled(kind);
  if (inputs.length === 0) return 0;

  let subscription: Disposable | undefined;
  try {
    const cancelled = new Promise<never>((_, reject) => {
      subscription = signal.onCancellationRequested(() => reject(new Cancelled(kind)));
    });
    const counting = Promise.all(
      inputs.map(async (input) => {
        if (signal.isCancellationRequested) throw new Cancelled(kind);
        return model.countTokens(input, signal);
      }),
    );
    const counts = await Promise.race([counting, cancelled]);
    if (signal.isCancellationRequested) throw new Cancelled(kind);
    return counts.reduce((total, count) => total + count, 0);
  } catch (cause) {
    if (signal.isCancellationRequested) throw new Cancelled(kind);
    throw new CountError(cause, kind);
  } finally {
    subscription?.dispose();
  }
}
