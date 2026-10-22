import type { ChatMessage, HistoryTurn } from "../types";
import { stripFooter } from "./stripFooter";
import type { ResolvedReference } from "../../ports/ReferenceReaderPort";

export function buildMessages(
  prompt: string,
  history: readonly HistoryTurn[],
  references: readonly ResolvedReference[] = [],
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  let pendingPrompt: string | undefined;

  for (const turn of history) {
    if (turn.kind === "request") {
      pendingPrompt = turn.prompt;
    } else {
      const reply = stripFooter(turn.text);
      if (pendingPrompt !== undefined && reply.length > 0) {
        messages.push({ role: "user", text: pendingPrompt }, { role: "assistant", text: reply });
      }
      pendingPrompt = undefined;
    }
  }

  if (references.length > 0) {
    messages.push({ role: "user", text: references.map(referenceBlock).join("\n\n") });
  }
  messages.push({ role: "user", text: prompt });
  return messages;
}

function referenceBlock({ label, text }: ResolvedReference): string {
  let fence = "```";
  for (const run of text.matchAll(/`+/g)) {
    if (run[0].length >= fence.length) fence = "`".repeat(run[0].length + 1);
  }
  return `${label}\n${fence}\n${text}\n${fence}`;
}
