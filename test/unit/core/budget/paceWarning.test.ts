import { describe, expect, it } from "vitest";
import { paceWarning } from "../../../../src/core/budget/paceWarning";
import { Ledger } from "../../../../src/core/ledger/ledger";
import { BudgetCalendar } from "../../../../src/core/time/budgetCalendar";
import type { BudgetUnit, Cost, LedgerEntry } from "../../../../src/core/types";
import { FixedClock, InMemoryLedger } from "../../../fakes";

const amount = (unit: BudgetUnit, value: number): Cost =>
  unit === "tokens" ? { tokens: value } : { tokens: 0, credits: value };

describe.each(["tokens", "credits"] as const)("paceWarning (%s)", (unit) => {
  const pace = (usedToday: number, weekly = 1000, percent = 30) =>
    paceWarning({
      unit,
      usedToday: amount(unit, usedToday),
      weeklyBudget: amount(unit, weekly),
      percent,
    });

  it("gives no warning when today's usage is below the threshold", () => {
    expect(pace(299)).toBeNull();
    expect(pace(0)).toBeNull();
  });

  it("warns when today's usage reaches dailyPaceWarning % of the weekly budget", () => {
    expect(pace(300)).not.toBeNull();
    expect(pace(301)).not.toBeNull();
    expect(pace(1000)).not.toBeNull();
  });

  it("reports today's usage and the threshold in the active unit", () => {
    expect(pace(450)).toEqual({ usedToday: 450, threshold: 300, percent: 30 });
    expect(pace(450, 2000, 10)).toEqual({ usedToday: 450, threshold: 200, percent: 10 });
  });

  it("uses exact arithmetic at the boundary", () => {
    expect(pace(0.3, 1, 30)).not.toBeNull();
    expect(pace(29.99, 100, 30)).toBeNull();
    expect(pace(30, 100, 30)).not.toBeNull();
  });

  it("never warns for an empty budget with no usage, and warns for usage against it", () => {
    expect(pace(0, 0)).toBeNull();
    expect(pace(1, 0)).not.toBeNull();
  });

  it("rejects a missing amount in the active unit", () => {
    expect(() =>
      paceWarning({
        unit: "credits",
        usedToday: { tokens: 5 },
        weeklyBudget: amount("credits", 10),
        percent: 30,
      }),
    ).toThrow(TypeError);
  });
});

describe("pace at local midnight", () => {
  function entryAt(at: string, tokens: number): LedgerEntry {
    return {
      v: 1,
      id: at,
      kind: "usage",
      at,
      day: at.slice(0, 10),
      subject: "org/repo",
      source: "q0t4",
      model: { name: "GPT-5", family: "gpt-5" },
      tokens: { input: 1, output: 1 },
      cost: { tokens },
      stopped: false,
    };
  }

  it("resets at local midnight: 23:59 warns, the next day's request doesn't", async () => {
    const clock = new FixedClock("2026-10-14T23:59:00.000Z", "UTC");
    const ledger = new Ledger(
      new InMemoryLedger(),
      clock,
      new BudgetCalendar(clock, "monday"),
      () => "id",
    );
    await ledger.record(entryAt("2026-10-14T23:50:00.000Z", 400));
    const check = async () =>
      paceWarning({
        unit: "tokens",
        usedToday: await ledger.usedToday("org/repo"),
        weeklyBudget: { tokens: 1000 },
        percent: 30,
      });
    expect(await check()).not.toBeNull();
    clock.set("2026-10-15T00:00:00.000Z");
    expect(await check()).toBeNull();
  });
});
