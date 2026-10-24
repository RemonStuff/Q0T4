import { describe, expect, it } from "vitest";
import { chatHandler } from "../../../src/core/chatHandler";
import type { BudgetContext, ChatHandlerRequest, Deps } from "../../../src/core/chatHandler";
import { CreditCostModel } from "../../../src/core/cost/creditCostModel";
import { FOOTER_SENTINEL } from "../../../src/core/format/footer";
import { formatNoPrices, formatStalePrices } from "../../../src/core/format/priceNotices";
import { formatStatusTable } from "../../../src/core/format/statusTable";
import { stripFooter } from "../../../src/core/messages/stripFooter";
import { costModelFor, refuseWithoutPrices } from "../../../src/core/pricing/costModelFor";
import type { PriceTable } from "../../../src/core/pricing/priceTable";
import { buildStatusRows } from "../../../src/core/statusRows";
import { subjectItems } from "../../../src/core/subjects/subjectItems";
import { DEFAULT_CONFIG } from "../../../src/core/subjects/parseConfig";
import type { Cost } from "../../../src/core/types";
import {
  FakeCancellation,
  FakeConfig,
  FakeModel,
  FakeModelSelector,
  FakeReferenceReader,
  FixedClock,
  InMemoryUsageSink,
  RecordingOutput,
} from "../../fakes";

const table: PriceTable = {
  fetchedAt: "2026-10-20T06:00:00.000Z",
  source: "github-docs-yaml",
  models: [
    { model: "GPT-5 mini", provider: "openai", tiers: [{ tier: "Default", input: 2, output: 10 }] },
    { model: "Big One", provider: "x", tiers: [{ tier: "Default", input: 30, output: 150 }] },
  ],
};

describe("costModelFor", () => {
  const settings = (budgetUnit: "tokens" | "credits") => ({ budgetUnit, modelPrices: {} });
  const prices = (t: PriceTable | undefined, stale = false) => ({
    currentTable: () => t,
    isStale: () => stale,
  });

  it("gives tokens a token cost model that needs no prices", () => {
    const setup = costModelFor(settings("tokens"), undefined);
    expect(setup).toMatchObject({ kind: "ready", notices: [] });
    expect(setup.kind === "ready" && setup.costModel.unit).toBe("tokens");
  });

  it("gives credits a credit cost model built from the table and the overrides", () => {
    const setup = costModelFor(
      { budgetUnit: "credits", modelPrices: { "GPT-5 mini": { input: 1, output: 1 } } },
      prices(table),
    );
    expect(setup.kind).toBe("ready");
    if (setup.kind !== "ready") return;
    expect(setup.costModel).toBeInstanceOf(CreditCostModel);
    expect(
      setup.costModel.cost({ name: "GPT-5 mini", family: "x" }, { input: 1_000_000, output: 0 })
        .rates?.input,
    ).toBe(1);
  });

  it("adds a stale notice but still runs", () => {
    const setup = costModelFor(settings("credits"), prices(table, true));
    expect(setup).toMatchObject({ kind: "ready", notices: [formatStalePrices(table.fetchedAt)] });
    expect(formatStalePrices(table.fetchedAt)).toBe(
      "⚠️ Prices may be out of date (fetched 2026-10-20).",
    );
  });

  it("has no setup for credits without a table, or without a refresher", () => {
    expect(costModelFor(settings("credits"), prices(undefined))).toEqual({ kind: "noPrices" });
    expect(costModelFor(settings("credits"), undefined)).toEqual({ kind: "noPrices" });
  });
});

describe("refuseWithoutPrices", () => {
  it("refuses with a Refresh Model Prices button and says it never guesses", () => {
    const output = new RecordingOutput();
    const buttons: unknown[] = [];
    output.button = (command, title) => {
      buttons.push({ command, title });
    };
    const result = refuseWithoutPrices(output);
    expect(output.text).toBe(formatNoPrices());
    expect(output.text).toMatch(/never guesses/);
    expect(buttons).toEqual([{ command: "q0t4.refreshPrices", title: "Refresh Model Prices" }]);
    expect(result).toEqual({ metadata: { outcome: "refused", stopped: "precheck" } });
  });
});

