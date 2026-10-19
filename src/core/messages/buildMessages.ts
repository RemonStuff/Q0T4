import type { ChatMessage, HistoryTurn } from "../types";

export function buildMessages(prompt: string, history: readonly HistoryTurn[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  let pendingPrompt: string | undefined;

  for (const turn of history) {
    if (turn.kind === "request") {
      pendingPrompt = turn.prompt;
    } else {
      if (pendingPrompt !== undefined && turn.text.length > 0) {
        messages.push(
          { role: "user", text: pendingPrompt },
          { role: "assistant", text: turn.text },
        );
      }
      pendingPrompt = undefined;
    }
  }

  messages.push({ role: "user", text: prompt });
  return messages;
}
