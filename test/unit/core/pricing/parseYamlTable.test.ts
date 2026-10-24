import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseYamlTable } from "../../../../src/core/pricing/parseYamlTable";
import { PriceParseError } from "../../../../src/core/pricing/normalise";

const meta = { fetchedAt: "2026-10-24T08:00:00.000Z" } as const;
const snapshot = readFileSync(
  join(__dirname, "../../../fixtures/pricing/models-and-pricing.yml"),
  "utf8",
);

const record = (extra = "") =>
  `- model: GPT-5 mini\n  provider: openai\n  input: $0.25\n  output: $2.00\n${extra}`;

function failure(text: string): PriceParseError {
  try {
    parseYamlTable(text, meta);
  } catch (error) {
    return error as PriceParseError;
  }
  throw new Error("expected a parse error");
}

describe("parseYamlTable on the real snapshot", () => {
  const table = parseYamlTable(snapshot, { ...meta, etag: '"abc"' });

  it("parses every record", () => {
    const records = snapshot.split("\n").filter((line) => line.startsWith("- model:")).length;
    const tiers = table.models.reduce((sum, model) => sum + model.tiers.length, 0);
    expect(records).toBeGreaterThan(30);
    expect(tiers).toBe(records);
  });

  it("carries the fetch metadata", () => {
    expect(table.source).toBe("github-docs-yaml");
    expect(table.fetchedAt).toBe(meta.fetchedAt);
    expect(table.etag).toBe('"abc"');
  });

  it("groups Default and Long context records of one model into tiers", () => {
    const sol = table.models.find((model) => model.model === "GPT-6.1 Sol");
    expect(sol?.tiers).toEqual([
      {
        tier: "Default",
        threshold: { op: "lte", tokens: 272_000 },
        input: 2,
        cachedInput: 0.1,
        cacheWrite: 2.5,
        output: 10,
      },
      {
        tier: "Long context",
        threshold: { op: "gt", tokens: 272_000 },
        input: 4,
        cachedInput: 0.2,
        cacheWrite: 5,
        output: 15,
      },
    ]);
  });

  it("strips footnote markers from model names", () => {
    expect(table.models.map((model) => model.model)).toContain("Gemini 3.8 Flash");
    expect(table.models.some((model) => model.model.includes("[^"))).toBe(false);
  });

  it("reads Not applicable as no threshold and no cache write", () => {
    const codex = table.models.find((model) => model.model === "GPT-5.3-Codex");
    expect(codex?.tiers).toEqual([
      { tier: "Default", input: 1.75, cachedInput: 0.175, output: 14 },
    ]);
  });

  it("gives a record without tier or threshold the Default tier", () => {
    const kimi = table.models.find((model) => model.model === "Kimi K3");
    expect(kimi).toEqual({
      model: "Kimi K3",
      provider: "moonshot_ai",
      tiers: [{ tier: "Default", input: 3, cachedInput: 0.3, output: 15 }],
    });
  });
});

describe("parseYamlTable scalars", () => {
  it("parses quoted and unquoted model names identically", () => {
    const quoted = parseYamlTable(record().replace("GPT-5 mini", "'GPT-5 mini'"), meta);
    const double = parseYamlTable(record().replace("GPT-5 mini", '"GPT-5 mini"'), meta);
    const plain = parseYamlTable(record(), meta);
    expect(quoted.models).toEqual(plain.models);
    expect(double.models).toEqual(plain.models);
  });

  it("understands escapes in quoted scalars", () => {
    const single = parseYamlTable(record().replace("GPT-5 mini", "'It''s'"), meta);
    expect(single.models[0]?.model).toBe("It's");
    const double = parseYamlTable(record().replace("GPT-5 mini", '"a \\"b\\" \\\\ c"'), meta);
    expect(double.models[0]?.model).toBe('a "b" \\ c');
  });

  it("ignores comment lines, blank lines and trailing comments", () => {
    const text = `# header\n\n${record().replace("openai", "openai # the provider")}\n# between\n\n`;
    expect(parseYamlTable(text, meta).models[0]?.provider).toBe("openai");
  });

  it("keeps a # inside quotes", () => {
    const table = parseYamlTable(record().replace("GPT-5 mini", "'GPT #5'"), meta);
    expect(table.models[0]?.model).toBe("GPT #5");
  });

  it("ignores unknown keys such as notes", () => {
    const table = parseYamlTable(record("  notes: hello world\n"), meta);
    expect(table.models).toHaveLength(1);
  });

  it("returns an empty table for a file with no records", () => {
    expect(parseYamlTable("# nothing\n", meta).models).toEqual([]);
  });

  it("accepts Windows line endings", () => {
    expect(parseYamlTable(record().replaceAll("\n", "\r\n"), meta).models).toHaveLength(1);
  });
});

