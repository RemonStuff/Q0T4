import { describe, expect, it, vi } from "vitest";
import { chatHandler } from "../../../src/core/chatHandler";
import type { BudgetContext, ChatHandlerRequest, Deps } from "../../../src/core/chatHandler";
import { TokenCostModel } from "../../../src/core/cost/tokenCostModel";
import { Diagnostics } from "../../../src/core/diagnostics/diagnostics";
import { loadStoredPrices } from "../../../src/core/pricing/loadStoredPrices";
import type { PriceTable } from "../../../src/core/pricing/priceTable";
import type { PriceTableStorePort } from "../../../src/ports/PriceSourcePort";
import {
  FakeCancellation,
  FakeLog,
  FakeModel,
  FakeModelSelector,
  FakeReferenceReader,
  FixedClock,
  InMemoryUsageSink,
  RecordingOutput,
} from "../../fakes";

function fixture() {
  const log = new FakeLog();
  const shown: string[] = [];
  const diagnostics = new Diagnostics(log, (text) => shown.push(text));
  return { log, shown, diagnostics };
}

describe("Diagnostics", () => {
  it("logs through the LogPort", () => {
    const { log, diagnostics } = fixture();
    const cause = new Error("disk full");
    diagnostics.info("started");
    diagnostics.error("couldn't write", cause);
    expect(log.lines).toEqual([
      { level: "info", message: "started" },
      { level: "error", message: "couldn't write", error: cause },
    ]);
  });

  it("shows a warning once per key and logs every occurrence", () => {
    const { log, shown, diagnostics } = fixture();
    diagnostics.warnOnce("a", "first");
    diagnostics.warnOnce("a", "first again");
    diagnostics.warnOnce("b", "second");
    expect(shown).toEqual(["first", "second"]);
    expect(log.lines.map((line) => line.message)).toEqual(["first", "first again", "second"]);
  });

  it("warns again for a key after it was cleared", () => {
    const { shown, diagnostics } = fixture();
    diagnostics.warnOnce("a", "first");
    diagnostics.clearWarning("a");
    diagnostics.clearWarning("never shown");
    diagnostics.warnOnce("a", "again");
    expect(shown).toEqual(["first", "again"]);
  });

  it("never throws when the log or the notification fails", () => {
    const log = new FakeLog();
    log.fail = true;
    const diagnostics = new Diagnostics(log, () => {
      throw new Error("notification failed");
    });
    expect(() => {
      diagnostics.info("x");
      diagnostics.error("x", new Error("y"));
      diagnostics.warnOnce("k", "x");
    }).not.toThrow();
  });

  it("still shows the warning when the log fails, and once", () => {
    const log = new FakeLog();
    log.fail = true;
    const shown: string[] = [];
    const diagnostics = new Diagnostics(log, (text) => shown.push(text));
    diagnostics.warnOnce("k", "text");
    diagnostics.warnOnce("k", "text");
    expect(shown).toEqual(["text"]);
  });

  it("reports unreadable ledger data once per session, with the count", () => {
    const { shown, diagnostics } = fixture();
    diagnostics.ledgerSkipped(2);
    diagnostics.ledgerSkipped(5);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toContain("2");
    expect(shown[0]).toContain("skipped");
  });

  it("reports a failed usage write once, in words that say the reply was kept", () => {
    const { log, shown, diagnostics } = fixture();
    diagnostics.recordFailed(new Error("ENOSPC"));
    diagnostics.recordFailed(new Error("ENOSPC"));
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatch(/couldn't save .*usage/i);
    expect(shown[0]).toMatch(/reply/i);
    expect(log.lines.filter((line) => line.level === "error")).toHaveLength(2);
  });

  it("reports invalid settings once per distinct set of problems", () => {
    const { shown, diagnostics } = fixture();
    diagnostics.configWarnings(["q0t4.subjects: not an object."]);
    diagnostics.configWarnings(["q0t4.subjects: not an object."]);
    expect(shown).toEqual([
      "Q0T4 settings: q0t4.subjects: not an object. Using the defaults for those.",
    ]);
    diagnostics.configWarnings(["q0t4.resetDay: unknown day."]);
    expect(shown).toHaveLength(2);
  });

  it("says nothing for no settings problems", () => {
    const { shown, log, diagnostics } = fixture();
    diagnostics.configWarnings([]);
    expect(shown).toEqual([]);
    expect(log.lines).toEqual([]);
  });
});

describe("loadStoredPrices", () => {
  const table = { source: "t" } as unknown as PriceTable;

  it("returns the stored table", async () => {
    const { diagnostics, shown } = fixture();
    const store: PriceTableStorePort = { load: async () => table, save: async () => undefined };
    expect(await loadStoredPrices(store, diagnostics)).toBe(table);
    expect(shown).toEqual([]);
  });

  it("treats a missing table as missing without a warning", async () => {
    const { diagnostics, shown } = fixture();
    const store: PriceTableStorePort = { load: async () => undefined, save: async () => undefined };
    expect(await loadStoredPrices(store, diagnostics)).toBeUndefined();
    expect(shown).toEqual([]);
  });

  it("treats an unreadable table file as missing and warns once", async () => {
    const { diagnostics, shown, log } = fixture();
    const store: PriceTableStorePort = {
      load: async () => {
        throw new Error("EACCES");
      },
      save: async () => undefined,
    };
    expect(await loadStoredPrices(store, diagnostics)).toBeUndefined();
    expect(await loadStoredPrices(store, diagnostics)).toBeUndefined();
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatch(/price table/i);
    expect(log.lines.filter((line) => line.level === "error")).toHaveLength(2);
  });
});

describe("a ledger append failure in chatHandler", () => {
  function handlerFixture(fail: "reject" | "throw") {
    const model = new FakeModel({ chunks: ["abcd", "efgh"] });
    const sink = new InMemoryUsageSink();
    sink.fail = fail;
    const { log, shown, diagnostics } = fixture();
    const output = new RecordingOutput();
    const budget: BudgetContext = {
      subject: "org/repo",
      used: { tokens: 0 },
      budget: { tokens: 10_000 },
      resetLabel: "Mon",
      costModel: new TokenCostModel(),
    };
    const request: ChatHandlerRequest = { prompt: "1234", history: [], model };
    const deps: Deps = {
      selector: new FakeModelSelector([]),
      referenceReader: new FakeReferenceReader(),
      output,
      signal: new FakeCancellation(),
      budget,
      footer: { warnAtPercent: 80 },
      recording: {
        sink,
        clock: new FixedClock("2026-10-14T09:12:03.120Z"),
        newId: () => "entry-1",
        onError: (error) => diagnostics.recordFailed(error),
      },
    };
    return { request, deps, output, shown, log };
  }

  it.each(["reject", "throw"] as const)(
    "does not interrupt the streamed reply (%s)",
    async (fail) => {
      const { request, deps, output } = handlerFixture(fail);
      const result = await chatHandler(request, deps);
      expect(result.metadata.outcome).toBe("completed");
      expect(output.text).toContain("abcdefgh");
      expect(output.text).toContain("org/repo");
    },
  );

  it("shows a warning once per session across requests", async () => {
    const { request, deps, shown, log } = handlerFixture("reject");
    await chatHandler(request, deps);
    await chatHandler(request, deps);
    expect(shown).toHaveLength(1);
    expect(log.lines.filter((line) => line.level === "error")).toHaveLength(2);
    vi.restoreAllMocks();
  });
});
