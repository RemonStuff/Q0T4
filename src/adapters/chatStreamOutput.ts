import type * as vscode from "vscode";
import type { ChatOutputPort } from "../ports/ChatOutputPort";

/** `ChatOutputPort` over a chat participant's `ChatResponseStream`. */
export function chatStreamOutput(stream: vscode.ChatResponseStream): ChatOutputPort {
  return {
    markdown: (text) => stream.markdown(text),
    progress: (text) => stream.progress(text),
  };
}
