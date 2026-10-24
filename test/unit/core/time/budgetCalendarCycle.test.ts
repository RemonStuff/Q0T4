import { describe, expect, it } from "vitest";
import { BudgetCalendar } from "../../../../src/core/time/budgetCalendar";
import { FixedClock } from "../../../fakes";

function calendar(cycleStartDay: number, timeZone = "UTC", resetDay = "monday" as const) {
  return new BudgetCalendar(
    new FixedClock("2026-01-01T00:00:00Z", timeZone),
    resetDay,
    cycleStartDay,
  );
}
const at = (iso: string) => new Date(iso);

describe("cycleWindow", () => {
  it("cycleStartDay 1: 2026-10-18 is in the cycle 2026-10-01 … 2026-11-01", () => {
    expect(calendar(1).cycleWindow(at("2026-10-18T12:00:00Z"))).toEqual({
      start: "2026-10-01",
      end: "2026-11-01",
    });
  });

  it("cycleStartDay 15: 2026-10-14 belongs to the cycle that started 2026-09-15", () => {
    expect(calendar(15).cycleWindow(at("2026-10-14T12:00:00Z"))).toEqual({
      start: "2026-09-15",
      end: "2026-10-15",
    });
    expect(calendar(15).cycleWindow(at("2026-10-15T00:00:00Z"))).toEqual({
      start: "2026-10-15",
      end: "2026-11-15",
    });
  });

  it("cycleStartDay 31 clamps to 30 April and to 28 February 2027", () => {
    const c = calendar(31);
    expect(c.cycleWindow(at("2026-04-30T12:00:00Z"))).toEqual({
      start: "2026-04-30",
      end: "2026-05-31",
    });
    expect(c.cycleWindow(at("2026-04-29T12:00:00Z"))).toEqual({
      start: "2026-03-31",
      end: "2026-04-30",
    });
    expect(c.cycleWindow(at("2027-02-28T12:00:00Z"))).toEqual({
      start: "2027-02-28",
      end: "2027-03-31",
    });
    expect(c.cycleWindow(at("2027-02-10T12:00:00Z"))).toEqual({
      start: "2027-01-31",
      end: "2027-02-28",
    });
  });

  it("cycleStartDay 29 clamps to 28 February in 2027 but not in leap year 2028", () => {
    const c = calendar(29);
    expect(c.cycleWindow(at("2027-02-28T12:00:00Z")).start).toBe("2027-02-28");
    expect(c.cycleWindow(at("2028-02-28T12:00:00Z")).start).toBe("2028-01-29");
    expect(c.cycleWindow(at("2028-02-29T12:00:00Z")).start).toBe("2028-02-29");
  });

  it("cycleStartDay 30 in February 2028 clamps to the 29th", () => {
    expect(calendar(30).cycleWindow(at("2028-02-29T12:00:00Z")).start).toBe("2028-02-29");
  });

  it("crosses the year end", () => {
    expect(calendar(15).cycleWindow(at("2027-01-05T12:00:00Z"))).toEqual({
      start: "2026-12-15",
      end: "2027-01-15",
    });
  });

  it("uses the cycleStartDay setting when given as a function", () => {
    let day = 1;
    const c = new BudgetCalendar(
      new FixedClock("2026-01-01T00:00:00Z", "UTC"),
      "monday",
      () => day,
    );
    expect(c.cycleWindow(at("2026-10-18T12:00:00Z")).start).toBe("2026-10-01");
    day = 10;
    expect(c.cycleWindow(at("2026-10-18T12:00:00Z")).start).toBe("2026-10-10");
  });

  it("defaults to the 1st when no cycleStartDay is given", () => {
    const c = new BudgetCalendar(new FixedClock("2026-01-01T00:00:00Z", "UTC"), "monday");
    expect(c.cycleWindow(at("2026-10-18T12:00:00Z")).start).toBe("2026-10-01");
  });
});

