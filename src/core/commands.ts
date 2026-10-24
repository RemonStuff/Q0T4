import type { ClockPort } from "../ports/ClockPort";
import type { ConfigPort } from "../ports/ConfigPort";
import type { UiPort } from "../ports/UiPort";
import type { WorkspacePort } from "../ports/WorkspacePort";
import { formatStatusError } from "./errors/formatStatusError";
import { formatStatusTable } from "./format/statusTable";
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
}

export interface Commands {
  showUsage(): Promise<void>;
  resetWeek(): Promise<void>;
  editSubjects(): Promise<void>;
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
        text = formatStatusTable({
          unit: "tokens",
          rows,
          resetLabelLong: formatResetLong(nextResetKey(calendar, now)),
          warnAtPercent: settings.warnAtPercent,
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
  };
}
