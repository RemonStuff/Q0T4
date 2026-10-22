import type { DayKey, LedgerEntry } from "../core/types";

export interface LedgerReadResult {
  readonly entries: readonly LedgerEntry[];
  /** Lines that couldn't be parsed or validated; they're skipped, never thrown. */
  readonly corrupt: number;
}

/**
 * The append-only usage ledger (docs/PLAN.md §4). Implemented by
 * `adapters/fileLedger` over JSON Lines files in `globalStorageUri` (#25).
 */
export interface LedgerPort {
  append(entry: LedgerEntry): Promise<void>;
  /** Entries whose `day` is in `[from, to)`, merged across all writers. */
  read(range: { readonly from: DayKey; readonly to: DayKey }): Promise<LedgerReadResult>;
  /** The months (`YYYY-MM`) that have stored entries, in any order. */
  months(): Promise<readonly string[]>;
  /** Deletes a whole month for every writer; a month that doesn't exist is not an error. */
  removeMonth(month: string): Promise<void>;
}
