import type { ClockPort } from "../ports/ClockPort";
import type { ConfigPort } from "../ports/ConfigPort";
import type { LogPort } from "../ports/LogPort";
import type { ModelSelectorPort } from "../ports/ModelSelectorPort";
import type { UiPort } from "../ports/UiPort";
import type { WorkspacePort } from "../ports/WorkspacePort";
import { formatStatusError } from "./errors/formatStatusError";
import { formatStatusTable } from "./format/statusTable";
import type { PriceInfo } from "./format/statusTable";
import type { PriceRefresher } from "./pricing/priceRefresher";
import { buildStatusRows } from "./statusRows";
import type { StatusLedger } from "./statusRows";
import { repoSubject } from "./subjects/repoIdentifier";
import { addDays } from "./time/budgetCalendar";
import type { BudgetCalendar } from "./time/budgetCalendar";
import { formatResetLong, nextResetKey } from "./time/reset";
import type { SubjectName } from "./types";

/** The palette commands; the same ids are declared in package.json. */
export const COMMAND_IDS = {
  showUsage: "q0t4.showUsage",
  resetWeek: "q0t4.resetWeek",
  editSubjects: "q0t4.editSubjects",
  refreshPrices: "q0t4.refreshPrices",
  logModels: "q0t4.logModels",
} as const;

/** What the commands read from and write to the ledger; `Ledger` implements it. */
export interface CommandLedger extends StatusLedger {
  markReset(subject: SubjectName): Promise<void>;
}

export interface CommandDeps {
  readonly ui: Pick<UiPort, "confirm" | "openSettings" | "showInfo" | "showDocument">;
  readonly ledger: CommandLedger;
  readonly calendar: BudgetCalendar;
  readonly clock: ClockPort;
  readonly config: ConfigPort;
  readonly workspace: WorkspacePort;
  /** The status bar, refreshed after a reset. */
  readonly statusBar: { refresh(): Promise<void> };
  /** Replaces every limit, in tokens; the integration tests use it. */
  readonly limitOverride?: () => number | undefined;
  /** Fetches the model prices on demand. Without it the refresh command says it isn't available. */
  readonly prices?: Pick<PriceRefresher, "refreshNow">;
  /** The price table in use, shown under the usage table in credits mode. */
  readonly priceInfo?: () => PriceInfo | undefined;
  /** For the diagnostic command that lists the Copilot models and where it writes them. */
  readonly models?: ModelSelectorPort;
  readonly log?: Pick<LogPort, "info" | "error">;
}

export interface Commands {
  showUsage(): Promise<void>;
  resetWeek(): Promise<void>;
  editSubjects(): Promise<void>;
  refreshPrices(): Promise<void>;
  logModels(): Promise<void>;
}

const READ_ERROR_ON_RESET = "Q0T4 couldn't read its usage record, so nothing was reset.";
const NOTHING_TO_RESET = "There is no usage this week to reset.";

const subjectCount = (count: number) => `${count} subject${count === 1 ? "" : "s"}`;

