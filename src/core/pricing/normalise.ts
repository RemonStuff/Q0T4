import type { PriceThreshold } from "./priceTable";

/** A price source that doesn't look like the format we know. Never guessed around. */
export class PriceParseError extends Error {
  constructor(
    message: string,
    readonly line?: number,
  ) {
    super(line === undefined ? message : `line ${line}: ${message}`);
    this.name = "PriceParseError";
  }
}

/** The model name without footnote markers like `[^gemini-flash-promo]`, on one line. */
export function normaliseModelName(raw: string): string {
  return raw
    .replace(/\[\^[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lower-case id of a provider: `Moonshot AI` and `moonshot_ai` are both `moonshot_ai`. */
export function providerId(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const NOT_APPLICABLE = /^(not applicable|-|—)?$/i;

/** `$2.50` is 2.5; `Not applicable` and an empty cell are `undefined`. */
export function parsePrice(text: string): number | undefined {
  const value = text.trim();
  if (NOT_APPLICABLE.test(value)) return undefined;
  const match = /^\$(\d[\d,]*(?:\.\d+)?)$/.exec(value);
  if (match === null) throw new PriceParseError(`invalid price "${value}"`);
  return Number((match[1] as string).replaceAll(",", ""));
}

const MULTIPLIERS: Readonly<Record<string, number>> = { "": 1, k: 1_000, m: 1_000_000 };

/** `≤ 272K` is `{ op: "lte", tokens: 272000 }`; `Not applicable` is `undefined`. */
export function parseThreshold(text: string): PriceThreshold | undefined {
  const value = text.trim();
  if (NOT_APPLICABLE.test(value)) return undefined;
  const match = /^(≤|<=|>)\s*(\d+(?:\.\d+)?)\s*([kKmM]?)$/.exec(value);
  const tokens =
    match === null
      ? 0
      : Math.round(Number(match[2]) * (MULTIPLIERS[(match[3] as string).toLowerCase()] as number));
  if (match === null || tokens <= 0) {
    throw new PriceParseError(`invalid threshold "${value}"`);
  }
  return { op: match[1] === ">" ? "gt" : "lte", tokens };
}
