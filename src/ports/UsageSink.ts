import type { LedgerEntry } from "../core/types";

/**
 * Where the chat handler records what a request used (docs/PLAN.md §4, issue #16).
 * Implemented by an in-memory sink in tests, a globalState totals store in #19,
 * and the `Ledger` in #25. A failed write rejects or throws; the handler reports
 * it and carries on.
 */
export interface UsageSink {
  record(entry: LedgerEntry): void | Promise<void>;
}
