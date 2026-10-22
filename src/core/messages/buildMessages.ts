import type { ChatMessage, HistoryTurn, SubjectName } from "../types";
import { filterHistoryBySubject } from "./filterHistory";
import { stripFooter } from "./stripFooter";
import type { ResolvedReference } from "../../ports/ReferenceReaderPort";

export interface BuildMessagesOptions {
  /** Send only history charged to this subject. Without it, all history is sent. */
  readonly subject?: SubjectName;
  /** `false` sends no history at all (references and the prompt are still sent). */
  readonly includeHistory?: boolean;
}

export function buildMessages(
  prompt: string,
  fullHistory: readonly HistoryTurn[],
  references: readonly ResolvedReference[] = [],
  { subject, includeHistory = true }: BuildMessagesOptions = {},
): ChatMessage[] {
  const history = !includeHistory
    ? []
    : subject === undefined
      ? fullHistory
      : filterHistoryBySubject(fullHistory, subject);
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
