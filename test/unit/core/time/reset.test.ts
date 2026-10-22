import { describe, expect, it } from "vitest";
import { BudgetCalendar } from "../../../../src/core/time/budgetCalendar";
import {
  formatResetLong,
  formatResetShort,
  msUntilReset,
  nextResetKey,
} from "../../../../src/core/time/reset";
import { FixedClock } from "../../../fakes";

const calendar = (timeZone = "UTC", resetDay: "monday" | "sunday" = "monday") =>
  new BudgetCalendar(new FixedClock("2026-01-01T00:00:00Z", timeZone), resetDay);
const at = (iso: string) => new Date(iso);
const HOUR = 3_600_000;

describe("startOfDay", () => {
  it("is local midnight of the day key", () => {
    expect(calendar("UTC").startOfDay("2026-10-19")).toEqual(at("2026-10-19T00:00:00Z"));
    // Amsterdam is UTC+2 until 25 Oct 2026, UTC+1 after.
    expect(calendar("Europe/Amsterdam").startOfDay("2026-10-19")).toEqual(
      at("2026-10-18T22:00:00Z"),
    );
    expect(calendar("Europe/Amsterdam").startOfDay("2026-10-26")).toEqual(
      at("2026-10-25T23:00:00Z"),
    );
    expect(calendar("America/New_York").startOfDay("2026-11-02")).toEqual(
      at("2026-11-02T05:00:00Z"),
    );
  });

  it("is the first instant of a day whose midnight does not exist", () => {
    // Sao Paulo started DST at 00:00 on 4 Nov 2018, so the day began at 01:00 (-02:00).
    expect(calendar("America/Sao_Paulo").startOfDay("2018-11-04")).toEqual(
      at("2018-11-04T03:00:00Z"),
    );
  });

  it("covers the extreme time zones", () => {
    expect(calendar("Pacific/Kiritimati").startOfDay("2026-10-15")).toEqual(
      at("2026-10-14T10:00:00Z"),
    );
    expect(calendar("Pacific/Pago_Pago").startOfDay("2026-10-15")).toEqual(
      at("2026-10-15T11:00:00Z"),
    );
  });
});

describe("next reset", () => {
  it("nextReset is weekStart + 7 days at local midnight", () => {
    const cal = calendar("Europe/Amsterdam");
    const now = at("2026-10-14T09:00:00Z"); // Wednesday
    expect(nextResetKey(cal, now)).toBe("2026-10-19");
    expect(cal.startOfDay(nextResetKey(cal, now))).toEqual(at("2026-10-18T22:00:00Z"));
  });

  it("with resetDay sunday the next reset is the following Sunday", () => {
    expect(nextResetKey(calendar("UTC", "sunday"), at("2026-10-14T09:00:00Z"))).toBe("2026-10-18");
  });

  it("just before midnight on the last day, nextReset is minutes away", () => {
    expect(msUntilReset(calendar("UTC"), at("2026-10-18T23:59:00Z"))).toBe(60_000);
    expect(msUntilReset(calendar("Europe/Amsterdam"), at("2026-10-18T21:59:00Z"))).toBe(60_000);
  });

  it("exactly at reset, nextReset is a full week away", () => {
    expect(msUntilReset(calendar("UTC"), at("2026-10-19T00:00:00Z"))).toBe(7 * 24 * HOUR);
  });

  it("msUntilReset is positive and correct across a DST change", () => {
    const amsterdam = calendar("Europe/Amsterdam");
    // Spring forward on 29 Mar 2026: that week is one hour shorter.
    expect(msUntilReset(amsterdam, at("2026-03-22T23:00:00Z"))).toBe(7 * 24 * HOUR - HOUR);
    // Fall back on 25 Oct 2026: the week from Monday 19 Oct is one hour longer.
    expect(msUntilReset(amsterdam, at("2026-10-18T22:00:00Z"))).toBe(7 * 24 * HOUR + HOUR);
    for (const iso of ["2026-03-25T12:00:00Z", "2026-10-22T12:00:00Z", "2026-10-25T00:30:00Z"]) {
      expect(msUntilReset(amsterdam, at(iso))).toBeGreaterThan(0);
    }
  });
});

describe("reset labels", () => {
  it('short label is the weekday abbreviation, e.g. "Mon"', () => {
    expect(formatResetShort("2026-10-19")).toBe("Mon");
    expect(
      ["2026-10-18", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"].map(
        formatResetShort,
      ),
    ).toEqual(["Sun", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  });

  it('long label includes day and month, e.g. "Mon 19 Oct"', () => {
    expect(formatResetLong("2026-10-19")).toBe("Mon 19 Oct");
    expect(formatResetLong("2026-01-05")).toBe("Mon 5 Jan");
    expect(formatResetLong("2026-12-31")).toBe("Thu 31 Dec");
    expect(formatResetLong("2026-02-02")).toBe("Mon 2 Feb");
  });

  it("names every month", () => {
    const months = Array.from(
      { length: 12 },
      (_, i) => formatResetLong(`2026-${String(i + 1).padStart(2, "0")}-15`).split(" ")[2],
    );
    expect(months).toEqual([
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
    ]);
  });
});
