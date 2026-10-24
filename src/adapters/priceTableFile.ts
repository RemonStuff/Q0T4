import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isPriceTable } from "../core/pricing/priceTable";
import type { PriceTable } from "../core/pricing/priceTable";
import type { PriceTableStorePort } from "../ports/PriceSourcePort";

let counter = 0;

const BUSY = new Set(["EPERM", "EACCES", "EBUSY"]);
const RENAME_ATTEMPTS = 8;

/** On Windows a rename over a file another process has open fails for a moment; try again. */
async function renameOver(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      if (!BUSY.has(code) || attempt >= RENAME_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 * attempt));
    }
  }
}

/**
 * `PriceTableStorePort` over `<root>/prices/table.json`. A save writes a temporary file
 * next to it and renames it over the table, so a reader sees the old table or the new one,
 * never half of either. A missing file is `undefined`; a file that isn't a price table throws.
 */
export function priceTableFile(root: string): PriceTableStorePort {
  const dir = join(root, "prices");
  const file = join(dir, "table.json");
  // Saves from this window go one after the other; other windows are handled by the retry.
  let queue: Promise<unknown> = Promise.resolve();
  return {
    async load(): Promise<PriceTable | undefined> {
      let text: string;
      try {
        text = await readFile(file, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
      }
      const value: unknown = JSON.parse(text);
      if (!isPriceTable(value)) throw new Error("The stored file is not a price table.");
      return value;
    },
    save(table) {
      const run = queue.then(() => write(table));
      queue = run.catch(() => undefined);
      return run;
    },
  };

  async function write(table: PriceTable): Promise<void> {
    const text = `${JSON.stringify(table, null, 2)}\n`;
    await mkdir(dir, { recursive: true });
    const temporary = join(dir, `table.json.${process.pid}.${counter++}.tmp`);
    try {
      await writeFile(temporary, text, "utf8");
      await renameOver(temporary, file);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }
}
