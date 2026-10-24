import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { priceTableFile } from "../../../src/adapters/priceTableFile";
import type { PriceTable } from "../../../src/core/pricing/priceTable";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "q0t4-prices-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const table = (input = 2): PriceTable => ({
  fetchedAt: "2026-10-24T09:00:00.000Z",
  source: "github-docs-yaml",
  etag: '"v1"',
  models: [
    {
      model: "GPT-5 mini",
      provider: "openai",
      tiers: [{ tier: "Default", input, output: 10, cachedInput: 0.2 }],
    },
  ],
});

describe("priceTableFile", () => {
  it("saves and loads a table at prices/table.json", async () => {
    const store = priceTableFile(root);
    await store.save(table());
    expect(await store.load()).toEqual(table());
    expect(JSON.parse(await readFile(join(root, "prices", "table.json"), "utf8"))).toEqual(table());
  });

  it("load returns undefined when no file exists", async () => {
    expect(await priceTableFile(root).load()).toBeUndefined();
  });

  it("overwrites an earlier table", async () => {
    const store = priceTableFile(root);
    await store.save(table(2));
    await store.save(table(3));
    expect((await store.load())?.models[0]?.tiers[0]?.input).toBe(3);
  });

  it("never leaves a half-written file: no temp files remain and concurrent saves stay readable", async () => {
    const store = priceTableFile(root);
    await Promise.all([1, 2, 3, 4, 5, 6].map((n) => store.save(table(n))));
    expect(await readdir(join(root, "prices"))).toEqual(["table.json"]);
    expect((await store.load())?.models).toHaveLength(1);
  });

  it("survives two windows saving at the same time", async () => {
    const stores = [priceTableFile(root), priceTableFile(root)];
    await Promise.all(Array.from({ length: 12 }, (_, n) => stores[n % 2]?.save(table(n + 1))));
    expect(await readdir(join(root, "prices"))).toEqual(["table.json"]);
    expect(await stores[0]?.load()).toBeDefined();
  });

  it("keeps the old table when a save fails before the rename", async () => {
    const store = priceTableFile(root);
    await store.save(table(2));
    const circular = table() as unknown as Record<string, unknown>;
    circular["self"] = circular;
    await expect(store.save(circular as unknown as PriceTable)).rejects.toThrow();
    expect((await store.load())?.models[0]?.tiers[0]?.input).toBe(2);
    expect(await readdir(join(root, "prices"))).toEqual(["table.json"]);
  });

  it("rejects a file that isn't JSON or isn't a price table", async () => {
    await mkdir(join(root, "prices"));
    const store = priceTableFile(root);
    await writeFile(join(root, "prices", "table.json"), "{ not json");
    await expect(store.load()).rejects.toThrow();
    await writeFile(join(root, "prices", "table.json"), JSON.stringify({ models: "nope" }));
    await expect(store.load()).rejects.toThrow(/price table/i);
  });
});
