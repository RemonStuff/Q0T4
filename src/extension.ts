// Composition root: wires adapters to the core.
import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import { chatStreamOutput } from "./adapters/chatStreamOutput";
import { fileLedger } from "./adapters/fileLedger";
import { githubDocsPriceSource } from "./adapters/githubDocsPriceSource";
import { priceTableFile } from "./adapters/priceTableFile";
import { outputChannelLog } from "./adapters/outputChannelLog";
import { Diagnostics } from "./core/diagnostics/diagnostics";
import { globalStateStorage } from "./adapters/globalStateStorage";
import { historyAdapter } from "./adapters/historyAdapter";
import { referenceReader } from "./adapters/referenceReader";
import { systemClock } from "./adapters/systemClock";
import { vscodeModel } from "./adapters/vscodeModel";
import { vscodeUi } from "./adapters/vscodeUi";
import { vscodeConfig } from "./adapters/vscodeConfig";
import { workspaceRepo } from "./adapters/workspaceRepo";
import { vscodeModelSelector } from "./adapters/vscodeModelSelector";
import { chatHandler } from "./core/chatHandler";
import { limitCost } from "./core/cost/limitCost";
import { formatLedgerError } from "./core/errors/formatLedgerError";
import { Ledger } from "./core/ledger/ledger";
import { costModelFor, refuseWithoutPrices } from "./core/pricing/costModelFor";
import type { PriceInfo } from "./core/format/statusTable";
import { PriceRefresher } from "./core/pricing/priceRefresher";
import { COMMAND_IDS, createCommands } from "./core/commands";
import type { Commands } from "./core/commands";
import { StatusBarController } from "./core/statusBar";
import type { TimerPort } from "./core/statusBar";
import { buildStatusRows } from "./core/statusRows";
import { weeklyLimitFor } from "./core/subjects/parseConfig";
import { subjectItems } from "./core/subjects/subjectItems";
import { threadSubject } from "./core/subjects/threadSubject";
import { repoSubject } from "./core/subjects/repoIdentifier";
import { routeRequest } from "./core/subjects/routeRequest";
import { BudgetCalendar, addDays } from "./core/time/budgetCalendar";
import { formatResetLong, formatResetShort, nextResetKey } from "./core/time/reset";
import type { Cost } from "./core/types";
import type { ClockPort } from "./ports/ClockPort";
import type { ConfigPort } from "./ports/ConfigPort";
import type { ModelSelectorPort } from "./ports/ModelSelectorPort";
import type { StatusBarState, UiPort } from "./ports/UiPort";
import type { WorkspacePort } from "./ports/WorkspacePort";
import type { LedgerPort } from "./ports/LedgerPort";
import type { LogPort } from "./ports/LogPort";
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
  /** Answers the modal confirmation of `q0t4.resetWeek`; `undefined` restores the real dialog. */
  setConfirm(answer: ((message: string) => Promise<boolean>) | undefined): void;
  /** The status bar item: what it shows now (VS Code can't read it back), and a forced refresh. */
  readonly statusBar: { state(): StatusBarState | undefined; refresh(): Promise<void> };
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
  /** The status bar item and the palette commands. Without `ui` and `storage` there are none. */
  readonly ui?: Pick<
    UiPort,
    "setStatusBar" | "confirm" | "openSettings" | "showInfo" | "showWarning" | "showDocument"
  >;
  readonly storage?: StoragePort;
  readonly timers?: TimerPort;
  /** Where failures outside the model go. Without it they are only logged to the console. */
  readonly diagnostics?: Diagnostics;
  /** Fetches model prices for the refresh command. Credits mode starts it (#53). */
  readonly prices?: PriceRefresher;
  /** For the command that lists Copilot models into the log. */
  readonly models?: ModelSelectorPort;
  readonly log?: LogPort;
}

const consoleLog: LogPort = {
  info: (message) => console.info(`Q0T4: ${message}`),
  warn: (message) => console.warn(`Q0T4: ${message}`),
  error: (message, error) => console.error(`Q0T4: ${message}`, error),
};

