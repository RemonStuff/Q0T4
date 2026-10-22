// Composition root: wires adapters to the core.
import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import { chatStreamOutput } from "./adapters/chatStreamOutput";
import { fileLedger } from "./adapters/fileLedger";
import { globalStateStorage } from "./adapters/globalStateStorage";
import { historyAdapter } from "./adapters/historyAdapter";
import { referenceReader } from "./adapters/referenceReader";
import { systemClock } from "./adapters/systemClock";
import { vscodeModel } from "./adapters/vscodeModel";
import { vscodeConfig } from "./adapters/vscodeConfig";
import { workspaceRepo } from "./adapters/workspaceRepo";
import { vscodeModelSelector } from "./adapters/vscodeModelSelector";
import { chatHandler } from "./core/chatHandler";
import { TokenCostModel } from "./core/cost/tokenCostModel";
import { formatLedgerError } from "./core/errors/formatLedgerError";
import { Ledger } from "./core/ledger/ledger";
import { weeklyLimitFor } from "./core/subjects/parseConfig";
import { routeRequest } from "./core/subjects/routeRequest";
import { BudgetCalendar, addDays } from "./core/time/budgetCalendar";
import { formatResetLong, formatResetShort, nextResetKey } from "./core/time/reset";
import type { Cost } from "./core/types";
import type { ClockPort } from "./ports/ClockPort";
import type { ConfigPort } from "./ports/ConfigPort";
import type { WorkspacePort } from "./ports/WorkspacePort";
import type { LedgerPort } from "./ports/LedgerPort";
import type { StoragePort } from "./ports/StoragePort";

export const PARTICIPANT_ID = "q0t4.chat";

/** The iteration-2 running totals in globalState. They were pre-release data and are dropped. */
export const LEGACY_TOTALS_KEY = "q0t4.totals";

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
  /** The ledger the participant enforces and records into. */
  readonly ledger: Ledger;
  /** `globalStorageUri.fsPath`: the ledger lives in `<ledgerRoot>/ledger/<YYYY-MM>/<sessionId>.jsonl`. */
  readonly ledgerRoot: string;
  /** `vscode.env.sessionId`, the name of this window's ledger file. */
  readonly sessionId: string;
  /** Resolves when the activation housekeeping (legacy key, pruning) has finished. */
  readonly ready: Promise<void>;
  /** Overrides the limit of the default subject, in tokens; `undefined` restores it. */
  setLimit(limit: number | undefined): void;
  /** Replaces the workspace the participant reads its repo from; `undefined` restores the real one. */
  setWorkspace(workspace: WorkspacePort | undefined): void;
}

/** `/use` accepts subjects with usage in the last 12 weeks. */
const RECENT_DAYS = 84;

export interface Q0T4Exports {
  readonly test: Q0T4TestHooks;
}

export interface RequestHandlerOptions {
  readonly ledgerPort: LedgerPort;
  readonly config: ConfigPort;
  readonly workspace: WorkspacePort;
  readonly clock?: ClockPort;
}