describe("cycleDays and daysRemainingInCycle", () => {
  it("counts 31, 30, 28 and 29-day cycles", () => {
    const c = calendar(1);
    expect(c.cycleDays(c.cycleWindow(at("2026-10-18T00:00:00Z")))).toBe(31);
    expect(c.cycleDays(c.cycleWindow(at("2026-11-18T00:00:00Z")))).toBe(30);
    expect(c.cycleDays(c.cycleWindow(at("2027-02-18T00:00:00Z")))).toBe(28);
    expect(c.cycleDays(c.cycleWindow(at("2028-02-18T00:00:00Z")))).toBe(29);
  });

  it("counts from the given day to the cycle end, including that day", () => {
    const c = calendar(1);
    expect(c.daysRemainingInCycle("2026-10-01")).toBe(31);
    expect(c.daysRemainingInCycle("2026-10-18")).toBe(14);
    expect(c.daysRemainingInCycle("2026-10-31")).toBe(1);
  });
});

describe("week against cycle", () => {
  it("a week fully inside a cycle has 7 days inside it", () => {
    const c = calendar(1);
    const cycle = c.cycleWindow(at("2026-10-14T00:00:00Z"));
    const week = c.weekWindow(at("2026-10-14T00:00:00Z"));
    expect(c.daysOfWeekInsideCycle(week, cycle)).toBe(7);
    expect(c.splitWeekAtCycleBoundary(week)).toEqual([{ cycle, days: 7 }]);
  });

  it("a week spanning a cycle start is split, 3 days old cycle + 4 days new cycle", () => {
    const c = calendar(1);
    const week = c.weekWindow(at("2026-10-29T00:00:00Z")); // Mon 26 Oct … Mon 2 Nov
    expect(week).toEqual({ start: "2026-10-26", end: "2026-11-02" });
    const parts = c.splitWeekAtCycleBoundary(week);
    expect(parts.map((p) => [p.cycle.start, p.days])).toEqual([
      ["2026-10-01", 6],
      ["2026-11-01", 1],
    ]);
    const cycle = c.cycleWindow(at("2026-10-29T00:00:00Z"));
    expect(c.daysOfWeekInsideCycle(week, cycle)).toBe(6);
  });

  it("splits 3 + 4", () => {
    const c = calendar(4);
    const parts = c.splitWeekAtCycleBoundary({ start: "2026-10-01", end: "2026-10-08" });
    expect(parts.map((p) => p.days)).toEqual([3, 4]);
  });

  it("a cycle starting on the week's first day puts all 7 days in the new cycle", () => {
    const c = calendar(1);
    const week = { start: "2026-06-01", end: "2026-06-08" };
    const parts = c.splitWeekAtCycleBoundary(week);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ days: 7, cycle: { start: "2026-06-01" } });
  });

  it("daysOfWeekInsideCycle is 0 for a cycle that does not touch the week", () => {
    const c = calendar(1);
    expect(
      c.daysOfWeekInsideCycle(
        { start: "2026-10-12", end: "2026-10-19" },
        { start: "2026-11-01", end: "2026-12-01" },
      ),
    ).toBe(0);
  });
});

describe("DST and time zones", () => {
  it.each(["Europe/Amsterdam", "America/New_York"])(
    "cycle boundaries are local midnight across both DST changes in %s",
    (zone) => {
      const c = calendar(1, zone);
      // The last instant before local midnight stays in the old cycle.
      const before = c.startOfDay("2026-11-01");
      expect(c.cycleWindow(new Date(before.getTime() - 60_000)).start).toBe("2026-10-01");
      expect(c.cycleWindow(before).start).toBe("2026-11-01");
      const spring = c.startOfDay("2026-04-01");
      expect(c.cycleWindow(new Date(spring.getTime() - 60_000)).start).toBe("2026-03-01");
      expect(c.cycleWindow(spring).start).toBe("2026-04-01");
      expect(c.daysRemainingInCycle("2026-03-15")).toBe(17);
    },
  );

  it("results do not depend on process.env.TZ", () => {
    const original = process.env["TZ"];
    try {
      const results = ["UTC", "Pacific/Auckland", "America/Los_Angeles"].map((tz) => {
        process.env["TZ"] = tz;
        return calendar(31, "Europe/Dublin").cycleWindow(at("2026-04-30T22:30:00Z"));
      });
      expect(results[1]).toEqual(results[0]);
      expect(results[2]).toEqual(results[0]);
    } finally {
      if (original === undefined) delete process.env["TZ"];
      else process.env["TZ"] = original;
    }
  });
});
