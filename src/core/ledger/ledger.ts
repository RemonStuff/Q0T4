import type { ClockPort } from "../../ports/ClockPort";
import type { LedgerPort } from "../../ports/LedgerPort";
import type { UsageSink } from "../../ports/UsageSink";
import type { BudgetCalendar } from "../time/budgetCalendar";
import { addDays } from "../time/budgetCalendar";
import { isLedgerEntry } from "../types";
import type { Cost, DayKey, LedgerEntry, SubjectName } from "../types";

type UsageEntry = Extract<LedgerEntry, { kind: "usage" }>;

// The widest range the port accepts: every stored month.
const EVERYTHING = { from: "0000-01-01", to: "9999-12-31" } as const;

/** Months of usage kept besides the current one; older month folders are pruned (PLAN §4). */
const RETENTION_MONTHS = 13;

export interface LedgerOptions {
  /** Called once per session with the first count of lines skipped as unreadable. */
  readonly onCorrupt?: (count: number) => void;
}

export interface PruneResult {
  readonly removed: readonly string[];
  readonly failed: readonly string[];
}

const same = (a: SubjectName, b: SubjectName) => a.toLowerCase() === b.toLowerCase();

/**
 * Persistent usage as an append-only ledger (docs/PLAN.md §4). It records entries
 * and answers range queries; weekly, daily and later cycle totals are just date
 * ranges, so changing `resetDay` never needs a migration.
 *
 * Subjects match case-insensitively, as repo names do on GitHub. A reset marker
 * only affects the week total of its own subject; range totals ignore it, because
 * the credits were really spent.
 */
export class Ledger implements UsageSink {
  private reported = false;
  private corrupt = 0;

  constructor(
    private readonly port: LedgerPort,
    private readonly clock: ClockPort,
    private readonly calendar: BudgetCalendar,
    private readonly newId: () => string,
    private readonly options: LedgerOptions = {},
  ) {}

  /** The most unreadable lines (bad JSON, failed validation, unknown schema version) seen in one read. */
  get corruptSkipped(): number {
    return this.corrupt;
  }

  /**
   * Deletes month folders older than the retention window, never the current
   * month. Meant for activation; one month that can't be removed doesn't stop the rest.
   */
  async prune(): Promise<PruneResult> {
    const current = this.calendar.dayKey(this.clock.now()).slice(0, 7);
    const cutoff = monthsBefore(current, RETENTION_MONTHS);
    const removed: string[] = [];
    const failed: string[] = [];
    for (const month of [...(await this.port.months())].sort()) {
      if (month >= cutoff) continue;
      try {
        await this.port.removeMonth(month);
        removed.push(month);
      } catch {
        failed.push(month);
      }
    }
    return { removed, failed };
  }

  /** Appends an entry. Existing entries are never rewritten. */
  async record(entry: LedgerEntry): Promise<void> {
    if (!isLedgerEntry(entry)) throw new TypeError("Not a valid ledger entry.");
    await this.port.append(entry);
  }

  /** "Reset This Week": weekly totals of the subject count only entries after this marker. */
  async markReset(subject: SubjectName): Promise<void> {
    const now = this.clock.now();
    await this.record({
      v: 1,
      id: this.newId(),
      kind: "reset",
      at: now.toISOString(),
      day: this.calendar.dayKey(now),
      subject,
      source: "q0t4",
    });
  }

  /** Usage of a subject on the days in `[from, to)`, ignoring reset markers. */
  async usedInRange(subject: SubjectName, from: DayKey, to: DayKey): Promise<Cost> {
    const { entries } = await this.read({ from, to });
    return sum(
      entries.filter((e): e is UsageEntry => e.kind === "usage" && same(e.subject, subject)),
    );
  }

  /** Usage of a subject in the current budget week, after its latest reset marker. */
  async usedThisWeek(subject: SubjectName): Promise<Cost> {
    return (await this.weekUsage(subject)).used;
  }

  /**
   * This week's total and the number of requests behind it, after the subject's latest
   * reset marker. One read, so `/status` shows a total that matches its request count.
   */
  async weekUsage(
    subject: SubjectName,
  ): Promise<{ readonly used: Cost; readonly requests: number }> {
    const { start, end } = this.calendar.weekWindow(this.clock.now());
    const { entries } = await this.read({ from: start, to: end });
    const mine = entries.filter((e) => same(e.subject, subject));
    const lastReset = mine.filter((e) => e.kind === "reset").at(-1);
    const counted = mine.filter(
      (e): e is UsageEntry =>
        e.kind === "usage" && (lastReset === undefined || e.at > lastReset.at),
    );
    return { used: sum(counted), requests: counted.length };
  }

  /** Usage of a subject on today's local day. */
  async usedToday(subject: SubjectName): Promise<Cost> {
    const today = this.calendar.dayKey(this.clock.now());
    return this.usedInRange(subject, today, addDays(today, 1));
  }

  /** Reads a range and notes unreadable lines, reporting them once per session. */
  private async read(range: { readonly from: DayKey; readonly to: DayKey }) {
    const result = await this.port.read(range);
    this.corrupt = Math.max(this.corrupt, result.corrupt);
    if (result.corrupt > 0 && !this.reported) {
      this.reported = true;
      try {
        this.options.onCorrupt?.(result.corrupt);
      } catch {
        // A failing report hook must not break a read.
      }
    }
    return result;
  }

  /**
   * Every subject with entries in the stored months (or since a day), once, in the
   * spelling used last.
   */
  async subjectsSeen(since?: DayKey): Promise<readonly SubjectName[]> {
    const { entries } = await this.read(
      since === undefined ? EVERYTHING : { from: since, to: EVERYTHING.to },
    );
    const latest = new Map<string, SubjectName>();
    for (const entry of entries) latest.set(entry.subject.toLowerCase(), entry.subject);
    return [...latest.keys()].sort().map((key) => latest.get(key) as SubjectName);
  }
}

/** `YYYY-MM` minus a number of months. */
function monthsBefore(month: string, count: number): string {
  const [year, number] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + (number - 1) - count;
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** Tokens always; credits only once some entry carries them. */
function sum(entries: readonly UsageEntry[]): Cost {
  let tokens = 0;
  let credits: number | undefined;
  for (const { cost } of entries) {
    tokens += cost.tokens;
    if (cost.credits !== undefined) credits = (credits ?? 0) + cost.credits;
  }
  return credits === undefined ? { tokens } : { tokens, credits };
}
