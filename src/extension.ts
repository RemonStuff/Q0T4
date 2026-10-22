// Composition root: wires adapters to the core.
import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import { chatStreamOutput } from "./adapters/chatStreamOutput";
import { globalStateStorage } from "./adapters/globalStateStorage";
import { historyAdapter } from "./adapters/historyAdapter";
import { referenceReader } from "./adapters/referenceReader";
import { systemClock } from "./adapters/systemClock";
import { vscodeModel } from "./adapters/vscodeModel";
import { vscodeModelSelector } from "./adapters/vscodeModelSelector";
import { chatHandler } from "./core/chatHandler";
import { TokenCostModel } from "./core/cost/tokenCostModel";
import { TotalsStore } from "./core/storage/totalsStore";
import {
  DEFAULT_SUBJECT,
  DEFAULT_SUBJECTS,
  DEFAULT_WARN_AT_PERCENT,
  RESET_UNAVAILABLE_LABEL,
} from "./core/subjects/defaultSubjects";
import type { ClockPort } from "./ports/ClockPort";
import type { StoragePort } from "./ports/StoragePort";

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
  /** The real `globalState` adapter, so tests can check it against VS Code. */
  readonly storage: StoragePort;
  /** The running totals the participant enforces and records into. */
  readonly store: TotalsStore;
  /** Overrides the limit of the default subject, in tokens; `undefined` restores it. */
  setLimit(limit: number | undefined): void;
}

export interface Q0T4Exports {
  readonly test: Q0T4TestHooks;
}

/** Builds the participant's request handler over the given storage and clock. */
export function createRequestHandler(storage: StoragePort, clock: ClockPort = systemClock) {
  const requests: string[] = [];
  const store = new TotalsStore(storage);
  let limitOverride: number | undefined;

  const handleRequest: vscode.ChatRequestHandler = (request, chatContext, stream, token) => {
    requests.push(request.prompt);
    const limit = limitOverride ?? DEFAULT_SUBJECTS[DEFAULT_SUBJECT]?.weeklyLimit ?? 0;
    return chatHandler(
      {
        prompt: request.prompt,
        history: historyAdapter(chatContext.history),
        references: request.references,
        model: vscodeModel(request.model),
        ...(request.command === undefined ? {} : { command: request.command }),
      },
      {
        selector: vscodeModelSelector,
        output: chatStreamOutput(stream),
        signal: token,
        referenceReader,
        budget: {
          subject: DEFAULT_SUBJECT,
          costModel: new TokenCostModel(),
          used: store.get(DEFAULT_SUBJECT),
          budget: { tokens: limit },
          resetLabel: RESET_UNAVAILABLE_LABEL,
        },
        recording: {
          sink: store,
          clock,
          newId: randomUUID,
          onError: (error) => console.error("Q0T4: couldn't record usage.", error),
        },
        footer: { warnAtPercent: DEFAULT_WARN_AT_PERCENT },
      },
    );
  };

  return {
    handleRequest,
    requests,
    store,
    setLimit(limit: number | undefined) {
      limitOverride = limit;
    },
  };
}

export function activate(context: vscode.ExtensionContext): Q0T4Exports {
  const storage = globalStateStorage(context.globalState);
  const { handleRequest, requests, store, setLimit } = createRequestHandler(storage);

  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handleRequest);
  participant.iconPath = new vscode.ThemeIcon("pulse");
  context.subscriptions.push(participant);

  return { test: { handleRequest, requests, storage, store, setLimit } };
}

export function deactivate(): void {}
