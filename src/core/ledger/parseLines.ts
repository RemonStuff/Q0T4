import { isLedgerEntry } from "../types";
import type { LedgerEntry } from "../types";

export interface ParsedLines {
  readonly entries: readonly LedgerEntry[];
  /** Lines that were not valid JSON, failed validation or had an unknown schema version. */
  readonly corrupt: number;
}

/**
 * Parses the text of a JSON Lines ledger file. Unreadable lines are skipped and
 * counted, never thrown. A writer always ends its line with a newline, so text
 * after the last newline is a line another window is still writing: it is ignored
 * and not counted as corrupt.
 */
export function parseLedgerLines(text: string): ParsedLines {
  const lines = text.split("\n");
  lines.pop(); // the text after the last newline: empty, or unfinished
  const entries: LedgerEntry[] = [];
  let corrupt = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      corrupt++;
      continue;
    }
    if (isLedgerEntry(parsed)) entries.push(parsed);
    else corrupt++;
  }
  return { entries, corrupt };
}