/** Command logic over ports; `extension.ts` registers the functions with VS Code. */
export function createCommands(deps: CommandDeps): Commands {
  const { ui, ledger, calendar, clock, config, workspace, statusBar } = deps;

  return {
    /** The `/status` table in a new editor tab. It reads the ledger and calls no model. */
    async showUsage() {
      const now = clock.now();
      const settings = config.get();
      let text: string;
      try {
        const rows = await buildStatusRows({
          config: settings,
          ledger,
          weekStart: calendar.weekWindow(now).start,
          currentRepo: repoSubject(await workspace.currentRepo().catch(() => undefined)),
          limitOverride: deps.limitOverride?.(),
        });
        const priceInfo = settings.budgetUnit === "credits" ? deps.priceInfo?.() : undefined;
        text = formatStatusTable({
          unit: settings.budgetUnit,
          rows,
          resetLabelLong: formatResetLong(nextResetKey(calendar, now)),
          warnAtPercent: settings.warnAtPercent,
          ...(priceInfo === undefined ? {} : { prices: priceInfo }),
        });
      } catch {
        ui.showInfo(formatStatusError());
        return;
      }
      await ui.showDocument(text);
    },

    /**
     * Appends a reset marker for every subject with entries this week, after a modal
     * confirmation. Nothing is deleted: weekly totals count only what follows the marker,
     * and range and cycle totals ignore it, because that usage really happened.
     */
    async resetWeek() {
      const { start, end } = calendar.weekWindow(clock.now());
      let subjects: readonly SubjectName[];
      try {
        subjects = await ledger.subjectsSeen(start);
      } catch {
        ui.showInfo(READ_ERROR_ON_RESET);
        return;
      }
      if (subjects.length === 0) {
        ui.showInfo(NOTHING_TO_RESET);
        return;
      }
      const week = `${formatResetLong(start)} to ${formatResetLong(addDays(end, -1))}`;
      const confirmed = await ui.confirm(
        `Reset this week's usage for ${subjectCount(subjects.length)} (${week})? ` +
          "Nothing is deleted: earlier weeks and credit totals stay as they are.",
      );
      if (!confirmed) return;

      let done = 0;
      try {
        for (const subject of subjects) {
          await ledger.markReset(subject);
          done++;
        }
        ui.showInfo(`Reset this week's usage for ${subjectCount(done)}.`);
      } catch {
        ui.showInfo(
          `Reset ${done} of ${subjects.length} subjects, then hit an error. Run Reset This Week again to finish.`,
        );
      }
      await statusBar.refresh();
    },

    async editSubjects() {
      await ui.openSettings("q0t4.subjects");
    },

    /**
     * Diagnostic: writes the name, family, id and vendor of every Copilot model to the log, so a
     * real model's names can be checked against the price table (#52).
     */
    async logModels() {
      const { models, log } = deps;
      if (models === undefined || log === undefined) {
        ui.showInfo("Q0T4 can't list models here.");
        return;
      }
      try {
        const found = await models.select({ vendor: "copilot" });
        log.info(`Copilot models: ${found.length}`);
        for (const model of found) {
          log.info(
            `name="${model.name}" family="${model.family}" id="${model.id}" vendor="${model.vendor}"`,
          );
        }
        ui.showInfo(
          found.length === 0
            ? "There are no Copilot models. Check that GitHub Copilot is signed in."
            : `Logged ${found.length} Copilot models to the Q0T4 output channel.`,
        );
      } catch (error) {
        log.error("Couldn't list the Copilot models.", error);
        ui.showInfo("Q0T4 couldn't list the Copilot models. See the Q0T4 output channel.");
      }
    },

    /** Fetches the model prices now, even if they were fetched today, and says what happened. */
    async refreshPrices() {
      if (deps.prices === undefined) {
        ui.showInfo("Q0T4 can't refresh model prices here.");
        return;
      }
      const outcome = await deps.prices.refreshNow();
      switch (outcome.status) {
        case "updated":
          ui.showInfo(
            `Model prices updated: ${outcome.table.models.length} models, fetched ${outcome.table.fetchedAt.slice(0, 10)}.`,
          );
          break;
        case "unchanged":
          ui.showInfo("Model prices are already up to date.");
          break;
        case "manual":
          ui.showInfo(
            "Prices come from q0t4.modelPrices because q0t4.priceSource is manual, so there is nothing to fetch.",
          );
          break;
        case "failed":
          ui.showInfo(
            `Q0T4 couldn't update the model prices: ${outcome.reasons.join("; ")}. It keeps using the last table.`,
          );
          break;
        case "invalid":
          ui.showInfo(
            `Q0T4 rejected the new model prices: ${outcome.failures.join("; ")}. It keeps using the last table.`,
          );
          break;
      }
    },
  };
}
