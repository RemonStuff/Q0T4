import type { ClockPort } from "../../ports/ClockPort";
import type { Ledger } from "../ledger/ledger";
import type { BudgetCalendar } from "../time/budgetCalendar";
import type { BudgetUnit, Cost, SubjectName } from "../types";

/** The enforced weekly budget of a subject, in the active unit. Both modes use this one interface. */
export interface WeeklyBudget {
  forSubject(subject: SubjectName): Promise<number>;
}

/** Without a pool: the fixed limit from the settings (`weeklyLimit`, else `defaultLimit`). */
export class FixedWeeklyBudget implements WeeklyBudget {
  constructor(private readonly limit: (subject: SubjectName) => number) {}

  async forSubject(subject: SubjectName): Promise<number> {
    return this.limit(subject);
  }
}

export interface PoolWeeklyBudgetDeps {
  readonly ledger: Pick<Ledger, "usedInRange" | "budgetSnapshot" | "snapshotBudget">;
  readonly calendar: BudgetCalendar;
  readonly clock: ClockPort;
  readonly unit: () => BudgetUnit;
  /** The subject's share of the pool for one cycle, in the active unit. */
  readonly monthlyShare: (subject: SubjectName) => number;
}

const amountIn = (cost: Cost, unit: BudgetUnit): number =>
  unit === "credits" ? (cost.credits ?? 0) : cost.tokens;

/**
 * With a pool (docs/PLAN.md §9.2): what is left of the subject's monthly share, spread over
 * the days that remain in the cycle.
 *
 *     remainingInCycle = monthlyShare − cycleUsage(cycleStart … weekStart)
 *     weeklyBudget     = remainingInCycle × daysOfWeekInsideCycle / daysRemainingInCycle(weekStart)
 *
 * A week that crosses a cycle end adds the new cycle's part: `share × days / cycleDays`.
 * Nothing carries over past a cycle end. The result is computed once per week from usage
 * before the week starts, then stored as a `budget` ledger entry, so it does not change with
 * each request and two windows get the same number. A share change applies from next week.
 */
export class PoolWeeklyBudget implements WeeklyBudget {
  constructor(private readonly deps: PoolWeeklyBudgetDeps) {}

  async forSubject(subject: SubjectName): Promise<number> {
    const { ledger, calendar, clock } = this.deps;
    const unit = this.deps.unit();
    const week = calendar.weekWindow(clock.now());
    const existing = await ledger.budgetSnapshot(subject, week.start, unit);
    if (existing !== undefined) return existing.amount;
    const amount = await this.compute(subject, week, unit);
    await ledger.snapshotBudget(subject, week.start, unit, amount);
    // Read back: if another window stored one first, the earliest wins.
    const stored = await ledger.budgetSnapshot(subject, week.start, unit);
    return stored?.amount ?? amount;
  }

  private async compute(
    subject: SubjectName,
    week: { readonly start: string; readonly end: string },
    unit: BudgetUnit,
  ): Promise<number> {
    const { ledger, calendar } = this.deps;
    const share = this.deps.monthlyShare(subject);
    let total = 0;
    for (const [index, part] of calendar.splitWeekAtCycleBoundary(week).entries()) {
      if (index === 0) {
        const used = amountIn(
          await ledger.usedInRange(subject, part.cycle.start, week.start),
          unit,
        );
        total +=
          (Math.max(0, share - used) * part.days) / calendar.daysRemainingInCycle(week.start);
      } else {
        total += (share * part.days) / calendar.cycleDays(part.cycle);
      }
    }
    return total;
  }
}
