import { appendFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileLedger } from "../../../src/adapters/fileLedger";
import type { LedgerEntry } from "../../../src/core/types";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "q0t4-ledger-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function usage(id: string, day: string, tokens = 1, at = `${day}T09:00:00.000Z`): LedgerEntry {
  return {
    v: 1,
    id,
    kind: "usage",
    at,
    day,
    subject: "org/repo",
    source: "q0t4",
    model: { name: "GPT-5", family: "gpt-5" },
    tokens: { input: 1, output: 1 },
    cost: { tokens },
    stopped: false,
  };
}

const all = { from: "2026-01-01", to: "2027-01-01" } as const;

describe("fileLedger", () => {
  it("appends a line to <month>/<sessionId>.jsonl under the root", async () => {
    const ledger = fileLedger(root, "session-1");
    await ledger.append(usage("a", "2026-10-14"));
    await ledger.append(usage("b", "2026-10-15"));
    await ledger.append(usage("c", "2026-11-01"));
    const text = await readFile(join(root, "ledger", "2026-10", "session-1.jsonl"), "utf8");
    expect(text.split("\n")).toHaveLength(3);
    expect(text.endsWith("\n")).toBe(true);
    expect(JSON.parse(text.split("\n")[0] ?? "")).toMatchObject({ id: "a", day: "2026-10-14" });
    expect(await readdir(join(root, "ledger"))).toEqual(["2026-10", "2026-11"]);
  });

  it("keeps the file name safe for any session id", async () => {
    await fileLedger(root, "a/b:c").append(usage("a", "2026-10-14"));
    expect(await readdir(join(root, "ledger", "2026-10"))).toEqual(["a_b_c.jsonl"]);
  });

  it("reads entries from several writer files in one month, in time order", async () => {
    await fileLedger(root, "window-a").append(
      usage("late", "2026-10-14", 1, "2026-10-14T10:00:00.000Z"),
    );
    await fileLedger(root, "window-b").append(
      usage("early", "2026-10-14", 1, "2026-10-14T08:00:00.000Z"),
    );
    const { entries, corrupt } = await fileLedger(root, "window-c").read(all);
    expect(entries.map((e) => e.id)).toEqual(["early", "late"]);
    expect(corrupt).toBe(0);
  });

  it("two writers appending concurrently lose no entries", async () => {
    const a = fileLedger(root, "window-a");
    const b = fileLedger(root, "window-b");
    const writes: Promise<void>[] = [];
    for (let i = 0; i < 100; i++) {
      writes.push(
        a.append(
          usage(`a${i}`, "2026-10-14", 1, `2026-10-14T09:00:00.${String(i).padStart(3, "0")}Z`),
        ),
      );
      writes.push(
        b.append(
          usage(`b${i}`, "2026-10-14", 1, `2026-10-14T09:01:00.${String(i).padStart(3, "0")}Z`),
        ),
      );
    }
    await Promise.all(writes);
    const { entries, corrupt } = await a.read(all);
    expect(entries).toHaveLength(200);
    expect(new Set(entries.map((e) => e.id)).size).toBe(200);
    expect(corrupt).toBe(0);
  });

  it("returns only the days in [from, to), across months", async () => {
    const ledger = fileLedger(root, "w");
    for (const day of ["2026-09-30", "2026-10-01", "2026-10-31", "2026-11-01", "2026-11-02"]) {
      await ledger.append(usage(day, day));
    }
    const ids = async (from: string, to: string) =>
      (await ledger.read({ from, to })).entries.map((e) => e.id);
    expect(await ids("2026-10-01", "2026-11-01")).toEqual(["2026-10-01", "2026-10-31"]);
    expect(await ids("2026-09-30", "2026-10-02")).toEqual(["2026-09-30", "2026-10-01"]);
    expect(await ids("2026-10-31", "2026-11-02")).toEqual(["2026-10-31", "2026-11-01"]);
    expect(await ids("2026-10-05", "2026-10-05")).toEqual([]);
    expect(await ids("2026-10-06", "2026-10-05")).toEqual([]);
  });

  it("returns an empty result when nothing was ever written", async () => {
    const ledger = fileLedger(join(root, "never-created"), "w");
    expect(await ledger.read(all)).toEqual({ entries: [], corrupt: 0 });
    expect(await ledger.months()).toEqual([]);
  });

  it("sees entries appended after an earlier read, by this or another writer", async () => {
    const a = fileLedger(root, "window-a");
    const b = fileLedger(root, "window-b");
    await a.append(usage("1", "2026-10-14"));
    expect((await a.read(all)).entries).toHaveLength(1);
    await a.append(usage("2", "2026-10-14"));
    await b.append(usage("3", "2026-10-14"));
    expect((await a.read(all)).entries.map((e) => e.id).sort()).toEqual(["1", "2", "3"]);
  });

  it("skips and counts corrupt lines, and ignores a line another window is still writing", async () => {
    const ledger = fileLedger(root, "w");
    await ledger.append(usage("1", "2026-10-14"));
    const file = join(root, "ledger", "2026-10", "w.jsonl");
    await appendFile(file, "{not json\n");
    await appendFile(file, JSON.stringify({ ...usage("2", "2026-10-14"), v: 2 }) + "\n");
    await appendFile(file, '{"v":1,"id":"3"'); // unfinished: no newline yet
    const { entries, corrupt } = await ledger.read(all);
    expect(entries.map((e) => e.id)).toEqual(["1"]);
    expect(corrupt).toBe(2);
  });

  it("ignores files that are not ledger files", async () => {
    const ledger = fileLedger(root, "w");
    await ledger.append(usage("1", "2026-10-14"));
    await writeFile(join(root, "ledger", "2026-10", "notes.txt"), "hello");
    await mkdir(join(root, "ledger", "not-a-month"), { recursive: true });
    await writeFile(join(root, "ledger", "stray.jsonl"), "x");
    expect((await ledger.read(all)).entries).toHaveLength(1);
    expect(await ledger.months()).toEqual(["2026-10"]);
  });

  it("lists months sorted, and removeMonth deletes a whole month for every writer", async () => {
    const a = fileLedger(root, "window-a");
    const b = fileLedger(root, "window-b");
    await a.append(usage("1", "2026-11-01"));
    await b.append(usage("2", "2025-01-15"));
    await a.append(usage("3", "2025-01-16"));
    expect(await a.months()).toEqual(["2025-01", "2026-11"]);
    await a.removeMonth("2025-01");
    expect(await a.months()).toEqual(["2026-11"]);
    expect(
      (await b.read({ from: "2025-01-01", to: "2027-01-01" })).entries.map((e) => e.id),
    ).toEqual(["1"]);
    await a.removeMonth("2025-01"); // already gone: not an error
  });

  it("removeMonth refuses anything that is not a YYYY-MM month, so it cannot leave the ledger folder", async () => {
    const ledger = fileLedger(root, "w");
    await ledger.append(usage("1", "2026-10-14"));
    for (const bad of ["..", "../ledger", "2026-1", "2026-10/x", "", "latest"]) {
      await expect(ledger.removeMonth(bad)).rejects.toThrow(RangeError);
    }
    expect(await ledger.months()).toEqual(["2026-10"]);
  });

  it("a month removed after being read is not served from the cache", async () => {
    const ledger = fileLedger(root, "w");
    await ledger.append(usage("1", "2026-10-14"));
    expect((await ledger.read(all)).entries).toHaveLength(1);
    await ledger.removeMonth("2026-10");
    expect((await ledger.read(all)).entries).toEqual([]);
  });
});
