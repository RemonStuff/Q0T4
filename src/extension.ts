// Composition root: wires adapters to the core.
import * as vscode from "vscode";
import { chatStreamOutput } from "./adapters/chatStreamOutput";
import { handleStubRequest } from "./core/stub";

export const PARTICIPANT_ID = "q0t4.chat";

/**
 * Hooks for integration tests. VS Code has no API to invoke a chat
 * participant, so tests call the handler through these exports. The public
 * API for other extensions (#63) will sit next to `test`, not inside it.
 */
export interface Q0T4TestHooks {
  readonly handleRequest: vscode.ChatRequestHandler;
  /** Prompts the participant has handled, in order, so UI-driven tests can see them. */
  readonly requests: readonly string[];
}

export interface Q0T4Exports {
  readonly test: Q0T4TestHooks;
}

export function activate(context: vscode.ExtensionContext): Q0T4Exports {
  const requests: string[] = [];
  const handleRequest: vscode.ChatRequestHandler = (request, _context, stream) => {
    requests.push(request.prompt);
    handleStubRequest(chatStreamOutput(stream));
  };

  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handleRequest);
  participant.iconPath = new vscode.ThemeIcon("pulse");
  context.subscriptions.push(participant);

  return { test: { handleRequest, requests } };
}

export function deactivate(): void {}
