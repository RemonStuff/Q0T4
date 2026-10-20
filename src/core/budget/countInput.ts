import type { CancellationSignal } from "../../ports/CancellationSignal";
import type { Disposable } from "../../ports/Disposable";
import type { ModelPort } from "../../ports/ModelPort";
import { Cancelled } from "../errors/cancelled";
import { CountError } from "../errors/countError";
import type { ChatMessage } from "../types";

export async function countInput(
  model: ModelPort,
  messages: readonly ChatMessage[],
  signal: CancellationSignal,
): Promise<number> {
  if (signal.isCancellationRequested) throw new Cancelled();
  if (messages.length === 0) return 0;

  let subscription: Disposable | undefined;
  try {
    const cancelled = new Promise<never>((_, reject) => {
      subscription = signal.onCancellationRequested(() => reject(new Cancelled()));
    });
    const counting = Promise.all(
      messages.map(async (message) => {
        if (signal.isCancellationRequested) throw new Cancelled();
        return model.countTokens(message, signal);
      }),
    );
    const counts = await Promise.race([counting, cancelled]);
    if (signal.isCancellationRequested) throw new Cancelled();
    return counts.reduce((total, count) => total + count, 0);
  } catch (cause) {
    if (signal.isCancellationRequested) throw new Cancelled();
    throw new CountError(cause);
  } finally {
    subscription?.dispose();
  }
}
