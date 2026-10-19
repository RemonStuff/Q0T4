import * as vscode from "vscode";
import type { HistoryTurn } from "../core/types";

export function historyAdapter(history: vscode.ChatContext["history"]): HistoryTurn[] {
  return history.map((turn): HistoryTurn => {
    if ("prompt" in turn) {
      return {
        kind: "request",
        prompt: turn.prompt,
        ...(turn.command === undefined ? {} : { command: turn.command }),
      };
    }
    const metadata: unknown = turn.result.metadata;
    return {
      kind: "response",
      text: turn.response
        .filter((part) => part instanceof vscode.ChatResponseMarkdownPart)
        .map((part) => part.value.value)
        .join(""),
      ...(metadata === undefined ? {} : { metadata }),
    };
  });
}