/** Builds the participant's request handler over a ledger and a clock. */
export function createRequestHandler({
  ledgerPort,
  config,
  workspace,
  clock = systemClock,
}: RequestHandlerOptions) {
  const requests: string[] = [];
  const calendar = new BudgetCalendar(clock, () => config.get().resetDay);
  const ledger = new Ledger(ledgerPort, clock, calendar, randomUUID, {
    onCorrupt: (count) => console.warn(`Q0T4: skipped ${count} unreadable usage ledger line(s).`),
  });
  let limitOverride: number | undefined;
  let workspaceOverride: WorkspacePort | undefined;
  const currentWorkspace: WorkspacePort = {
    currentRepo: () => (workspaceOverride ?? workspace).currentRepo(),
  };

  const handleRequest: vscode.ChatRequestHandler = async (request, chatContext, stream, token) => {
    requests.push(request.prompt);
    const settings = config.get();
    const history = historyAdapter(chatContext.history);
    const route = await routeRequest({
      prompt: request.prompt,
      command: request.command,
      history,
      workspace: currentWorkspace,
      config,
      recentSubjects: () =>
        ledger.subjectsSeen(addDays(calendar.dayKey(clock.now()), -RECENT_DAYS)),
    });
    if (route.kind === "reply") {
      stream.markdown(route.text);
      return { metadata: route.metadata };
    }
    const subject = route.subject;
    stream.progress(route.note);
    const limit = limitOverride ?? weeklyLimitFor(settings, subject);

    let used: Cost;
    let usedToday: Cost;
    try {
      [used, usedToday] = await Promise.all([
        ledger.usedThisWeek(subject),
        ledger.usedToday(subject),
      ]);
    } catch {
      // The budget is unknown, so the request is not sent.
      stream.markdown(formatLedgerError());
      return { metadata: { outcome: "error" } };
    }
    const reset = nextResetKey(calendar, clock.now());

    return chatHandler(
      {
        prompt: route.prompt,
        history,
        historyScope: { subject, includeHistory: settings.includeHistory },
        references: request.references,
        model: vscodeModel(request.model),
        // `/use` was handled by the router; any other command is not implemented yet.
        ...(request.command === undefined || request.command === "use"
          ? {}
          : { command: request.command }),
      },
      {
        selector: vscodeModelSelector,
        output: chatStreamOutput(stream),
        signal: token,
        referenceReader,
        budget: {
          subject,
          costModel: new TokenCostModel(),
          used,
          usedToday,
          budget: { tokens: limit },
          resetLabel: formatResetShort(reset),
          resetLabelLong: formatResetLong(reset),
        },
        recording: {
          sink: ledger,
          clock,
          newId: randomUUID,
          onError: (error) => console.error("Q0T4: couldn't record usage.", error),
        },
        footer: {
          warnAtPercent: settings.warnAtPercent,
          dailyPaceWarning: settings.dailyPaceWarning,
        },
      },
    );
  };

  return {
    handleRequest,
    requests,
    ledger,
    setLimit(limit: number | undefined) {
      limitOverride = limit;
    },
    setWorkspace(next: WorkspacePort | undefined) {
      workspaceOverride = next;
    },
  };
}

/**
 * Activation housekeeping: drops the iteration-2 totals key and prunes ledger
 * months older than 13 months. Failures are reported, never thrown.
 */
export async function housekeeping(ledger: Ledger, storage: StoragePort): Promise<void> {
  try {
    if (storage.keys().includes(LEGACY_TOTALS_KEY)) await storage.set(LEGACY_TOTALS_KEY, undefined);
  } catch (error) {
    console.error("Q0T4: couldn't remove the old usage totals.", error);
  }
  try {
    const { failed } = await ledger.prune();
    if (failed.length > 0)
      console.warn(`Q0T4: couldn't remove old ledger months: ${failed.join(", ")}.`);
  } catch (error) {
    console.error("Q0T4: couldn't prune the usage ledger.", error);
  }
}

export function activate(context: vscode.ExtensionContext): Q0T4Exports {
  const storage = globalStateStorage(context.globalState);
  const ledgerRoot = context.globalStorageUri.fsPath;
  const sessionId = vscode.env.sessionId;
  const config = vscodeConfig((warnings) =>
    vscode.window.showWarningMessage(`Q0T4 settings: ${warnings.join(" ")}`),
  );
  const { handleRequest, requests, ledger, setLimit, setWorkspace } = createRequestHandler({
    ledgerPort: fileLedger(ledgerRoot, sessionId),
    config,
    workspace: workspaceRepo(),
  });
  const ready = housekeeping(ledger, storage);

  const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, handleRequest);
  participant.iconPath = new vscode.ThemeIcon("pulse");
  context.subscriptions.push(participant);

  return {
    test: {
      handleRequest,
      requests,
      storage,
      ledger,
      ledgerRoot,
      sessionId,
      ready,
      setLimit,
      setWorkspace,
    },
  };
}

export function deactivate(): void {}
