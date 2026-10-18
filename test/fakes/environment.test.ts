import { describe, expect, it, vi } from "vitest";
import {
  FakeCancellation,
  FakeConfig,
  FakeReferenceReader,
  FakeUi,
  FixedClock,
  RecordingOutput,
} from "./index";

describe("FixedClock", () => {
  it("now returns the configured instant", () => {
    expect(new FixedClock("2026-10-18T10:00:00Z").now().toISOString()).toBe(
      "2026-10-18T10:00:00.000Z",
    );
  });

  it("now returns a copy that callers can't mutate", () => {
    const clock = new FixedClock("2026-10-18T10:00:00Z");
    clock.now().setUTCFullYear(2000);
    expect(clock.now().getUTCFullYear()).toBe(2026);
  });

  it("timeZone returns the configured IANA zone", () => {
    expect(new FixedClock("2026-10-18T10:00:00Z", "Europe/Amsterdam").timeZone()).toBe(
      "Europe/Amsterdam",
    );
    expect(new FixedClock("2026-10-18T10:00:00Z").timeZone()).toBe("UTC");
  });

  it("advance moves time forward by ms", () => {
    const clock = new FixedClock("2026-10-18T23:59:00Z");
    clock.advance(60_000);
    expect(clock.now().toISOString()).toBe("2026-10-19T00:00:00.000Z");
  });

  it("set jumps to an ISO instant", () => {
    const clock = new FixedClock("2026-10-18T10:00:00Z");
    clock.set("2027-02-28T12:00:00Z");
    expect(clock.now().toISOString()).toBe("2027-02-28T12:00:00.000Z");
  });
});

describe("FakeConfig", () => {
  it("FakeConfig fires onDidChange when updated", () => {
    const config = new FakeConfig();
    const listener = vi.fn();
    const subscription = config.onDidChange(listener);
    config.update({ defaultLimit: 500 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(config.get().defaultLimit).toBe(500);
    subscription.dispose();
    config.update({ defaultLimit: 600 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("starts from complete defaults and applies initial overrides", () => {
    const config = new FakeConfig({ budgetUnit: "credits" });
    expect(config.get()).toMatchObject({
      budgetUnit: "credits",
      fallbackSubject: "general",
      resetDay: "monday",
      includeHistory: true,
    });
  });
});

describe("RecordingOutput", () => {
  it("RecordingOutput records markdown and progress calls in order", () => {
    const output = new RecordingOutput();
    output.progress("Subject: RemonStuff/Q0T4 (repo)");
    output.markdown("Hello");
    output.markdown(" world");
    expect(output.calls).toEqual([
      { kind: "progress", text: "Subject: RemonStuff/Q0T4 (repo)" },
      { kind: "markdown", text: "Hello" },
      { kind: "markdown", text: " world" },
    ]);
  });

  it("RecordingOutput.text joins markdown parts", () => {
    const output = new RecordingOutput();
    output.markdown("Hel");
    output.progress("ignored");
    output.markdown("lo");
    expect(output.text).toBe("Hello");
  });
});

describe("FakeUi", () => {
  it("FakeUi returns scripted confirm answers in order", async () => {
    const ui = new FakeUi([true, false]);
    expect(await ui.confirm("Reset this week?")).toBe(true);
    expect(await ui.confirm("Again?")).toBe(false);
    expect(await ui.confirm("No answer scripted")).toBe(false);
    expect(ui.confirmations).toEqual(["Reset this week?", "Again?", "No answer scripted"]);
  });

  it("FakeUi records status bar states", () => {
    const ui = new FakeUi();
    const state = { text: "Q0T4 112k/150k", tooltip: "", level: "normal" as const };
    ui.setStatusBar(state);
    expect(ui.statusBar).toEqual([state]);
  });

  it("FakeUi records settings and info requests", async () => {
    const ui = new FakeUi();
    await ui.openSettings("q0t4.subjects");
    ui.showInfo("Invalid setting");
    expect(ui.settingsOpened).toEqual(["q0t4.subjects"]);
    expect(ui.infos).toEqual(["Invalid setting"]);
  });
});

describe("FakeReferenceReader", () => {
  it("FakeReferenceReader returns configured text per reference id", async () => {
    const reader = new FakeReferenceReader({
      "file:package.json": { label: "package.json", text: '{ "name": "q0t4" }' },
    });
    expect(await reader.read({ id: "file:package.json", value: "uri" })).toEqual({
      label: "package.json",
      text: '{ "name": "q0t4" }',
    });
    expect(await reader.read({ id: "image:logo", value: {} })).toBeUndefined();
    expect(reader.calls).toEqual(["file:package.json", "image:logo"]);
  });
});

describe("FakeCancellation", () => {
  it("FakeCancellation.cancel notifies listeners exactly once", () => {
    const signal = new FakeCancellation();
    const listener = vi.fn();
    signal.onCancellationRequested(listener);
    expect(signal.isCancellationRequested).toBe(false);
    signal.cancel();
    signal.cancel();
    expect(signal.isCancellationRequested).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("a disposed listener is not notified", () => {
    const signal = new FakeCancellation();
    const listener = vi.fn();
    signal.onCancellationRequested(listener).dispose();
    signal.cancel();
    expect(listener).not.toHaveBeenCalled();
  });
});