describe("parseYamlTable rejects anything outside the supported subset, with a line number", () => {
  const cases: [string, string, number][] = [
    ["a nested mapping", `- model: A\n  provider:\n    name: x\n  input: $1\n  output: $1\n`, 3],
    ["a flow sequence", record("  tags: [a, b]\n"), 5],
    ["a flow mapping", record("  tags: {a: b}\n"), 5],
    ["an anchor", record("  x: &a 1\n"), 5],
    ["an alias", record("  x: *a\n"), 5],
    ["a tag", record("  x: !!str 1\n"), 5],
    ["a block scalar", record("  x: |\n"), 5],
    ["a folded scalar", record("  x: >\n"), 5],
    ["a tab for indentation", "- model: A\n\tprovider: x\n", 2],
    ["a wrong indentation", "- model: A\n   provider: x\n", 2],
    ["a key outside a record", "model: A\n", 1],
    ["a line without a colon", "- model: A\n  provider\n", 2],
    ["a document marker", "---\n- model: A\n", 1],
    ["an unterminated quote", "- model: 'A\n", 1],
    ["text after a closing quote", "- model: 'A' x\n", 1],
    ["a duplicate key", record("  input: $2\n"), 5],
    ["a bad double-quote escape", '- model: "a\\qb"\n', 1],
    ["a backslash at the end of a quoted value", '- model: "a\\', 1],
    ["a nested list", "- model: A\n  - x\n", 2],
    ["a list item with a bare value", "- A\n", 1],
  ];
  it.each(cases)("%s", (_name, text, line) => {
    const error = failure(text);
    expect(error).toBeInstanceOf(PriceParseError);
    expect(error.line).toBe(line);
    expect(error.message).toMatch(new RegExp(`^line ${line}: `));
  });

  it("rejects an indented key before any record", () => {
    const error = failure("  model: A\n");
    expect(error.line).toBe(1);
    expect(error.message).toMatch(/list item/);
  });

  it("reads a value that is only a comment as empty, and rejects a colon inside a value", () => {
    expect(parseYamlTable(record("  x: # only a comment\n"), meta).models).toHaveLength(1);
    expect(failure(record("  x: a: b\n")).line).toBe(5);
  });

  it("rejects a model without an output price", () => {
    expect(failure(record().replace("$2.00", "Not applicable")).message).toMatch(/output/);
  });

  it("rejects a record missing a required field", () => {
    expect(failure("- model: A\n  provider: x\n  input: $1\n").message).toMatch(/output/);
    expect(failure("- provider: x\n  input: $1\n  output: $1\n").message).toMatch(/model/);
    expect(failure("- model: A\n  input: $1\n  output: $1\n").message).toMatch(/provider/);
    expect(failure("- model: A\n  provider: x\n  output: $1\n").message).toMatch(/input/);
  });

  it("rejects a model without a usable price", () => {
    expect(failure(record().replace("$0.25", "free")).message).toMatch(/price/i);
    expect(failure(record().replace("$0.25", "Not applicable")).message).toMatch(/input/);
  });

  it("rejects a bad threshold with the line of the record", () => {
    expect(failure(record("  threshold: lots\n")).message).toMatch(/threshold/i);
  });

  it("rejects a tier that appears twice for one model", () => {
    expect(failure(`${record()}\n${record()}`).message).toMatch(/twice|duplicate/i);
  });
});
