import { describe, expect, it } from "vitest";
import { formatStatusBar } from "../../../../src/core/format/statusBarText";
import type { StatusBarInput } from "../../../../src/core/format/statusBarText";
import type { StatusRow } from "../../../../src/core/format/statusTable";

function row(subject: string, used: number, overrides: Partial<StatusRow> = {}): StatusRow {
  return {
    subject,
    used: { tokens: used },
    budget: { tokens: 150_000 },
    today: { tokens: 0 },
    requests: used > 0 ? 1 : 0,
    limitIsDefault: true,
    current: false,
    ...overrides,
  };
}

function input(shown: StatusRow, overrides: Partial<StatusBarInput> = {}): StatusBarInput {
  return {
    unit: "tokens",
    shown,
    rows: [shown],
    warnAtPercent: 80,
    resetLabelLong: "Mon 19 Oct",
    ...overrides,
  };
}

describe("formatStatusBar", () => {
  it("shows the subject with used/weekly budget in tokens", () => {
    const state = formatStatusBar(input(row("RemonStuff/Q0T4", 112_400)));
    expect(state.text).toBe("$(pulse) RemonStuff/Q0T4 113k/150k");
  });

  it("shows the subject with used/weekly budget in credits, compact, with cr", () => {
    const shown = row("RemonStuff/Q0T4", 0, {
      used: { tokens: 1, credits: 2050 },
      budget: { tokens: 0, credits: 3390 },
    });
    expect(formatStatusBar(input(shown, { unit: "credits" })).text).toBe(
      "$(pulse) RemonStuff/Q0T4 2.1k/3.3k cr",
    );
  });

  it("shows small credit amounts as they are", () => {
    const shown = row("a/b", 0, {
      used: { tokens: 1, credits: 7.2 },
      budget: { tokens: 0, credits: 950 },
    });
    expect(formatStatusBar(input(shown, { unit: "credits" })).text).toBe("$(pulse) a/b 7.2/950 cr");
  });

  it("shows 0 when nothing was used", () => {
    expect(formatStatusBar(input(row("general", 0))).text).toBe("$(pulse) general 0/150k");
  });

  it("is normal below warnAtPercent", () => {
    expect(formatStatusBar(input(row("a/b", 119_999))).level).toBe("normal");
  });

  it("is a warning at or above warnAtPercent", () => {
    expect(formatStatusBar(input(row("a/b", 120_000))).level).toBe("warning");
    expect(formatStatusBar(input(row("a/b", 149_999))).level).toBe("warning");
  });

  it("is an error when exhausted, and for a budget of 0", () => {
    expect(formatStatusBar(input(row("a/b", 150_000))).level).toBe("error");
    expect(formatStatusBar(input(row("a/b", 0, { budget: { tokens: 0 } }))).level).toBe("error");
  });

  it("keeps a subject name from turning into an icon", () => {
    expect(formatStatusBar(input(row("x$(rocket)y", 0))).text).toBe(
      "$(pulse) x\\$(rocket)y 0/150k",
    );
  });

  it("lists all subjects' usage and the reset date in the tooltip, current repo first", () => {
    const shown = row("org/mine", 112_400, { current: true });
    const state = formatStatusBar(
      input(shown, {
        rows: [row("general", 3_000), shown, row("org/other", 140_000)],
      }),
    );
    expect(state.tooltip.split("\n")).toEqual([
      "Q0T4 usage this week",
      "org/mine: 113k / 150k (74%)",
      "org/other: 140k / 150k (93%)",
      "general: 3k / 150k (2%)",
      "Resets Mon 19 Oct",
    ]);
  });

  it("shows a dash for a budget of 0 in the tooltip", () => {
    const shown = row("a/b", 5, { budget: { tokens: 0 } });
    expect(formatStatusBar(input(shown)).tooltip).toContain("a/b: 5 / 0 (–)");
  });

  it("cuts a long tooltip after 10 subjects", () => {
    const rows = Array.from({ length: 13 }, (_, i) =>
      row(`org/r${String(i).padStart(2, "0")}`, 100 - i),
    );
    const lines = formatStatusBar(input(rows[0] as StatusRow, { rows })).tooltip.split("\n");
    expect(lines).toHaveLength(1 + 10 + 1 + 1);
    expect(lines[11]).toBe("and 3 more");
    expect(lines.at(-1)).toBe("Resets Mon 19 Oct");
  });

  it("puts the shown subject in the tooltip even if it is not among the rows", () => {
    const state = formatStatusBar(input(row("only/shown", 10), { rows: [] }));
    expect(state.tooltip).toContain("only/shown: 10 / 150k (0%)");
  });
});
