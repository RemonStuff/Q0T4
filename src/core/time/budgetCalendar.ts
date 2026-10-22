import type { ClockPort } from "../../ports/ClockPort";
import type { DayKey, ResetDay } from "../types";

/** Weekday numbers as `Date.getUTCDay()` gives them: Sunday is 0. */
const WEEKDAY: Readonly<Record<ResetDay, number>> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const DAY_MS = 86_400_000;

export interface LocalParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

/** A budget week as local day keys: `start` is included, `end` is not. */
export interface WeekWindow {
  readonly start: DayKey;
  readonly end: DayKey;
}

/**
 * The wall-clock date and time of an instant in an IANA zone. Uses `Intl`, never
 * the machine's `TZ`, so results are the same on every runner.
 */
export function localParts(instant: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

// Day arithmetic works on calendar days (as UTC midnights), never on local
// milliseconds, so a 23- or 25-hour day can't shift a boundary.
function utcMs(key: DayKey): number {
  const [year, month, day] = key.split("-").map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day);
}

function keyOf(ms: number): DayKey {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(key: DayKey, days: number): DayKey {
  return keyOf(utcMs(key) + days * DAY_MS);
}

/** Whole calendar days from `from` to `to`; negative if `to` is earlier. */
export function daysBetween(from: DayKey, to: DayKey): number {
  return Math.round((utcMs(to) - utcMs(from)) / DAY_MS);
}

/**
 * The enforced week (docs/PLAN.md §9.2). It starts at local midnight on `resetDay`.
 * The billing-cycle level joins this class in #54.
 */
export class BudgetCalendar {
  constructor(
    private readonly clock: ClockPort,
    private readonly resetDay: ResetDay,
  ) {}

  /** The local calendar day of an instant, in the clock's time zone. */
  dayKey(instant: Date): DayKey {
    const { year, month, day } = localParts(instant, this.clock.timeZone());
    return [year, month, day].map((n, i) => String(n).padStart(i === 0 ? 4 : 2, "0")).join("-");
  }

  /** The `[start, end)` day keys of the budget week that contains the instant. */
  weekWindow(instant: Date): WeekWindow {
    const today = this.dayKey(instant);
    const weekday = new Date(utcMs(today)).getUTCDay();
    const start = addDays(today, -((weekday - WEEKDAY[this.resetDay] + 7) % 7));
    return { start, end: addDays(start, 7) };
  }
}