describe("credits mode in chatHandler", () => {
  function fixture(
    modelName: string,
    options: { family?: string; notices?: string[]; limit?: number } = {},
  ) {
    const model = new FakeModel({
      name: modelName,
      family: options.family ?? "gpt-5-mini",
      chunks: ["abcd", "efgh"],
      countTokens: (text) => text.length / 4,
    });
    const sink = new InMemoryUsageSink();
    const output = new RecordingOutput();
    const budget: BudgetContext = {
      subject: "org/repo",
      used: { tokens: 0, credits: 0 },
      budget: { tokens: 0, credits: options.limit ?? 500 },
      resetLabel: "Mon",
      costModel: new CreditCostModel(table),
      ...(options.notices === undefined ? {} : { notices: options.notices }),
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
        clock: new FixedClock("2026-10-21T09:00:00.000Z"),
        newId: () => "entry-1",
      },
    };
    return { request, deps, output, sink, model };
  }

  it("records the credits, the rates and the table date of a request", async () => {
    const { request, deps, sink } = fixture("GPT-5 mini");
    await chatHandler(request, deps);
    expect(sink.entries[0]).toMatchObject({
      kind: "usage",
      rates: {
        input: 2,
        output: 10,
        tier: "Default",
        tableDate: table.fetchedAt,
        tableSource: "github-docs-yaml",
      },
      cost: { tokens: 3 },
    });
    expect((sink.entries[0] as { cost: Cost }).cost.credits).toBeCloseTo(
      ((1 * 2 + 2 * 10) / 1e6) * 100,
      12,
    );
  });

  it("shows the footer in credits", async () => {
    const { request, deps, output } = fixture("GPT-5 mini");
    await chatHandler(request, deps);
    expect(output.text).toMatch(/org\/repo: 0\.1 \/ 500 credits this week/);
  });

  it("with a stale table the footer shows the stale warning and the request still runs", async () => {
    const stale = formatStalePrices(table.fetchedAt);
    const { request, deps, output, model } = fixture("GPT-5 mini", { notices: [stale] });
    const result = await chatHandler(request, deps);
    expect(result.metadata.outcome).toBe("completed");
    expect(model.calls.sendRequest).toHaveLength(1);
    expect(output.text.endsWith(`\n\n${stale}`)).toBe(true);
    expect(output.text.indexOf(FOOTER_SENTINEL)).toBeLessThan(output.text.indexOf(stale));
    expect(stripFooter(output.text)).toBe("abcdefgh");
  });

  it("costs an unknown model at the most expensive rates and shows the warning", async () => {
    const { request, deps, output, sink } = fixture("Nobody Knows", { family: "nobody" });
    await chatHandler(request, deps);
    expect(sink.entries[0]).toMatchObject({ rates: { input: 30, output: 150, tier: "Unknown" } });
    expect(output.text).toMatch(/⚠️ No price for Nobody Knows; costed at the highest rate\./);
    expect(stripFooter(output.text)).toBe("abcdefgh");
  });

  it("says Auto hides the model and asks for a specific one", async () => {
    const { request, deps, output } = fixture("Auto", { family: "auto" });
    await chatHandler(request, deps);
    expect(output.text).toMatch(/⚠️ Auto hides which model answered/);
    expect(output.text).not.toMatch(/No price for/);
  });

  it("shows no price warning for a known model", async () => {
    const { request, deps, output } = fixture("GPT-5 mini");
    await chatHandler(request, deps);
    expect(output.text).not.toContain("No price");
    expect(output.text).not.toContain("out of date");
  });

  it("refuses a request that doesn't fit the credits budget before calling the model", async () => {
    const { request, deps, output, model, sink } = fixture("Big One", {
      limit: 0.00001,
      family: "big",
    });
    await chatHandler(request, deps);
    expect(model.calls.sendRequest).toEqual([]);
    expect(sink.entries).toEqual([]);
    expect(output.text).toMatch(/credits/);
  });
});

