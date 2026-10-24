import { appendFile, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { parseLedgerLines } from "../core/ledger/parseLines";
import { addDays } from "../core/time/budgetCalendar";
import type { DayKey, LedgerEntry } from "../core/types";
import type { LedgerPort, LedgerReadResult } from "../ports/LedgerPort";

const MONTH = /^\d{4}-\d{2}$/;

interface Cached {
  readonly size: number;
  readonly mtimeMs: number;
  readonly entries: readonly LedgerEntry[];
  readonly corrupt: number;
}

/**
 * `LedgerPort` over JSON Lines files: `<root>/ledger/<YYYY-MM>/<writerId>.jsonl`
 * (docs/PLAN.md §4). Every window appends only to its own file, so no lock is
 * needed; reads merge every file of the months in range. A parsed file is cached
 * until its size or modification time changes. `fs` is used because
 * `workspace.fs` can't append.
 */
export function fileLedger(root: string, writerId: string): LedgerPort {
  const ledgerDir = join(root, "ledger");
  const ownFile = `${writerId.replace(/[^A-Za-z0-9._-]/g, "_")}.jsonl`;
  const cache = new Map<string, Cached>();

  async function listMonths(): Promise<string[]> {
    try {
      const names = await readdir(ledgerDir, { withFileTypes: true });
      return names
        .filter((entry) => entry.isDirectory() && MONTH.test(entry.name))
        .map((entry) => entry.name)
        .sort();
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
  }

  async function readFileCached(path: string): Promise<Cached | undefined> {
    try {
      const { size, mtimeMs } = await stat(path);
      const hit = cache.get(path);
      if (hit !== undefined && hit.size === size && hit.mtimeMs === mtimeMs) return hit;
      const parsed = parseLedgerLines(await readFile(path, "utf8"));
      const fresh = { size, mtimeMs, entries: parsed.entries, corrupt: parsed.corrupt };
      cache.set(path, fresh);
      return fresh;
    } catch (error) {
      if (isMissing(error)) return undefined; // removed while we were reading
      throw error;
    }
  }

  return {
    async append(entry) {
      const dir = join(ledgerDir, entry.day.slice(0, 7));
      await mkdir(dir, { recursive: true });
      await appendFile(join(dir, ownFile), `${JSON.stringify(entry)}\n`, "utf8");
    },

    async read(range: { readonly from: DayKey; readonly to: DayKey }): Promise<LedgerReadResult> {
      if (range.to <= range.from) return { entries: [], corrupt: 0 };
      const first = range.from.slice(0, 7);
      const last = addDays(range.to, -1).slice(0, 7);
      const entries: LedgerEntry[] = [];
      let corrupt = 0;
      for (const month of (await listMonths()).filter((m) => m >= first && m <= last)) {
        const dir = join(ledgerDir, month);
        let files: string[];
        try {
          files = (await readdir(dir)).filter((name) => name.endsWith(".jsonl"));
        } catch (error) {
          if (isMissing(error)) continue;
          throw error;
        }
        for (const name of files) {
          let file: Cached | undefined;
          try {
            file = await readFileCached(join(dir, name));
          } catch {
            corrupt += 1; // an unreadable file is skipped and counted, never thrown
            continue;
          }
          if (file === undefined) continue;
          corrupt += file.corrupt;
          for (const entry of file.entries) {
            if (entry.day >= range.from && entry.day < range.to) entries.push(entry);
          }
        }
      }
      entries.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
      return { entries, corrupt };
    },

    months: listMonths,

    async removeMonth(month) {
      if (!MONTH.test(month)) throw new RangeError(`Not a ledger month: ${month}`);
      const dir = join(ledgerDir, month);
      await rm(dir, { recursive: true, force: true });
      for (const path of [...cache.keys()]) if (path.startsWith(dir)) cache.delete(path);
    },
  };
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}
