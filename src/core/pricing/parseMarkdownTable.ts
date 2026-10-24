import { PriceParseError, parsePrice, parseThreshold } from "./normalise";
import type { FetchMeta } from "./parseYamlTable";
import type { PriceTable } from "./priceTable";
import { atLine, buildModels } from "./tableBuilder";
import type { TierRecord } from "./tableBuilder";

const COLUMNS = {
  model: "model",
  tier: "tier",
  threshold: "threshold",
  input: "input",
  cachedInput: "cached input",
  cacheWrite: "cache write",
  output: "output",
} as const;

const cells = (line: string): string[] => {
  const parts = line.trim().split("|");
  return parts
    .slice(1, parts[parts.length - 1]?.trim() === "" ? -1 : undefined)
    .map((c) => c.trim());
};

/**
 * Reads the pipe tables of the docs article (one per provider, under a `###` heading).
 * Column sets differ per provider; Tier, Threshold and Cache write can be missing.
 * A table whose first column isn't "Model" is not a price table and is skipped.
 */
export function parseMarkdownTable(text: string, meta: FetchMeta): PriceTable {
  const lines = text.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
  const records: TierRecord[] = [];
  let provider: string | undefined;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] as string;
    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    if (heading !== null) {
      provider = heading[1] === "###" ? (heading[2] as string).trim() : undefined;
      continue;
    }
    if (!line.trim().startsWith("|")) continue;

    const start = index;
    while (index + 1 < lines.length && (lines[index + 1] as string).trim().startsWith("|")) index++;
    const block = lines.slice(start, index + 1);
    const header = cells(block[0] as string).map((cell) => cell.toLowerCase());
    if (header[0] !== COLUMNS.model) continue;
    if (provider === undefined) {
      throw new PriceParseError("a price table comes before any provider heading", start + 1);
    }
    const column = (name: string) =>
      header.findIndex((cell) => (name === "threshold" ? cell.startsWith(name) : cell === name));
    for (const required of [COLUMNS.input, COLUMNS.output]) {
      if (column(required) === -1) {
        throw new PriceParseError(
          `the table has no ${required === "input" ? "Input" : "Output"} column`,
          start + 1,
        );
      }
    }
    for (const [offset, row] of block.slice(2).entries()) {
      const rowLine = start + 3 + offset;
      const values = cells(row);
      if (values.every((value) => value === "")) continue;
      if (values.length !== header.length) {
        throw new PriceParseError(
          `expected ${header.length} cells, found ${values.length}`,
          rowLine,
        );
      }
      const at = (name: string) => {
        const position = column(name);
        return position === -1 ? "" : (values[position] as string);
      };
      const tier = at(COLUMNS.tier).trim();
      records.push({
        model: at(COLUMNS.model),
        provider,
        tier: tier === "" ? "Default" : tier,
        threshold: atLine(rowLine, () => parseThreshold(at(COLUMNS.threshold))),
        input: atLine(rowLine, () => parsePrice(at(COLUMNS.input))),
        cachedInput: atLine(rowLine, () => parsePrice(at(COLUMNS.cachedInput))),
        cacheWrite: atLine(rowLine, () => parsePrice(at(COLUMNS.cacheWrite))),
        output: atLine(rowLine, () => parsePrice(at(COLUMNS.output))),
        line: rowLine,
      });
    }
  }

  return {
    fetchedAt: meta.fetchedAt,
    source: "github-docs-article",
    ...(meta.etag === undefined ? {} : { etag: meta.etag }),
    models: buildModels(records),
  };
}