describe("credits in the status views", () => {
  const rowsInput = (config = new FakeConfig({ budgetUnit: "credits" }).get()) => ({
    config,
    weekStart: "2026-10-19",
    currentRepo: "org/repo",
    ledger: {
      subjectsSeen: async () => ["org/repo"],
      weekUsage: async () => ({ used: { tokens: 500 } as Cost, requests: 2 }),
      usedToday: async () => ({ tokens: 100 }) as Cost,
    },
  });

  it("builds rows in credits, reading a token-only week as 0 credits", async () => {
    const rows = await buildStatusRows({ ...rowsInput(), limitOverride: 300 });
    const row = rows.find((r) => r.subject === "org/repo");
    expect(row?.budget).toEqual({ tokens: 0, credits: 300 });
    expect(row?.used).toEqual({ tokens: 500, credits: 0 });
    expect(row?.today).toEqual({ tokens: 100, credits: 0 });
  });

  it("keeps credits that entries carry", async () => {
    const input = rowsInput();
    input.ledger.weekUsage = async () => ({ used: { tokens: 500, credits: 7.5 }, requests: 1 });
    const rows = await buildStatusRows(input);
    const row = rows.find((r) => r.subject === "org/repo");
    expect(row?.used.credits).toBe(7.5);
    expect(row?.budget.credits).toBe(DEFAULT_CONFIG.defaultLimit);
  });

  it("builds token rows unchanged", async () => {
    const rows = await buildStatusRows(rowsInput(new FakeConfig().get()));
    const row = rows.find((r) => r.subject === "org/repo");
    expect(row?.used).toEqual({ tokens: 500 });
    expect(row?.budget).toEqual({ tokens: DEFAULT_CONFIG.defaultLimit });
  });

  it("/status shows the table's date, source and override count", async () => {
    const rows = await buildStatusRows({ ...rowsInput(), limitOverride: 300 });
    const text = formatStatusTable({
      unit: "credits",
      rows,
      resetLabelLong: "Mon 26 Oct",
      warnAtPercent: 80,
      prices: {
        source: "github-docs-yaml",
        fetchedAt: table.fetchedAt,
        overrides: 2,
        stale: false,
      },
    });
    expect(text).toContain("Weekly budget (credits)");
    expect(text).toContain("Prices: GitHub docs data file, fetched 2026-10-20, 2 overrides.");
    expect(text).not.toContain("out of date");
  });

  it("/status words the other sources, one override, none and a stale table", () => {
    const base = {
      unit: "credits",
      rows: [],
      resetLabelLong: "Mon 26 Oct",
      warnAtPercent: 80,
    } as const;
    const text = (prices: NonNullable<Parameters<typeof formatStatusTable>[0]["prices"]>) =>
      formatStatusTable({ ...base, prices });
    expect(
      text({
        source: "github-docs-article",
        fetchedAt: table.fetchedAt,
        overrides: 1,
        stale: false,
      }),
    ).toContain("GitHub docs article, fetched 2026-10-20, 1 override.");
    expect(
      text({ source: "manual", fetchedAt: table.fetchedAt, overrides: 3, stale: false }),
    ).toContain("Prices: manual prices (q0t4.modelPrices), 3 overrides.");
    expect(
      text({ source: "github-docs-yaml", fetchedAt: table.fetchedAt, overrides: 0, stale: true }),
    ).toMatch(/no overrides\.\n\n⚠️ Prices may be out of date \(fetched 2026-10-20\)\./);
  });

  it("/subjects limits are in the active unit", () => {
    const credits = subjectItems({
      config: new FakeConfig({ budgetUnit: "credits" }).get(),
      seen: [],
    });
    expect(credits[0]?.limit).toEqual({ tokens: 0, credits: 200_000 });
    const tokens = subjectItems({ config: new FakeConfig().get(), seen: [] });
    expect(tokens[0]?.limit).toEqual({ tokens: 200_000 });
  });
});
