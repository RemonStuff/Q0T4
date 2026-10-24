import { describe, expect, it, vi } from "vitest";
import { LAST_SUBJECT_KEY, StatusBarController } from "../../../src/core/statusBar";
import type { StatusBarDeps } from "../../../src/core/statusBar";
import { Ledger } from "../../../src/core/ledger/ledger";
import { BudgetCalendar } from "../../../src/core/time/budgetCalendar";
import type { LedgerEntry } from "../../../src/core/types";
import {
  FakeConfig,
  FakeUi,
  FakeWorkspace,
  FakeTimers,
  FixedClock,
  InMemoryLedger,
  InMemoryStorage,
} from "../../fakes";

// Wednesday 14 Oct 2026; the week started Monday 12 Oct and resets Monday 19 Oct.
const NOW = "2026-10-14T09:00:00.000Z";
const repo = (name: string) => ({
  folderName: name,
  remotes: [{ name: "origin", url: `https://github.com/org/${name}.git` }],
});

function setup(overrides: Partial<StatusBarDeps> = {}, folder = "app") {
  const clock = new FixedClock(NOW, "UTC");
  const config = new FakeConfig();
  const calendar = new BudgetCalendar(clock, () => config.get().resetDay);
  const store = new InMemoryLedger();
  let n = 0;
  const ledger = new Ledger(store, clock, calendar, () => `id-${++n}`);
  const ui = new FakeUi();
  const workspace = new FakeWorkspace(repo(folder));
  const storage = new InMemoryStorage();
  const timers = new FakeTimers();
  const bar = new StatusBarController({
    ui,
    ledger,
    calendar,
    clock,
    config,
    workspace,
    storage,
    timers,
    ...overrides,
  });
  const record = (subject: string, tokens: number, at = "2026-10-13T10:00:00.000Z") => {
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
      cost: { tokens },
      stopped: false,
    };
    return ledger.record(entry);
  };
  return { clock, config, ledger, ui, workspace, storage, timers, bar, record, calendar };
}

const last = (ui: FakeUi) => ui.statusBar.at(-1);

