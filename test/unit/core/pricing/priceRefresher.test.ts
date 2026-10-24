import { describe, expect, it } from "vitest";
import { Diagnostics } from "../../../../src/core/diagnostics/diagnostics";
import { PriceRefresher } from "../../../../src/core/pricing/priceRefresher";
import type { PriceRefresherSettings } from "../../../../src/core/pricing/priceRefresher";
import type { PriceTable } from "../../../../src/core/pricing/priceTable";
import type { PriceFetchResult, PriceTableStorePort } from "../../../../src/ports/PriceSourcePort";
import {
  FakeLog,
  FakePriceSource,
  FakeTimers,
  FixedClock,
  InMemoryPriceTableStore,
} from "../../../fakes";

const NOW = "2026-10-24T09:00:00.000Z";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const tableAt = (fetchedAt: string, input = 2, etag?: string): PriceTable => ({
  fetchedAt,
  source: "github-docs-yaml",
  ...(etag === undefined ? {} : { etag }),
  models: [
    { model: "GPT-5 mini", provider: "openai", tiers: [{ tier: "Default", input, output: 4 }] },
    {
      model: "Claude Sonnet 5.5",
      provider: "anthropic",
      tiers: [{ tier: "Default", input: 2, output: 10 }],
    },
  ],
});
const ok = (table: PriceTable, etag?: string): PriceFetchResult => ({
  status: "ok",
  table,
  ...(etag === undefined ? {} : { etag }),
});

function setup(
  results: readonly PriceFetchResult[],
  options: {
    stored?: PriceTable;
    settings?: Partial<PriceRefresherSettings>;
    store?: PriceTableStorePort;
    required?: readonly string[];
  } = {},
) {
  const clock = new FixedClock(NOW);
  const source = new FakePriceSource(results);
  const memory = new InMemoryPriceTableStore();
  const store = options.store ?? memory;
  const timers = new FakeTimers();
  const log = new FakeLog();
  const shown: string[] = [];
  const diagnostics = new Diagnostics(log, (text) => shown.push(text));
  let settings: PriceRefresherSettings = {
    priceSource: "auto",
    modelPrices: {},
    priceMaxAgeHours: 48,
    ...options.settings,
  };
  const refresher = new PriceRefresher({
    source,
    store,
    clock,
    timers,
    diagnostics,
    settings: () => settings,
    requiredModels: () => options.required ?? [],
  });
  const ready = options.stored === undefined ? Promise.resolve() : memory.save(options.stored);
  return {
    refresher,
    source,
    memory,
    clock,
    timers,
    shown,
    log,
    ready,
    set: (next: Partial<PriceRefresherSettings>) => {
      settings = { ...settings, ...next };
    },
  };
}

