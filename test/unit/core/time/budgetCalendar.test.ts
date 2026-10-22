import { describe, expect, it } from "vitest";
import {
  BudgetCalendar,
  addDays,
  daysBetween,
  localParts,
} from "../../../../src/core/time/budgetCalendar";
import type { ResetDay } from "../../../../src/core/types";
import { FixedClock } from "../../../fakes";

const RESET_DAYS: readonly ResetDay[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function calendar(resetDay: ResetDay, timeZone = "UTC") {
  return new BudgetCalendar(new FixedClock("2026-01-01T00:00:00Z", timeZone), resetDay);
}

const at = (iso: string) => new Date(iso);

describe("BudgetCalendar week window", () => {
  it("monday reset: Sunday 23:59 belongs to the previous week", () => {
    expect(calendar("monday").weekWindow(at("2026-10-18T23:59:00Z"))).toEqual({
      start: "2026-10-12",
      end: "2026-10-19",
    });
  });

  it("monday reset: Monday 00:00 starts a new week", () => {
    expect(calendar("monday").weekWindow(at("2026-10-19T00:00:00Z"))).toEqual({
      start: "2026-10-19",
      end: "2026-10-26",
    });
  });

  it("resetDay sunday: Saturday 23:59 and Sunday 00:00 fall in different weeks", () => {
    const sunday = calendar("sunday");
    const saturday = sunday.weekWindow(at("2026-10-17T23:59:00Z"));
    const next = sunday.weekWindow(at("2026-10-18T00:00:00Z"));
    expect(saturday).toEqual({ start: "2026-10-11", end: "2026-10-18" });
    expect(next).toEqual({ start: "2026-10-18", end: "2026-10-25" });
  });

  it.each(RESET_DAYS)("resetDay %s yields a start date on that weekday", (resetDay) => {
    const weekday = RESET_DAYS.indexOf(resetDay);
    for (let offset = 0; offset < 14; offset++) {
      const { start, end } = calendar(resetDay).weekWindow(
        at(`2026-10-${String(10 + offset).padStart(2, "0")}T12:00:00Z`),
      );
      expect(new Date(`${start}T00:00:00Z`).getUTCDay()).toBe(weekday);
      expect(daysBetween(start, end)).toBe(7);
    }
  });

  it("a week spanning the year boundary has one weekStart", () => {
    const monday = calendar("monday");
    const starts = [
      "2025-12-29T00:00:00Z",
      "2025-12-31T12:00:00Z",
      "2026-01-01T00:00:00Z",
      "2026-01-04T23:59:00Z",
    ].map((iso) => monday.weekWindow(at(iso)));
    for (const window of starts) expect(window).toEqual({ start: "2025-12-29", end: "2026-01-05" });
  });

  it("DST spring-forward week (Europe/Amsterdam, 29 Mar 2026) has the correct weekStart", () => {
    const amsterdam = calendar("monday", "Europe/Amsterdam");
    // Sunday 29 Mar 23:59 local is 21:59Z (CEST); Monday 00:00 local is 22:00Z.
    expect(amsterdam.weekWindow(at("2026-03-29T21:59:00Z"))).toEqual({
      start: "2026-03-23",
      end: "2026-03-30",
    });
    expect(amsterdam.weekWindow(at("2026-03-29T22:00:00Z"))).toEqual({
      start: "2026-03-30",
      end: "2026-04-06",
    });
    expect(amsterdam.weekWindow(at("2026-03-29T00:30:00Z")).start).toBe("2026-03-23");
  });

  it("DST fall-back: 01:30 on both sides is in the same day and week (America/New_York, 1 Nov 2026)", () => {
    const newYork = calendar("monday", "America/New_York");
    const first = at("2026-11-01T05:30:00Z"); // 01:30 EDT
    const second = at("2026-11-01T06:30:00Z"); // 01:30 EST
    expect(newYork.dayKey(first)).toBe("2026-11-01");
    expect(newYork.dayKey(second)).toBe("2026-11-01");
    expect(newYork.weekWindow(first)).toEqual(newYork.weekWindow(second));
    expect(newYork.weekWindow(second)).toEqual({ start: "2026-10-26", end: "2026-11-02" });
  });
});

describe("BudgetCalendar day keys", () => {
  it("the same instant yields different days in Pacific/Kiritimati (+14) and Pacific/Pago_Pago (-11)", () => {
    const instant = at("2026-10-14T12:00:00Z");
    expect(calendar("monday", "Pacific/Kiritimati").dayKey(instant)).toBe("2026-10-15");
    expect(calendar("monday", "Pacific/Pago_Pago").dayKey(instant)).toBe("2026-10-14");
  });

  it("dayKey uses the local date, not the UTC date", () => {
    expect(calendar("monday", "America/Los_Angeles").dayKey(at("2026-10-15T03:00:00Z"))).toBe(
      "2026-10-14",
    );
    expect(calendar("monday", "Asia/Tokyo").dayKey(at("2026-10-14T20:00:00Z"))).toBe("2026-10-15");
  });

  it("reads the zone from the clock each time, so a zone change applies", () => {
    const clock = new FixedClock("2026-10-14T23:30:00Z", "UTC");
    const zoned = new BudgetCalendar(clock, "monday");
    expect(zoned.dayKey(clock.now())).toBe("2026-10-14");
    const moved = new BudgetCalendar(
      new FixedClock("2026-10-14T23:30:00Z", "Asia/Tokyo"),
      "monday",
    );
    expect(moved.dayKey(clock.now())).toBe("2026-10-15");
  });

  it("result does not depend on process.env.TZ", () => {
    const original = process.env["TZ"];
    try {
      const results = ["Asia/Tokyo", "America/Los_Angeles"].map((tz) => {
        process.env["TZ"] = tz;
        const cal = calendar("monday", "Europe/Amsterdam");
        const instant = at("2026-03-29T22:00:00Z");
        return { day: cal.dayKey(instant), week: cal.weekWindow(instant) };
      });
      expect(results[0]).toEqual(results[1]);
      expect(results[0]).toEqual({
        day: "2026-03-30",
        week: { start: "2026-03-30", end: "2026-04-06" },
      });
    } finally {
      if (original === undefined) delete process.env["TZ"];
      else process.env["TZ"] = original;
    }
  });
});

describe("calendar-day arithmetic", () => {
  it("addDays moves across months, years and leap days", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2025-02-28", 1)).toBe("2025-03-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-10-14", 0)).toBe("2026-10-14");
    expect(addDays("2026-10-14", 400)).toBe("2027-11-18");
  });

  it("daysBetween counts calendar days, also across a DST change", () => {
    expect(daysBetween("2026-10-14", "2026-10-14")).toBe(0);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
    expect(daysBetween("2026-10-14", "2026-10-07")).toBe(-7);
    expect(daysBetween("2025-12-29", "2026-01-05")).toBe(7);
  });

  it("localParts gives the calendar date and wall-clock time in the zone", () => {
    expect(localParts(at("2026-03-29T22:00:00Z"), "Europe/Amsterdam")).toEqual({
      year: 2026,
      month: 3,
      day: 30,
      hour: 0,
      minute: 0,
    });
    expect(localParts(at("2026-12-31T23:59:00Z"), "UTC")).toEqual({
      year: 2026,
      month: 12,
      day: 31,
      hour: 23,
      minute: 59,
    });
  });
});
