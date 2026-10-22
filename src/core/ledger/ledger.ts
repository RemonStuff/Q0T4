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
  constructor(
    private readonly port: LedgerPort,
    private readonly clock: ClockPort,
    private readonly calendar: BudgetCalendar,
    private readonly newId: () => string,
  ) {}

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
    const { entries } = await this.port.read({ from, to });
    return sum(
      entries.filter((e): e is UsageEntry => e.kind === "usage" && same(e.subject, subject)),
    );
  }

  /** Usage of a subject in the current budget week, after its latest reset marker. */
  async usedThisWeek(subject: SubjectName): Promise<Cost> {
    const { start, end } = this.calendar.weekWindow(this.clock.now());
    const { entries } = await this.port.read({ from: start, to: end });
    const mine = entries.filter((e) => same(e.subject, subject));
    const lastReset = mine.filter((e) => e.kind === "reset").at(-1);
    return sum(
      mine.filter(
        (e): e is UsageEntry =>
          e.kind === "usage" && (lastReset === undefined || e.at > lastReset.at),
      ),
    );
  }

  /** Usage of a subject on today's local day. */
  async usedToday(subject: SubjectName): Promise<Cost> {
    const today = this.calendar.dayKey(this.clock.now());
    return this.usedInRange(subject, today, addDays(today, 1));
  }

  /** Every subject with entries in the stored months, once, in the spelling used last. */
  async subjectsSeen(): Promise<readonly SubjectName[]> {
    const { entries } = await this.port.read(EVERYTHING);
    const latest = new Map<string, SubjectName>();
    for (const entry of entries) latest.set(entry.subject.toLowerCase(), entry.subject);
    return [...latest.keys()].sort().map((key) => latest.get(key) as SubjectName);
  }
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