describe("PriceRefresher", () => {
  it("fetches on start when no table is stored", async () => {
    const t = setup([ok(tableAt(NOW))]);
    await t.refresher.start();
    expect(t.source.calls).toEqual([undefined]);
    expect(t.refresher.currentTable()?.fetchedAt).toBe(NOW);
    expect(await t.memory.load()).toEqual(tableAt(NOW));
  });

  it("fetches on start and then not again until 24 hours later", async () => {
    const t = setup([ok(tableAt(NOW)), { status: "unchanged" }]);
    await t.refresher.start();
    expect(t.source.calls).toHaveLength(1);
    expect(t.timers.active).toHaveLength(1);
    expect(t.timers.active[0]?.ms).toBe(DAY);
    t.timers.fire(0);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(t.source.calls).toHaveLength(2);
    expect(t.timers.active).toHaveLength(1);
  });

  it("passes the stored ETag and keeps the table on unchanged, bumping fetchedAt", async () => {
    const stored = tableAt("2026-10-22T09:00:00.000Z", 2, '"v1"');
    const t = setup([{ status: "unchanged" }], { stored });
    await t.ready;
    await t.refresher.start();
    expect(t.source.calls).toEqual(['"v1"']);
    const current = t.refresher.currentTable();
    expect(current?.models).toEqual(stored.models);
    expect(current?.fetchedAt).toBe(NOW);
    expect(current?.etag).toBe('"v1"');
    expect((await t.memory.load())?.fetchedAt).toBe(NOW);
  });

  it("saves a valid new table on ok and uses its ETag next time", async () => {
    const t = setup([ok(tableAt(NOW, 3, '"v2"')), { status: "unchanged" }], {
      stored: tableAt("2026-10-20T09:00:00.000Z", 2, '"v1"'),
    });
    await t.ready;
    await t.refresher.start();
    expect((await t.memory.load())?.models[0]?.tiers[0]?.input).toBe(3);
    await t.refresher.refreshNow();
    expect(t.source.calls).toEqual(['"v1"', '"v2"']);
  });

  it("keeps the last good table when the fetch fails", async () => {
    const stored = tableAt("2026-10-23T09:00:00.000Z");
    const t = setup([{ status: "failed", reasons: ["offline", "also offline"] }], { stored });
    await t.ready;
    await t.refresher.start();
    expect(t.refresher.currentTable()).toEqual(stored);
    expect(await t.memory.load()).toEqual(stored);
    expect(t.shown).toHaveLength(1);
    expect(t.shown[0]).toMatch(/couldn't update.*prices/i);
    expect(t.shown[0]).toContain("offline");
  });

  it("keeps the last good table when the source throws", async () => {
    const stored = tableAt("2026-10-23T09:00:00.000Z");
    const t = setup([], { stored });
    await t.ready;
    await t.refresher.start();
    expect(t.refresher.currentTable()).toEqual(stored);
    expect(t.shown).toHaveLength(1);
  });

  it("describes a source that throws something that is not an Error", async () => {
    const t = setup([]);
    t.source.fetch = async () => {
      throw "plain text";
    };
    expect((await t.refresher.refreshNow()).status).toBe("failed");
    expect(t.shown[0]).toContain("plain text");
  });

  it("needs no list of required models", async () => {
    const t = setup([ok(tableAt(NOW))]);
    const bare = new PriceRefresher({
      source: t.source,
      store: t.memory,
      clock: t.clock,
      timers: new FakeTimers(),
      diagnostics: new Diagnostics(new FakeLog(), () => undefined),
      settings: () => ({ priceSource: "auto", modelPrices: {}, priceMaxAgeHours: 48 }),
    });
    expect((await bare.refreshNow()).status).toBe("updated");
  });

  it("keeps the last good table when validation fails, and reports the failing check", async () => {
    const stored = tableAt("2026-10-23T09:00:00.000Z", 2);
    const t = setup([ok(tableAt(NOW, 20))], { stored });
    await t.ready;
    await t.refresher.start();
    expect(t.refresher.currentTable()).toEqual(stored);
    expect(await t.memory.load()).toEqual(stored);
    expect(t.shown).toHaveLength(1);
    expect(t.shown[0]).toContain("GPT-5 mini");
    expect(t.shown[0]).toMatch(/3×/);
  });

  it("validates against the required models", async () => {
    const t = setup([ok(tableAt(NOW))], { required: ["Claude Opus 9"] });
    await t.refresher.start();
    expect(t.refresher.currentTable()).toBeUndefined();
    expect(t.shown[0]).toContain("Claude Opus 9");
  });

  it("warns once per failure streak, not on every daily retry", async () => {
    const fail: PriceFetchResult = { status: "failed", reasons: ["offline"] };
    const t = setup([fail, fail, ok(tableAt(NOW)), fail]);
    await t.refresher.start();
    await t.refresher.refreshNow();
    expect(t.shown).toHaveLength(1);
    await t.refresher.refreshNow(); // success ends the streak
    await t.refresher.refreshNow(); // a new failure warns again
    expect(t.shown).toHaveLength(2);
    expect(t.log.lines.filter((line) => line.level === "warn")).toHaveLength(3);
  });

  it("isStale is false at priceMaxAgeHours and true one minute later", async () => {
    const t = setup([ok(tableAt(NOW))], { settings: { priceMaxAgeHours: 48 } });
    await t.refresher.start();
    t.clock.advance(48 * HOUR);
    expect(t.refresher.isStale()).toBe(false);
    t.clock.advance(60_000);
    expect(t.refresher.isStale()).toBe(true);
  });

  it("isStale follows a changed priceMaxAgeHours and is false without a table", async () => {
    const t = setup([ok(tableAt(NOW))]);
    expect(t.refresher.isStale()).toBe(false);
    await t.refresher.start();
    t.clock.advance(10 * HOUR);
    t.set({ priceMaxAgeHours: 5 });
    expect(t.refresher.isStale()).toBe(true);
  });

  it("the refresh command fetches immediately even if fetched today", async () => {
    const t = setup([ok(tableAt(NOW)), ok(tableAt(NOW, 3))]);
    await t.refresher.start();
    const outcome = await t.refresher.refreshNow();
    expect(t.source.calls).toHaveLength(2);
    expect(outcome.status).toBe("updated");
  });

  it("reports what a refresh did", async () => {
    const stored = tableAt("2026-10-23T09:00:00.000Z", 2, '"v1"');
    const t = setup(
      [{ status: "unchanged" }, { status: "failed", reasons: ["x"] }, ok(tableAt(NOW, 40))],
      { stored },
    );
    await t.ready;
    await t.refresher.start();
    expect((await t.refresher.refreshNow()).status).toBe("failed");
    const invalid = await t.refresher.refreshNow();
    expect(invalid.status).toBe("invalid");
    expect(invalid.status === "invalid" && invalid.failures[0]).toContain("GPT-5 mini");
  });

  it("an unchanged answer without any table is a failure", async () => {
    const t = setup([{ status: "unchanged" }]);
    const outcome = await t.refresher.refreshNow();
    expect(outcome.status).toBe("failed");
    expect(t.refresher.currentTable()).toBeUndefined();
  });

  it("currentTable is undefined on first run with no network", async () => {
    const t = setup([{ status: "failed", reasons: ["offline"] }]);
    await t.refresher.start();
    expect(t.refresher.currentTable()).toBeUndefined();
  });

  it("still serves the fetched table when saving it fails, and says so once", async () => {
    const store: PriceTableStorePort = {
      load: async () => undefined,
      save: async () => {
        throw new Error("disk full");
      },
    };
    const t = setup([ok(tableAt(NOW)), ok(tableAt(NOW))], { store });
    await t.refresher.start();
    await t.refresher.refreshNow();
    expect(t.refresher.currentTable()?.fetchedAt).toBe(NOW);
    expect(t.shown.filter((text) => /save/i.test(text))).toHaveLength(1);
  });

  it("treats an unreadable stored table as missing", async () => {
    const store: PriceTableStorePort = {
      load: async () => {
        throw new Error("EACCES");
      },
      save: async () => undefined,
    };
    const t = setup([ok(tableAt(NOW))], { store });
    await t.refresher.start();
    expect(t.refresher.currentTable()?.fetchedAt).toBe(NOW);
    expect(t.shown.some((text) => /price table/i.test(text))).toBe(true);
  });

  it("stops its timer when disposed, and start does nothing twice over", async () => {
    const t = setup([ok(tableAt(NOW))]);
    await t.refresher.start();
    t.refresher.dispose();
    expect(t.timers.active).toHaveLength(0);
    t.refresher.dispose();
  });

  describe("ensureStarted", () => {
    it("waits for the first fetch when there is no stored table", async () => {
      const t = setup([ok(tableAt(NOW))]);
      await t.refresher.ensureStarted();
      expect(t.refresher.currentTable()?.fetchedAt).toBe(NOW);
      expect(t.timers.active).toHaveLength(1);
    });

    it("serves the stored table at once and refreshes in the background", async () => {
      const stored = tableAt("2026-10-22T09:00:00.000Z", 2, '"v1"');
      const t = setup([], { stored });
      await t.ready;
      let release: (result: PriceFetchResult) => void = () => undefined;
      t.source.fetch = () => new Promise<PriceFetchResult>((resolve) => (release = resolve));
      await t.refresher.ensureStarted();
      expect(t.refresher.currentTable()?.models[0]?.tiers[0]?.input).toBe(2);
      release(ok(tableAt(NOW, 3, '"v2"')));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(t.refresher.currentTable()?.models[0]?.tiers[0]?.input).toBe(3);
    });

    it("starts only once however often it is called", async () => {
      const t = setup([ok(tableAt(NOW))]);
      await Promise.all([t.refresher.ensureStarted(), t.refresher.ensureStarted()]);
      await t.refresher.ensureStarted();
      expect(t.source.calls).toHaveLength(1);
      expect(t.timers.scheduled).toHaveLength(1);
    });
  });

  describe("info", () => {
    it("describes the table in use", async () => {
      const t = setup([ok(tableAt(NOW))], {
        settings: { modelPrices: { A: { input: 1, output: 1 } } },
      });
      await t.refresher.start();
      expect(t.refresher.info()).toEqual({
        source: "github-docs-yaml",
        fetchedAt: NOW,
        overrides: 1,
        stale: false,
      });
      t.clock.advance(49 * HOUR);
      expect(t.refresher.info()?.stale).toBe(true);
    });

    it("is undefined without a table", () => {
      expect(setup([]).refresher.info()).toBeUndefined();
    });
  });

  describe("manual priceSource", () => {
    it("never calls the source and builds the table from overrides only", async () => {
      const t = setup([], {
        settings: { priceSource: "manual", modelPrices: { "My Model": { input: 1, output: 2 } } },
      });
      await t.refresher.start();
      expect((await t.refresher.refreshNow()).status).toBe("manual");
      expect(t.source.calls).toEqual([]);
      expect(t.timers.active).toHaveLength(0);
      expect(t.refresher.currentTable()).toMatchObject({
        source: "manual",
        models: [{ model: "My Model", tiers: [{ tier: "Override", input: 1, output: 2 }] }],
      });
      expect(t.refresher.isStale()).toBe(false);
    });

    it("has no table without overrides", async () => {
      const t = setup([], { settings: { priceSource: "manual" } });
      await t.refresher.start();
      expect(t.refresher.currentTable()).toBeUndefined();
    });

    it("follows a settings change without a restart", async () => {
      const t = setup([], { settings: { priceSource: "manual" } });
      await t.refresher.start();
      t.set({ modelPrices: { A: { input: 1, output: 1 } } });
      expect(t.refresher.currentTable()?.models).toHaveLength(1);
      expect(t.refresher.overrideCount()).toBe(1);
    });
  });

  describe("overrides", () => {
    it("are applied on top of a fetched table", async () => {
      const t = setup([ok(tableAt(NOW))], {
        settings: {
          modelPrices: { "gpt-5   MINI": { input: 9, output: 18 }, Other: { input: 1, output: 1 } },
        },
      });
      await t.refresher.start();
      const table = t.refresher.currentTable();
      const mini = table?.models.filter((model) => model.model.toLowerCase().includes("gpt-5"));
      expect(mini).toEqual([
        {
          model: "gpt-5   MINI",
          provider: "override",
          tiers: [{ tier: "Override", input: 9, output: 18 }],
        },
      ]);
      expect(table?.models.map((model) => model.model)).toContain("Claude Sonnet 5.5");
      expect(table?.models.map((model) => model.model)).toContain("Other");
      expect(t.refresher.overrideCount()).toBe(2);
    });

    it("do not change the stored table", async () => {
      const t = setup([ok(tableAt(NOW))], {
        settings: { modelPrices: { A: { input: 1, output: 1 } } },
      });
      await t.refresher.start();
      expect((await t.memory.load())?.models.map((model) => model.model)).toEqual([
        "GPT-5 mini",
        "Claude Sonnet 5.5",
      ]);
    });
  });
});