describe("StatusBarController", () => {
  it("shows the current repo subject with used/weekly budget", async () => {
    const { bar, ui, record } = setup();
    await record("org/app", 112_400);
    await bar.refresh();
    expect(last(ui)?.text).toBe("$(pulse) org/app 113k/150k");
  });

  it("moves to another subject when the active editor moves to another workspace folder", async () => {
    const { bar, ui, workspace, record } = setup();
    await record("org/app", 1_000);
    await record("org/other", 9_000);
    await bar.refresh();
    expect(last(ui)?.text).toBe("$(pulse) org/app 1k/150k");
    workspace.set(repo("other"));
    await bar.refresh();
    expect(last(ui)?.text).toBe("$(pulse) org/other 9k/150k");
  });

  it("shows the last-used subject when no folder is open", async () => {
    const { bar, ui, workspace, record, storage } = setup();
    await record("org/old", 4_000);
    await bar.noteSubject("org/old");
    expect(storage.get(LAST_SUBJECT_KEY)).toBe("org/old");
    workspace.set(undefined);
    await bar.refresh();
    expect(last(ui)?.text).toBe("$(pulse) org/old 4k/150k");
  });

  it("shows the fallback subject with 0 when nothing was used yet", async () => {
    const { bar, ui, workspace } = setup();
    workspace.set(undefined);
    await bar.refresh();
    expect(last(ui)?.text).toBe("$(pulse) general 0/200k");
  });

  it("ignores a stored last subject that is not a non-empty string", async () => {
    const { bar, ui, workspace, storage } = setup();
    workspace.set(undefined);
    await storage.set(LAST_SUBJECT_KEY, 42);
    await bar.refresh();
    expect(last(ui)?.text).toContain("general");
    await storage.set(LAST_SUBJECT_KEY, "  ");
    await bar.refresh();
    expect(last(ui)?.text).toContain("general");
  });

  it("persists the last subject under q0t4.ui.lastSubject", async () => {
    const { bar, storage } = setup();
    expect(LAST_SUBJECT_KEY).toBe("q0t4.ui.lastSubject");
    await bar.noteSubject("org/x");
    expect(storage.get("q0t4.ui.lastSubject")).toBe("org/x");
  });

  it("does not fail when the last subject cannot be stored", async () => {
    const { bar, storage } = setup();
    storage.failWrites = true;
    await expect(bar.noteSubject("org/x")).resolves.toBeUndefined();
  });

  it("state is warning at or above warnAtPercent and error when exhausted", async () => {
    const { bar, ui, record } = setup();
    await record("org/app", 120_000);
    await bar.refresh();
    expect(last(ui)?.level).toBe("warning");
    await record("org/app", 30_000, "2026-10-13T11:00:00.000Z");
    await bar.refresh();
    expect(last(ui)?.level).toBe("error");
  });

  it("tooltip lists all subjects' usage and the reset date", async () => {
    const { bar, ui, record } = setup();
    await record("org/app", 10_000);
    await record("org/other", 20_000);
    await bar.refresh();
    expect(last(ui)?.tooltip).toBe(
      [
        "Q0T4 usage this week",
        "org/app: 10k / 150k (6%)",
        "org/other: 20k / 150k (13%)",
        "general: 0 / 200k (0%)",
        "Resets Mon 19 Oct",
      ].join("\n"),
    );
  });

  it("refresh is triggered after a request completes, including refusals", async () => {
    const { bar, ui, record } = setup();
    await bar.start();
    const before = ui.statusBar.length;
    await record("org/app", 5_000);
    await bar.afterRequest("org/app");
    expect(ui.statusBar.length).toBe(before + 1);
    expect(last(ui)?.text).toBe("$(pulse) org/app 5k/150k");
  });

  it("refresh is triggered on config change", async () => {
    const { bar, ui, config } = setup();
    await bar.start();
    const before = ui.statusBar.length;
    config.update({ defaultLimit: 100_000 });
    await vi.waitFor(() => expect(ui.statusBar.length).toBe(before + 1));
    expect(last(ui)?.text).toBe("$(pulse) org/app 0/100k");
  });

  it("stops listening to config changes after dispose", async () => {
    const { bar, ui, config } = setup();
    await bar.start();
    bar.dispose();
    const before = ui.statusBar.length;
    config.update({ defaultLimit: 100_000 });
    await new Promise((r) => setTimeout(r, 5));
    expect(ui.statusBar.length).toBe(before);
  });

  it("a reset timer fires at the next reset and shows zero usage", async () => {
    const { bar, ui, timers, clock, record, calendar } = setup();
    await record("org/app", 50_000);
    await bar.start();
    expect(last(ui)?.text).toBe("$(pulse) org/app 50k/150k");
    expect(timers.active).toHaveLength(1);
    const reset = calendar.startOfDay("2026-10-19").getTime() - clock.now().getTime();
    expect(timers.active[0]?.ms).toBe(reset);

    clock.set("2026-10-19T00:00:00.000Z");
    timers.fire(0);
    await vi.waitFor(() => expect(last(ui)?.text).toBe("$(pulse) org/app 0/150k"));
    // The next timer is for the following reset.
    await vi.waitFor(() => expect(timers.active).toHaveLength(1));
    expect(timers.active[0]?.ms).toBe(7 * 24 * 3600 * 1000);
  });

  it("dispose before start, or twice, does nothing", async () => {
    const { bar, timers } = setup();
    expect(() => bar.dispose()).not.toThrow();
    await bar.start();
    bar.dispose();
    expect(() => bar.dispose()).not.toThrow();
    expect(timers.active).toHaveLength(0);
  });

  it("dispose cancels the reset timer", async () => {
    const { bar, timers } = setup();
    await bar.start();
    bar.dispose();
    expect(timers.active).toHaveLength(0);
  });

  it("a timer that fires after dispose does nothing", async () => {
    const { bar, ui, timers } = setup();
    await bar.start();
    const fn = timers.scheduled[0]?.fn as () => void;
    bar.dispose();
    const before = ui.statusBar.length;
    fn();
    await new Promise((r) => setTimeout(r, 5));
    expect(ui.statusBar.length).toBe(before);
    expect(timers.active).toHaveLength(0);
  });

  it("shows a warning when the ledger cannot be read, and recovers on the next refresh", async () => {
    const { bar, ui, ledger } = setup();
    const original = ledger.weekUsage.bind(ledger);
    ledger.weekUsage = async () => {
      throw new Error("disk");
    };
    await bar.refresh();
    expect(last(ui)).toEqual({
      text: "$(pulse) Q0T4 ?",
      tooltip: "Q0T4 couldn't read its usage record.",
      level: "warning",
    });
    ledger.weekUsage = original;
    await bar.refresh();
    expect(last(ui)?.text).toBe("$(pulse) org/app 0/150k");
  });

  it("only the newest refresh is shown when two overlap", async () => {
    const { bar, ui, ledger } = setup();
    const original = ledger.weekUsage.bind(ledger);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    let held = false;
    ledger.weekUsage = async (subject) => {
      if (!held) {
        held = true;
        await gate;
      }
      return original(subject);
    };
    const slow = bar.refresh();
    await vi.waitFor(() => expect(held).toBe(true));
    await bar.refresh();
    release();
    await slow;
    expect(ui.statusBar).toHaveLength(1);
  });

  it("a stale refresh that fails shows nothing", async () => {
    const { bar, ui, ledger } = setup();
    const original = ledger.weekUsage.bind(ledger);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    let held = false;
    ledger.weekUsage = async (subject) => {
      if (!held) {
        held = true;
        await gate;
        throw new Error("disk");
      }
      return original(subject);
    };
    const slow = bar.refresh();
    await vi.waitFor(() => expect(held).toBe(true));
    await bar.refresh();
    release();
    await slow;
    expect(ui.statusBar).toHaveLength(1);
    expect(last(ui)?.text).toBe("$(pulse) org/app 0/150k");
  });

  it("a workspace failure counts as no open folder", async () => {
    const { bar, ui, workspace } = setup();
    workspace.currentRepo = async () => {
      throw new Error("git");
    };
    await bar.refresh();
    expect(last(ui)?.text).toContain("general");
  });

  it("uses a limit override from the test hook", async () => {
    const { bar, ui } = setup({ limitOverride: () => 1_000 });
    await bar.refresh();
    expect(last(ui)?.text).toBe("$(pulse) org/app 0/1k");
  });
});
