import { atLine, buildModels } from "./tableBuilder";
import type { TierRecord } from "./tableBuilder";
import { PriceParseError, parsePrice, parseThreshold } from "./normalise";
import type { PriceTable } from "./priceTable";

export interface FetchMeta {
  readonly fetchedAt: string;
  readonly etag?: string;
}

interface RawRecord {
  readonly line: number;
  readonly fields: Map<string, { readonly value: string; readonly line: number }>;
}

const KEY = /^([A-Za-z_][A-Za-z0-9_]*):(?:[ ]+(.*))?$/;
const FORBIDDEN_START = /^[[{&*!|>%@`]/;

/**
 * Reads exactly the YAML subset of GitHub's `models-and-pricing.yml`: a list of flat
 * `- key: value` records, scalars that are unquoted, 'single' or "double" quoted, and `#`
 * comments. Anything else is a `PriceParseError` with a line number, never a guess.
 */
export function parseYamlTable(text: string, meta: FetchMeta): PriceTable {
  const records: RawRecord[] = [];
  let current: RawRecord | undefined;

  const lines = text.split("\n");
  for (const [index, raw] of lines.entries()) {
    const line = index + 1;
    const content = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (/^\s*(#.*)?$/.test(content)) continue;
    if (/^\s*\t|^ *\t/.test(content)) {
      throw new PriceParseError("tabs are not allowed for indentation", line);
    }
    if (content === "---" || content === "...") {
      throw new PriceParseError("document markers are not supported", line);
    }
    let field: string;
    if (content.startsWith("- ")) {
      current = { line, fields: new Map() };
      records.push(current);
      field = content.slice(2);
    } else if (/^ {2}\S/.test(content)) {
      if (current === undefined) {
        throw new PriceParseError("a key must be inside a list item that starts with '- '", line);
      }
      field = content.slice(2);
    } else if (/^\s/.test(content)) {
      throw new PriceParseError("unsupported indentation; keys sit 2 spaces in", line);
    } else {
      throw new PriceParseError("a key must be inside a list item that starts with '- '", line);
    }
    if (field.startsWith("- ")) {
      throw new PriceParseError("nested lists are not supported", line);
    }
    const match = KEY.exec(field);
    if (match === null || current === undefined) {
      throw new PriceParseError(`expected "key: value", found "${field}"`, line);
    }
    const key = match[1] as string;
    if (current.fields.has(key)) throw new PriceParseError(`duplicate key "${key}"`, line);
    current.fields.set(key, { value: scalar(match[2] ?? "", line), line });
  }

  return {
    fetchedAt: meta.fetchedAt,
    source: "github-docs-yaml",
    ...(meta.etag === undefined ? {} : { etag: meta.etag }),
    models: buildModels(records.map(toTierRecord)),
  };
}

function toTierRecord(record: RawRecord): TierRecord {
  const get = (key: string) => record.fields.get(key);
  const required = (key: string): string => {
    const field = get(key);
    if (field === undefined || field.value === "") {
      throw new PriceParseError(`record is missing "${key}"`, record.line);
    }
    return field.value;
  };
  const price = (key: string): number | undefined => {
    const field = get(key);
    return field === undefined ? undefined : atLine(field.line, () => parsePrice(field.value));
  };
  const threshold = get("threshold");
  const tier = get("tier")?.value.trim();
  const model = required("model");
  const provider = required("provider");
  // A missing price is reported by name, so check for presence before parsing.
  required("input");
  required("output");
  return {
    model,
    provider,
    tier: tier === undefined || tier === "" ? "Default" : tier,
    threshold:
      threshold === undefined
        ? undefined
        : atLine(threshold.line, () => parseThreshold(threshold.value)),
    input: price("input"),
    cachedInput: price("cached_input"),
    cacheWrite: price("cache_write"),
    output: price("output"),
    line: record.line,
  };
}

/** One scalar: unquoted, 'single' or "double" quoted, with an optional trailing comment. */
function scalar(raw: string, line: number): string {
  const text = raw.trim();
  if (text === "" || text.startsWith("#")) return "";
  const quote = text[0];
  if (quote === "'" || quote === '"') return quoted(text, quote, line);
  if (FORBIDDEN_START.test(text)) {
    throw new PriceParseError(`unsupported YAML construct "${text}"`, line);
  }
  const value = text.replace(/\s+#.*$/, "").trim();
  if (/:(\s|$)/.test(value)) {
    throw new PriceParseError(`unsupported YAML value "${text}"`, line);
  }
  return value;
}

function quoted(text: string, quote: string, line: number): string {
  let value = "";
  let i = 1;
  for (; i < text.length; i++) {
    const char = text[i] as string;
    if (quote === "'" && char === "'") {
      if (text[i + 1] === "'") {
        value += "'";
        i++;
        continue;
      }
      break;
    }
    if (quote === '"' && char === '"') break;
    if (quote === '"' && char === "\\") {
      const next = text[i + 1];
      if (next !== '"' && next !== "\\") {
        throw new PriceParseError(`unsupported escape "\\${next ?? ""}"`, line);
      }
      value += next;
      i++;
      continue;
    }
    value += char;
  }
  if (i >= text.length) throw new PriceParseError("unterminated quoted value", line);
  const rest = text.slice(i + 1).trim();
  if (rest !== "" && !rest.startsWith("#")) {
    throw new PriceParseError(`unexpected text after the closing quote: "${rest}"`, line);
  }
  return value;
}
