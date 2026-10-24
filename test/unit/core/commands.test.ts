import { describe, expect, it, vi } from "vitest";
import { COMMAND_IDS, createCommands } from "../../../src/core/commands";
import type { CommandDeps, CommandLedger } from "../../../src/core/commands";
import { formatStatusError } from "../../../src/core/errors/formatStatusError";
import { formatStatusTable } from "../../../src/core/format/statusTable";
import { Ledger } from "../../../src/core/ledger/ledger";
import { buildStatusRows } from "../../../src/core/statusRows";
import { BudgetCalendar } from "../../../src/core/time/budgetCalendar";
import type { LedgerEntry } from "../../../src/core/types";
import { FakeConfig, FakeUi, FakeWorkspace, FixedClock, InMemoryLedger } from "../../fakes";

// Wednesday 14 Oct 2026; the week started Monday 12 Oct and resets Monday 19 Oct.
const NOW = "2026-10-14T09:00:00.000Z";

function setup(answers: boolean[] = [true], overrides: Partial<CommandDeps> = {}) {
  const clock = new FixedClock(NOW, "UTC");
  const config = new FakeConfig();
  const calendar = new BudgetCalendar(clock, () => config.get().resetDay);
  const store = new InMemoryLedger();
  let n = 0;
  const ledger = new Ledger(store, clock, calendar, () => `id-${++n}`);
  const ui = new FakeUi(answers);
  const workspace = new FakeWorkspace(undefined);
  const statusBar = { refresh: vi.fn(async () => {}) };
  const commands = createCommands({
    ui,
    ledger,
    calendar,
    clock,
    config,
    workspace,
    statusBar,
    ...overrides,
  });
  const record = (subject: string, tokens: number, at: string, credits?: number) => {
    const entry: LedgerEntry = {
      v: 1,
      id: `${subject}-${at}`,
      kind: "usage",
      at,
      day: at.slice(0, 10),
      subject,
      source: "q0t4",
      model: { name: "GPT-5", family: "gpt-5" },
      tokens: { input: 1, output: 1 },
      cost: credits === undefined ? { tokens } : { tokens, credits },
      stopped: false,
    };
    return ledger.record(entry);
  };
  return { clock, config, calendar, ledger, ui, workspace, statusBar, commands, record, store };
}

describe("command ids", () => {
  it("are the ones declared in package.json", () => {
    expect(COMMAND_IDS).toEqual({
      showUsage: "q0t4.showUsage",
      resetWeek: "q0t4.resetWeek",
      editSubjects: "q0t4.editSubjects",
      refreshPrices: "q0t4.refreshPrices",
    });
  });
});

describe("editSubjects", () => {
  it("asks the UI to open settings for q0t4.subjects", async () => {
    const { commands, ui } = setup();
    await commands.editSubjects();
    expect(ui.settingsOpened).toEqual(["q0t4.subjects"]);
  });
});

describe("showUsage", () => {
  it("renders the same content as /status", async () => {
    const { commands, ui, ledger, calendar, config, record } = setup();
    await record("org/a", 10_000, "2026-10-13T10:00:00.000Z");
    await record("org/b", 30_000, "2026-10-14T08:00:00.000Z");
    await commands.showUsage();
    const rows = await buildStatusRows({
      config: config.get(),
      ledger,
      weekStart: calendar.weekWindow(new Date(NOW)).start,
      currentRepo: undefined,
    });
    expect(ui.documents).toEqual([
      formatStatusTable({
        unit: "tokens",
        rows,
        resetLabelLong: "Mon 19 Oct",
        warnAtPercent: 80,
      }),
    ]);
    expect(ui.documents[0]).toContain("| org/b | 30k |");
  });

  it("puts the current repo first", async () => {
    const { commands, ui, workspace, record } = setup();
    await record("org/big", 90_000, "2026-10-13T10:00:00.000Z");
    workspace.set({
      folderName: "mine",
      remotes: [{ name: "origin", url: "https://github.com/org/mine.git" }],
    });
    await commands.showUsage();
    expect(ui.documents[0]?.split("\n")[2]).toMatch(/^\| org\/mine \|/);
  });

  it("treats a workspace failure as no open folder", async () => {
    const { commands, ui, workspace } = setup();
    workspace.currentRepo = async () => {
      throw new Error("git");
    };
    await commands.showUsage();
    expect(ui.documents).toHaveLength(1);
  });

  it("explains an unreadable ledger instead of opening a document", async () => {
    const { commands, ui, ledger } = setup();
    ledger.subjectsSeen = async () => {
      throw new Error("disk");
    };
    await commands.showUsage();
    expect(ui.documents).toEqual([]);
    expect(ui.infos).toEqual([formatStatusError()]);
  });

  it("uses a limit override from the test hook", async () => {
    const { commands, ui } = setup([true], { limitOverride: () => 1_000 });
    await commands.showUsage();
    expect(ui.documents[0]).toContain("| 1k |");
  });
});

