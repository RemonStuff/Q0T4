import type { DayKey } from "../types";
import type { BudgetCalendar } from "./budgetCalendar";

// English abbreviations, so labels are the same on every machine. Localisation is out of scope for v1.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** The day key the current week ends on, which is the day the next week starts. */
export function nextResetKey(calendar: BudgetCalendar, instant: Date): DayKey {
  return calendar.weekWindow(instant).end;
}

/** Milliseconds from the instant to the next reset, at local midnight. */
export function msUntilReset(calendar: BudgetCalendar, instant: Date): number {
  return calendar.startOfDay(nextResetKey(calendar, instant)).getTime() - instant.getTime();
}

function parts(key: DayKey) {
  const [year, month, day] = key.split("-").map(Number) as [number, number, number];
  return {
    day,
    month: MONTHS[month - 1],
    weekday: WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()],
  };
}

/** `Mon`: for the footer. */
export function formatResetShort(key: DayKey): string {
  return parts(key).weekday as string;
}

/** `Mon 19 Oct`: for the refusal message. */
export function formatResetLong(key: DayKey): string {
  const { weekday, day, month } = parts(key);
  return `${weekday} ${day} ${month}`;
}
