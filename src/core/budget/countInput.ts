import type { CancellationSignal } from "../../ports/CancellationSignal";
import type { ModelPort } from "../../ports/ModelPort";
import type { ChatMessage } from "../types";
import { countTokens } from "./countTokens";

export async function countInput(
  model: ModelPort,
  messages: readonly ChatMessage[],
  signal: CancellationSignal,
): Promise<number> {
  return countTokens(model, messages, signal, "input");
}
