import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isPriceTable } from "../core/pricing/priceTable";
import type { PriceTable } from "../core/pricing/priceTable";
import type { PriceTableStorePort } from "../ports/PriceSourcePort";

let counter = 0;

/**
 * `PriceTableStorePort` over `<root>/prices/table.json`. A save writes a temporary file
 * next to it and renames it over the table, so a reader sees the old table or the new one,
 * never half of either. A missing file is `undefined`; a file that isn't a price table throws.
 */
export function priceTableFile(root: string): PriceTableStorePort {
  const dir = join(root, "prices");
  const file = join(dir, "table.json");
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
    async save(table) {
      const text = `${JSON.stringify(table, null, 2)}\n`;
      await mkdir(dir, { recursive: true });
      const temporary = join(dir, `table.json.${process.pid}.${counter++}.tmp`);
      try {
        await writeFile(temporary, text, "utf8");
        await rename(temporary, file);
      } catch (error) {
        await rm(temporary, { force: true });
        throw error;
      }
    },
  };
}
