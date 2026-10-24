import type { ClockPort } from "../ports/ClockPort";
import type { ConfigPort } from "../ports/ConfigPort";
import type { Disposable } from "../ports/Disposable";
import type { StoragePort } from "../ports/StoragePort";
import type { UiPort } from "../ports/UiPort";
import type { WorkspacePort } from "../ports/WorkspacePort";
import { formatStatusBar } from "./format/statusBarText";
import type { StatusRow } from "./format/statusTable";
import { buildStatusRows } from "./statusRows";
import type { StatusLedger } from "./statusRows";
import { repoSubject } from "./subjects/repoIdentifier";
import type { BudgetCalendar } from "./time/budgetCalendar";
import { formatResetLong, msUntilReset, nextResetKey } from "./time/reset";
import type { SubjectName } from "./types";

/** Where the last subject is kept, for when no folder is open. */
export const LAST_SUBJECT_KEY = "q0t4.ui.lastSubject";

/** Timers, injected so tests control them. */
export interface TimerPort {
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface StatusBarDeps {
  readonly ui: Pick<UiPort, "setStatusBar">;
  readonly ledger: StatusLedger;
  readonly calendar: BudgetCalendar;
  readonly clock: ClockPort;
  readonly config: ConfigPort;
  readonly workspace: WorkspacePort;
  readonly storage: StoragePort;
  readonly timers: TimerPort;
  /** Replaces every limit, in tokens; the integration tests use it. */
  readonly limitOverride?: () => number | undefined;
}

/**
 * Keeps the status bar item current: after each request, on a settings change, at the
 * weekly reset and on start. It shows the open folder's repo, else the last-used subject,
 * else the fallback subject. Tokens only until credits are wired (#53).
 */
export class StatusBarController implements Disposable {
  private seq = 0;
  private disposed = false;
  private subscription: Disposable | undefined;
  private timer: unknown;

  constructor(private readonly deps: StatusBarDeps) {}

  /** Shows the item, follows settings changes and schedules the weekly reset. */
  async start(): Promise<void> {
    this.subscription = this.deps.config.onDidChange(() => void this.refresh());
    this.schedule();
    await this.refresh();
  }

  /** Remembers the subject of a finished request and updates the item. */
  async afterRequest(subject: SubjectName): Promise<void> {
    await this.noteSubject(subject);
    await this.refresh();
  }

  /** Persists the last-used subject. A storage failure is ignored: it only affects the next start. */
  async noteSubject(subject: SubjectName): Promise<void> {
    try {
      await this.deps.storage.set(LAST_SUBJECT_KEY, subject);
    } catch {
      // The item still shows the right subject; only the fallback after a restart is affected.
    }
  }

  /** Recomputes the item. When two refreshes overlap, only the newest is shown. */
  async refresh(): Promise<void> {
    const id = ++this.seq;
    const { ui, clock, calendar, config: configPort } = this.deps;
    try {
      const config = configPort.get();
      const current = repoSubject(await this.deps.workspace.currentRepo().catch(() => undefined));
      const stored = this.deps.storage.get<unknown>(LAST_SUBJECT_KEY);
      const last = typeof stored === "string" && stored.trim() !== "" ? stored.trim() : undefined;
      const subject = current ?? last ?? config.fallbackSubject;
      const now = clock.now();
      const rows = await buildStatusRows({
        config,
        ledger: this.deps.ledger,
        weekStart: calendar.weekWindow(now).start,
        currentRepo: current,
        extra: [subject],
        limitOverride: this.deps.limitOverride?.(),
      });
      // `extra` guarantees a row for the shown subject.
      const shown = rows.find(
        (r) => r.subject.toLowerCase() === subject.toLowerCase(),
      ) as StatusRow;
      if (id !== this.seq) return;
      ui.setStatusBar(
        formatStatusBar({
          unit: "tokens",
          shown,
          rows,
          warnAtPercent: config.warnAtPercent,
          resetLabelLong: formatResetLong(nextResetKey(calendar, now)),
        }),
      );
    } catch {
      if (id !== this.seq) return;
      ui.setStatusBar({
        text: "$(pulse) Q0T4 ?",
        tooltip: "Q0T4 couldn't read its usage record.",
        level: "warning",
      });
    }
  }

  dispose(): void {
    this.disposed = true;
    this.subscription?.dispose();
    this.subscription = undefined;
    if (this.timer !== undefined) this.deps.timers.clear(this.timer);
    this.timer = undefined;
  }

  /** One timer for the next reset; when it fires the item is refreshed and the next one is set. */
  private schedule(): void {
    const ms = msUntilReset(this.deps.calendar, this.deps.clock.now());
    this.timer = this.deps.timers.set(() => {
      if (this.disposed) return;
      this.schedule();
      void this.refresh();
    }, ms);
  }
}
