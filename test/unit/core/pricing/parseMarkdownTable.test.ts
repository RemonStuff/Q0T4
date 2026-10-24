import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PriceParseError } from "../../../../src/core/pricing/normalise";
import { parseMarkdownTable } from "../../../../src/core/pricing/parseMarkdownTable";
import { parseYamlTable } from "../../../../src/core/pricing/parseYamlTable";

const meta = { fetchedAt: "2026-10-24T08:00:00.000Z" } as const;
const fixture = (name: string) =>
  readFileSync(join(__dirname, "../../../fixtures/pricing", name), "utf8");
const article = fixture("models-and-pricing.md");
const yaml = fixture("models-and-pricing.yml");

function failure(text: string): PriceParseError {
  try {
    parseMarkdownTable(text, meta);
  } catch (error) {
    return error as PriceParseError;
  }
  throw new Error("expected a parse error");
}

const small = (rows: string) =>
  `### OpenAI\n\n| Model | Release status | Category | Tier | Threshold (input tokens) | Input | Cached input | Cache write | Output |\n| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |\n${rows}\n`;

describe("parseMarkdownTable on the real article", () => {
  const table = parseMarkdownTable(article, meta);

  it("parses every provider table, including tables without Tier or Cache write columns", () => {
    const providers = new Set(table.models.map((model) => model.provider));
    expect([...providers].sort()).toEqual(
      ["anthropic", "google", "microsoft", "moonshot_ai", "openai", "xai"].sort(),
    );
    const mai = table.models.find((model) => model.model === "MAI-Code-1.1-Flash");
    expect(mai?.tiers).toEqual([{ tier: "Default", input: 0.2, cachedInput: 0.02, output: 1.2 }]);
    const gemini = table.models.find((model) => model.model === "Gemini 4 Argon");
    expect(gemini?.tiers).toEqual([{ tier: "Default", input: 2, cachedInput: 0.1, output: 10 }]);
  });

  it("skips the empty rows of the rendered tables and the empty Fine-tuned table", () => {
    expect(table.models.every((model) => model.model !== "")).toBe(true);
    expect(table.models.some((model) => model.provider.startsWith("fine"))).toBe(false);
  });

  it("carries the fetch metadata and the article source", () => {
    expect(table.source).toBe("github-docs-article");
    expect(table.fetchedAt).toBe(meta.fetchedAt);
  });

  it("strips footnote markers from model names", () => {
    expect(table.models.map((model) => model.model)).toContain("Gemini 3.8 Flash");
  });

  it("YAML and Markdown snapshots of the same day produce equal tables", () => {
    // The article lists Microsoft before xAI and the YAML the other way round; the order is
    // presentation, so compare by provider and model.
    const byName = (
      a: { provider: string; model: string },
      b: { provider: string; model: string },
    ) => `${a.provider}/${a.model}`.localeCompare(`${b.provider}/${b.model}`);
    const fromYaml = parseYamlTable(yaml, meta);
    expect([...table.models].sort(byName)).toEqual([...fromYaml.models].sort(byName));
  });
});

describe("parseMarkdownTable details", () => {
  it("reads thresholds, tiers and prices of a row", () => {
    const table = parseMarkdownTable(
      small("| GPT-X | GA | Powerful | Long context | > 272K | $4.00 | $0.40 | $5.00 | $15.00 |"),
      meta,
    );
    expect(table.models).toEqual([
      {
        model: "GPT-X",
        provider: "openai",
        tiers: [
          {
            tier: "Long context",
            threshold: { op: "gt", tokens: 272_000 },
            input: 4,
            cachedInput: 0.4,
            cacheWrite: 5,
            output: 15,
          },
        ],
      },
    ]);
  });

  it("accepts rows without the closing pipe and carries the etag", () => {
    const text = small("| A | GA | x | Default | Not applicable | $1 | $1 | $1 | $2");
    const table = parseMarkdownTable(text, { ...meta, etag: '"e"' });
    expect(table.models[0]?.tiers[0]?.output).toBe(2);
    expect(table.etag).toBe('"e"');
  });

  it("makes a provider id from its heading", () => {
    const text = small("| A | GA | x | Default | Not applicable | $1 | $1 | $1 | $1 |").replace(
      "### OpenAI",
      "### Moonshot AI",
    );
    expect(parseMarkdownTable(text, meta).models[0]?.provider).toBe("moonshot_ai");
  });

  it("ignores tables whose first column is not Model, and text outside tables", () => {
    const text = `Intro\n\n| Plan | Credits |\n| --- | --- |\n| Pro | 1500 |\n\n${small("| A | GA | x | Default | Not applicable | $1 | $1 | $1 | $1 |")}`;
    expect(parseMarkdownTable(text, meta).models.map((m) => m.model)).toEqual(["A"]);
  });

  it("returns an empty table when there are no price tables", () => {
    expect(parseMarkdownTable("# Nothing here\n", meta).models).toEqual([]);
  });

  it("accepts Windows line endings", () => {
    const text = small("| A | GA | x | Default | Not applicable | $1 | $1 | $1 | $1 |");
    expect(parseMarkdownTable(text.replaceAll("\n", "\r\n"), meta).models).toHaveLength(1);
  });

  it("rejects a row with the wrong number of cells, with its line number", () => {
    const error = failure(small("| A | GA | x | Default |"));
    expect(error.line).toBe(5);
    expect(error.message).toMatch(/cells/);
  });

  it("rejects a table without the Model, Input or Output column", () => {
    const text = "### OpenAI\n\n| Model | Output |\n| --- | --- |\n| A | $1 |\n";
    const error = failure(text);
    expect(error.line).toBe(3);
    expect(error.message).toMatch(/Input/);
    expect(failure("### X\n\n| Model | Input |\n| --- | --- |\n| A | $1 |\n").message).toMatch(
      /Output/,
    );
  });

  it("rejects a price table before any provider heading", () => {
    const text = "| Model | Input | Output |\n| --- | ---: | ---: |\n| A | $1 | $2 |\n";
    expect(failure(text).message).toMatch(/provider/i);
  });

  it("rejects a bad price or threshold with the row's line", () => {
    expect(
      failure(small("| A | GA | x | Default | Not applicable | cheap | $1 | $1 | $1 |")).line,
    ).toBe(5);
    expect(failure(small("| A | GA | x | Default | huge | $1 | $1 | $1 | $1 |")).line).toBe(5);
  });

  it("rejects a row without input or output price", () => {
    expect(
      failure(small("| A | GA | x | Default | Not applicable | Not applicable | $1 | $1 | $1 |"))
        .message,
    ).toMatch(/input/);
  });

  it("rejects a tier that appears twice for one model", () => {
    const row = "| A | GA | x | Default | Not applicable | $1 | $1 | $1 | $1 |";
    expect(failure(small(`${row}\n${row}`)).message).toMatch(/twice|duplicate/i);
  });
});