describe("resetWeek", () => {
  const seed = async (s: ReturnType<typeof setup>) => {
    await s.record("org/a", 10_000, "2026-10-13T10:00:00.000Z", 5);
    await s.record("org/b", 20_000, "2026-10-14T08:00:00.000Z", 9);
    await s.record("org/c", 40_000, "2026-10-08T08:00:00.000Z"); // last week
  };

  it("does nothing when the user cancels the confirmation", async () => {
    const s = setup([false]);
    await seed(s);
    await s.commands.resetWeek();
    expect(s.ui.confirmations).toHaveLength(1);
    expect(await s.ledger.usedThisWeek("org/a")).toEqual({ tokens: 10_000, credits: 5 });
    expect(s.ui.infos).toEqual([]);
    expect(s.statusBar.refresh).not.toHaveBeenCalled();
    expect(
      (await s.store.read({ from: "0000-01-01", to: "9999-12-31" })).entries.some(
        (e) => e.kind === "reset",
      ),
    ).toBe(false);
  });

  it("appends a reset marker per subject after confirmation, and weekly totals drop to 0", async () => {
    const s = setup();
    await seed(s);
    await s.commands.resetWeek();
    const entries = (await s.store.read({ from: "0000-01-01", to: "9999-12-31" })).entries;
    expect(
      entries
        .filter((e) => e.kind === "reset")
        .map((e) => e.subject)
        .sort(),
    ).toEqual(["org/a", "org/b"]);
    expect((await s.ledger.weekUsage("org/a")).used.tokens).toBe(0);
    expect((await s.ledger.weekUsage("org/b")).requests).toBe(0);
    expect(s.ui.infos).toEqual(["Reset this week's usage for 2 subjects."]);
  });

  it("says 1 subject in the singular", async () => {
    const s = setup();
    await s.record("org/a", 10, "2026-10-13T10:00:00.000Z");
    await s.commands.resetWeek();
    expect(s.ui.infos).toEqual(["Reset this week's usage for 1 subject."]);
  });

  it("leaves earlier weeks unchanged, and usage after the marker counts again", async () => {
    const s = setup();
    await seed(s);
    await s.commands.resetWeek();
    expect(await s.ledger.usedInRange("org/c", "2026-10-05", "2026-10-12")).toEqual({
      tokens: 40_000,
    });
    s.clock.advance(60_000);
    await s.record("org/a", 7, "2026-10-14T09:00:30.000Z");
    expect((await s.ledger.usedThisWeek("org/a")).tokens).toBe(7);
  });

  it("does not lower cycle totals in credits mode", async () => {
    const s = setup();
    await seed(s);
    const before = await s.ledger.usedInRange("org/a", "2026-10-12", "2026-10-19");
    await s.commands.resetWeek();
    expect(await s.ledger.usedInRange("org/a", "2026-10-12", "2026-10-19")).toEqual(before);
    expect(before).toEqual({ tokens: 10_000, credits: 5 });
  });

  it("refreshes the status bar", async () => {
    const s = setup();
    await seed(s);
    await s.commands.resetWeek();
    expect(s.statusBar.refresh).toHaveBeenCalledTimes(1);
  });

  it("names the week dates and the subject count in the confirmation", async () => {
    const s = setup();
    await seed(s);
    await s.commands.resetWeek();
    expect(s.ui.confirmations).toEqual([
      "Reset this week's usage for 2 subjects (Mon 12 Oct to Sun 18 Oct)? Nothing is deleted: earlier weeks and credit totals stay as they are.",
    ]);
  });

  it("follows the reset day setting", async () => {
    const s = setup();
    s.config.update({ resetDay: "wednesday" });
    await s.record("org/a", 10, "2026-10-14T08:00:00.000Z");
    await s.commands.resetWeek();
    expect(s.ui.confirmations[0]).toContain("(Wed 14 Oct to Tue 20 Oct)");
  });

  it("tells the user there is nothing to reset, without asking", async () => {
    const s = setup();
    await s.record("org/c", 40_000, "2026-10-08T08:00:00.000Z");
    await s.commands.resetWeek();
    expect(s.ui.confirmations).toEqual([]);
    expect(s.ui.infos).toEqual(["There is no usage this week to reset."]);
    expect(s.statusBar.refresh).not.toHaveBeenCalled();
  });

  it("does not ask when the ledger cannot be read", async () => {
    const s = setup();
    s.ledger.subjectsSeen = async () => {
      throw new Error("disk");
    };
    await s.commands.resetWeek();
    expect(s.ui.confirmations).toEqual([]);
    expect(s.ui.infos).toEqual(["Q0T4 couldn't read its usage record, so nothing was reset."]);
  });

  it("reports a partial reset, still refreshes, and stops at the first failure", async () => {
    const s = setup();
    await seed(s);
    const marked: string[] = [];
    const flaky: CommandLedger = {
      subjectsSeen: (since) => s.ledger.subjectsSeen(since),
      weekUsage: (subject) => s.ledger.weekUsage(subject),
      usedToday: (subject) => s.ledger.usedToday(subject),
      async markReset(subject) {
        if (subject === "org/b") throw new Error("disk full");
        marked.push(subject);
        await s.ledger.markReset(subject);
      },
    };
    const again = setup([true], {
      ledger: flaky,
      ui: s.ui,
      statusBar: s.statusBar,
      clock: s.clock,
      calendar: s.calendar,
    });
    await again.commands.resetWeek();
    expect(marked).toEqual(["org/a"]);
    expect(s.ui.infos.at(-1)).toBe(
      "Reset 1 of 2 subjects, then hit an error. Run Reset This Week again to finish.",
    );
    expect(s.statusBar.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("refreshPrices", () => {
  const table = {
    fetchedAt: "2026-10-14T09:00:00.000Z",
    source: "github-docs-yaml",
    models: [{ model: "A", provider: "x", tiers: [] }],
  } as const;
  const run = async (
    outcome: Awaited<ReturnType<NonNullable<CommandDeps["prices"]>["refreshNow"]>>,
  ) => {
    const t = setup([], { prices: { refreshNow: async () => outcome } });
    await t.commands.refreshPrices();
    return t.ui.infos;
  };

  it("says how many models were updated and when", async () => {
    expect(await run({ status: "updated", table })).toEqual([
      "Model prices updated: 1 models, fetched 2026-10-14.",
    ]);
  });

  it("says when nothing changed", async () => {
    expect(await run({ status: "unchanged" })).toEqual(["Model prices are already up to date."]);
  });

  it("says that manual prices are not fetched", async () => {
    expect((await run({ status: "manual" }))[0]).toMatch(/priceSource is manual/);
  });

  it("names the reasons of a failed fetch and says the last table is kept", async () => {
    const [message] = await run({
      status: "failed",
      reasons: ["YAML: HTTP 500", "article: timed out"],
    });
    expect(message).toContain("YAML: HTTP 500; article: timed out");
    expect(message).toMatch(/keeps using the last table/);
  });

  it("names the failing checks of a rejected table", async () => {
    const [message] = await run({
      status: "invalid",
      failures: ["GPT-5 mini: input rate changed more than 3×"],
    });
    expect(message).toContain("rejected");
    expect(message).toContain("GPT-5 mini");
  });

  it("says it can't refresh when there is no price refresher", async () => {
    const t = setup();
    await t.commands.refreshPrices();
    expect(t.ui.infos).toEqual(["Q0T4 can't refresh model prices here."]);
  });
});
