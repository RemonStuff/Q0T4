import { describe, expect, it } from "vitest";
import { formatStatusTable } from "../../../../src/core/format/statusTable";
import type { StatusRow, StatusTableInput } from "../../../../src/core/format/statusTable";

function row(subject: string, usedTokens: number, overrides: Partial<StatusRow> = {}): StatusRow {
  return {
    subject,
    used: { tokens: usedTokens },
    budget: { tokens: 100_000 },
    today: { tokens: 0 },
    requests: usedTokens > 0 ? 1 : 0,
    limitIsDefault: false,
    current: false,
    ...overrides,
  };
}

function input(rows: StatusRow[], overrides: Partial<StatusTableInput> = {}): StatusTableInput {
  return {
    unit: "tokens",
    rows,
    resetLabelLong: "Mon 19 Oct",
    warnAtPercent: 80,
    ...overrides,
  };
}

/** The table body lines, split into cells. */
function cells(text: string): string[][] {
  return text
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .slice(2)
    .map((line) =>
      line
        .slice(1, -1)
        .split(/(?<!\\)\|/)
        .map((c) => c.trim()),
    );
}

describe("formatStatusTable", () => {
  it("starts with the header and separator rows", () => {
    const text = formatStatusTable(input([row("a/b", 10)]));
    expect(text.split("\n").slice(0, 2)).toEqual([
      "| Subject | Used | Weekly budget | % | Today | Requests |",
      "|---|---|---|---|---|---|",
    ]);
  });

  it("renders one row per subject used this week, the current repo first, then by usage descending", () => {
    const text = formatStatusTable(
      input([
        row("org/small", 1_000),
        row("org/big", 60_000),
        row("org/mine", 5_000, { current: true }),
        row("org/medium", 20_000),
      ]),
    );
    expect(cells(text).map((r) => r[0])).toEqual([
      "org/mine",
      "org/big",
      "org/medium",
      "org/small",
    ]);
  });

  it("puts the current repo first wherever it was listed", () => {
    const mine = row("org/mine", 1, { current: true });
    const others = [row("org/a", 50), row("org/b", 60)];
    for (const rows of [
      [mine, ...others],
      [...others, mine],
      [others[0]!, mine, others[1]!],
    ]) {
      expect(cells(formatStatusTable(input(rows))).map((r) => r[0])[0]).toBe("org/mine");
    }
  });

  it("breaks ties by subject name, ignoring case", () => {
    const text = formatStatusTable(input([row("b/x", 5), row("A/x", 5), row("c/x", 5)]));
    expect(cells(text).map((r) => r[0])).toEqual(["A/x", "b/x", "c/x"]);
  });

  it("includes configured subjects with 0 usage", () => {
    const text = formatStatusTable(input([row("org/used", 40_000), row("org/idle", 0)]));
    expect(cells(text).map((r) => r[0])).toEqual(["org/used", "org/idle"]);
  });

  it("shows 0 for subjects with no usage this week", () => {
    const text = formatStatusTable(input([row("org/idle", 0)]));
    expect(cells(text)[0]).toEqual(["org/idle", "0", "100k", "0%", "0", "0"]);
  });

  it('marks limits that come from defaultLimit as "(default)"', () => {
    const text = formatStatusTable(
      input([row("org/own", 10), row("org/fallback", 5, { limitIsDefault: true })]),
    );
    const rows = cells(text);
    expect(rows[0]?.[2]).toBe("100k");
    expect(rows[1]?.[2]).toBe("100k (default)");
  });

  it("shows used, weekly budget, percent, today and requests in tokens", () => {
    const text = formatStatusTable(
      input([
        row("org/repo", 112_400, {
          budget: { tokens: 150_000 },
          today: { tokens: 31_900 },
          requests: 14,
        }),
      ]),
    );
    expect(cells(text)[0]).toEqual(["org/repo", "113k", "150k", "74%", "32k", "14"]);
  });

  it("shows used, weekly budget, percent, today and requests in credits", () => {
    const text = formatStatusTable(
      input(
        [
          row("org/repo", 0, {
            used: { tokens: 50_000, credits: 2100.4 },
            budget: { tokens: 0, credits: 3390 },
            today: { tokens: 1, credits: 7.35 },
            requests: 3,
          }),
        ],
        { unit: "credits" },
      ),
    );
    expect(text.split("\n")[0]).toBe(
      "| Subject | Used (credits) | Weekly budget (credits) | % | Today (credits) | Requests |",
    );
    expect(cells(text)[0]).toEqual(["org/repo", "2,101", "3,390", "61%", "7.4", "3"]);
  });

  it("sorts by the amount of the active unit", () => {
    const credits = (used: number, tokens: number) =>
      row("", 0, {
        used: { tokens, credits: used },
        budget: { tokens: 0, credits: 100 },
        today: { tokens: 0, credits: 0 },
      });
    const a = { ...credits(50, 1), subject: "org/a" };
    const b = { ...credits(5, 900), subject: "org/b" };
    const text = formatStatusTable(input([b, a], { unit: "credits" }));
    expect(cells(text).map((r) => r[0])).toEqual(["org/a", "org/b"]);
  });

  it("marks subjects at or above warnAtPercent with a warning sign", () => {
    const text = formatStatusTable(
      input([row("org/under", 79_999), row("org/at", 80_000), row("org/over", 99_999)]),
    );
    const percents = Object.fromEntries(cells(text).map((r) => [r[0], r[3]]));
    expect(percents).toEqual({ "org/over": "99% ⚠️", "org/at": "80% ⚠️", "org/under": "79%" });
  });

  it("marks exhausted subjects with a stop sign, also above the budget", () => {
    const text = formatStatusTable(input([row("org/full", 100_000), row("org/over", 130_000)]));
    expect(cells(text).map((r) => r[3])).toEqual(["130% ⛔", "100% ⛔"]);
  });

  it("shows a dash instead of a percent when the budget is 0", () => {
    const text = formatStatusTable(
      input([
        row("org/off", 0, { budget: { tokens: 0 } }),
        row("org/off2", 10, { budget: { tokens: 0 } }),
      ]),
    );
    expect(cells(text).map((r) => r[3])).toEqual(["– ⛔", "– ⛔"]);
  });

  it("includes the long reset label below the table", () => {
    const text = formatStatusTable(input([row("org/a", 1)]));
    expect(text.endsWith("\n\nWeekly budgets reset on Mon 19 Oct.")).toBe(true);
  });

  it("escapes pipe characters and other markdown in subject names", () => {
    const text = formatStatusTable(input([row("we|rd_*name", 1)]));
    const line = text.split("\n")[2] as string;
    expect(line.startsWith("| we\\|rd\\_\\*name | ")).toBe(true);
    expect(cells(text)[0]).toHaveLength(6);
  });

  it("says so when there are no subjects, without a table", () => {
    expect(formatStatusTable(input([]))).toBe(
      "No subjects yet. Send a question to start tracking usage.\n\nWeekly budgets reset on Mon 19 Oct.",
    );
  });

  it("escapes the reset label", () => {
    const text = formatStatusTable(input([row("org/a", 1)], { resetLabelLong: "Mon 19-Oct" }));
    expect(text.endsWith("reset on Mon 19\\-Oct.")).toBe(true);
  });

  it("throws, never shows 0, when a credits amount is missing", () => {
    expect(() => formatStatusTable(input([row("org/a", 10)], { unit: "credits" }))).toThrow();
  });
});