const realTimers: TimerPort = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Builds the participant's request handler over a ledger and a clock. */
export function createRequestHandler({
  ledgerPort,
  config,
  workspace,
  clock = systemClock,
  ui,
  storage,
  timers = realTimers,
  diagnostics = new Diagnostics(consoleLog, () => undefined),
  prices,
  models,
  log,
}: RequestHandlerOptions) {
  const requests: string[] = [];
  const calendar = new BudgetCalendar(
    clock,
    () => config.get().resetDay,
    () => config.get().cycleStartDay,
  );
  const ledger = new Ledger(ledgerPort, clock, calendar, randomUUID, {
    onCorrupt: (count) => diagnostics.ledgerSkipped(count),
  });
  let limitOverride: number | undefined;
  let workspaceOverride: WorkspacePort | undefined;
  const currentWorkspace: WorkspacePort = {
    currentRepo: () => (workspaceOverride ?? workspace).currentRepo(),
  };

  /** One row per known subject: configured, used this week, or the current repo. */
  const statusRows = async () =>
    buildStatusRows({
      config: config.get(),
      ledger,
      weekStart: calendar.weekWindow(clock.now()).start,
      currentRepo: repoSubject(await currentWorkspace.currentRepo().catch(() => undefined)),
      limitOverride,
    });

  const statusBar =
    ui !== undefined && storage !== undefined
      ? new StatusBarController({
          ui,
          ledger,
          calendar,
          clock,
          config,
          workspace: currentWorkspace,
          storage,
          timers,
          limitOverride: () => limitOverride,
        })
      : undefined;

  const commands: Commands | undefined =
    ui !== undefined && statusBar !== undefined
      ? createCommands({
          ui,
          ledger,
          calendar,
          clock,
          config,
          workspace: currentWorkspace,
          statusBar,
          limitOverride: () => limitOverride,
          ...(prices === undefined ? {} : { prices, priceInfo: () => prices.info() }),
          ...(models === undefined ? {} : { models }),
          ...(log === undefined ? {} : { log }),
        })
      : undefined;

  const handleRequest: vscode.ChatRequestHandler = async (request, chatContext, stream, token) => {
    requests.push(request.prompt);
    const settings = config.get();
    const history = historyAdapter(chatContext.history);
    if (request.command === "subjects") {
      // Settings and the ledger only: no subject is chosen and no model is called.
      return chatHandler(
        { prompt: request.prompt, history, model: vscodeModel(request.model), command: "subjects" },
        {
          selector: vscodeModelSelector,
          output: chatStreamOutput(stream),
          signal: token,
          referenceReader,
          subjects: {
            unit: settings.budgetUnit,
            defaultLimit: limitCost(settings.budgetUnit, limitOverride ?? settings.defaultLimit),
            rows: async () =>
              subjectItems({
                config: settings,
                // An unreadable ledger only means fewer suggestions, as for `/use`.
                seen: await ledger
                  .subjectsSeen(addDays(calendar.dayKey(clock.now()), -RECENT_DAYS))
                  .catch(() => []),
                currentRepo: repoSubject(
                  await currentWorkspace.currentRepo().catch(() => undefined),
                ),
                thread: threadSubject(history),
                limitOverride,
              }),
          },
        },
      );
    }
    if (request.command === "status") {
      // Reads the ledger only: no subject is chosen and no model is called.
      const reset = nextResetKey(calendar, clock.now());
      return chatHandler(
        { prompt: request.prompt, history, model: vscodeModel(request.model), command: "status" },
        {
          selector: vscodeModelSelector,
          output: chatStreamOutput(stream),
          signal: token,
          referenceReader,
          status: {
            unit: settings.budgetUnit,
            resetLabelLong: formatResetLong(reset),
            warnAtPercent: settings.warnAtPercent,
            rows: statusRows,
            ...(settings.budgetUnit === "credits" && prices?.info() !== undefined
              ? { prices: prices.info() as PriceInfo }
              : {}),
          },
        },
      );
    }
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
      if ("subject" in route.metadata) void statusBar?.afterRequest(route.metadata.subject);
      return { metadata: route.metadata };
    }
    const subject = route.subject;
    stream.progress(route.note);
    // Credits need prices; the first run waits for the first fetch (docs/PLAN.md §9.1).
    if (settings.budgetUnit === "credits") await prices?.ensureStarted();
    const costSetup = costModelFor(settings, prices);
    if (costSetup.kind === "noPrices") return refuseWithoutPrices(chatStreamOutput(stream));
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

    try {
      return await chatHandler(
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
            costModel: costSetup.costModel,
            used,
            usedToday,
            budget: limitCost(settings.budgetUnit, limit),
            notices: costSetup.notices,
            resetLabel: formatResetShort(reset),
            resetLabelLong: formatResetLong(reset),
          },
          recording: {
            sink: ledger,
            clock,
            newId: randomUUID,
            onError: (error) => diagnostics.recordFailed(error),
          },
          footer: {
            warnAtPercent: settings.warnAtPercent,
            dailyPaceWarning: settings.dailyPaceWarning,
          },
        },
      );
    } finally {
      // Also after a refusal, an error or a thrown failure: the ledger may have changed.
      void statusBar?.afterRequest(subject);
    }
  };

  return {
    handleRequest,
    requests,
    ledger,
    statusBar,
    commands,
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
  const channel = vscode.window.createOutputChannel("Q0T4");
  context.subscriptions.push(channel);
  const ui = vscodeUi({ statusBarCommand: COMMAND_IDS.showUsage });
  const outputLog = outputChannelLog(channel);
  const diagnostics = new Diagnostics(outputLog, (text) => ui.showWarning(text));
  const config = vscodeConfig((warnings) => diagnostics.configWarnings(warnings));
  // Integration tests answer the modal confirmation through `setConfirm`.
  let confirmOverride: ((message: string) => Promise<boolean>) | undefined;
  const uiPort: UiPort = {
    ...ui,
    confirm: (message) => (confirmOverride ?? ui.confirm)(message),
  };
  // Prices are only fetched on request until credits mode starts the refresher (#53).
  const prices = new PriceRefresher({
    source: githubDocsPriceSource(),
    store: priceTableFile(ledgerRoot),
    clock: systemClock,
    timers: realTimers,
    diagnostics,
    settings: () => config.get(),
  });
  const { handleRequest, requests, ledger, setLimit, setWorkspace, statusBar, commands } =
    createRequestHandler({
      ledgerPort: fileLedger(ledgerRoot, sessionId),
      config,
      workspace: workspaceRepo(),
      ui: uiPort,
      storage,
      diagnostics,
      prices,
      models: vscodeModelSelector,
      log: outputLog,
    });
  // `ui` and `storage` are given, so both exist.
  const bar = statusBar as StatusBarController;
  const palette = commands as Commands;
  const ready = housekeeping(ledger, storage).then(() => bar.start());
  context.subscriptions.push(
    ui,
    bar,
    vscode.commands.registerCommand(COMMAND_IDS.showUsage, () => palette.showUsage()),
    vscode.commands.registerCommand(COMMAND_IDS.resetWeek, () => palette.resetWeek()),
    vscode.commands.registerCommand(COMMAND_IDS.editSubjects, () => palette.editSubjects()),
    vscode.commands.registerCommand(COMMAND_IDS.refreshPrices, () => palette.refreshPrices()),
    vscode.commands.registerCommand(COMMAND_IDS.logModels, async () => {
      await palette.logModels();
      channel.show(true);
    }),
    { dispose: () => prices.dispose() },
    vscode.window.onDidChangeActiveTextEditor(() => void bar.refresh()),
    vscode.workspace.onDidChangeWorkspaceFolders(() => void bar.refresh()),
  );

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
      statusBar: { state: () => ui.lastStatusBar(), refresh: () => bar.refresh() },
      setConfirm(answer) {
        confirmOverride = answer;
      },
    },
  };
}

export function deactivate(): void {}
