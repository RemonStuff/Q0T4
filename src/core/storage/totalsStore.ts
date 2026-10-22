import type { StoragePort } from "../../ports/StoragePort";
import type { UsageSink } from "../../ports/UsageSink";
import type { Cost, LedgerEntry, SubjectName } from "../types";

export const TOTALS_KEY = "q0t4.totals";

type Totals = Readonly<Record<SubjectName, Cost>>;

/**
 * One running total per subject, in `StoragePort` (globalState). This is the
 * iteration-2 stand-in for weekly totals: it never resets, and #25 replaces it
 * with totals computed from the ledger (docs/PLAN.md §4).
 *
 * It is a `UsageSink`, so the chat handler records into it. Writes are queued, so
 * requests that finish together never lose an increment. Damaged stored data is
 * ignored, never thrown.
 */
export class TotalsStore implements UsageSink {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly storage: StoragePort) {}

  /** The subject's total so far; zero for an unknown subject. */
  get(subject: SubjectName): Cost {
    return this.read()[subject] ?? { tokens: 0 };
  }

  add(subject: SubjectName, cost: Cost): Promise<void> {
    const write = this.queue.then(() => {
      const totals = this.read();
      const current = totals[subject] ?? { tokens: 0 };
      const credits =
        current.credits === undefined && cost.credits === undefined
          ? undefined
          : (current.credits ?? 0) + (cost.credits ?? 0);
      const next: Cost =
        credits === undefined
          ? { tokens: current.tokens + cost.tokens }
          : { tokens: current.tokens + cost.tokens, credits };
      return this.storage.set(TOTALS_KEY, { ...totals, [subject]: next });
    });
    // A failed write must not block the writes after it.
    this.queue = write.catch(() => undefined);
    return write;
  }

  record(entry: LedgerEntry): Promise<void> {
    return entry.kind === "usage" ? this.add(entry.subject, entry.cost) : Promise.resolve();
  }

  private read(): Totals {
    const stored: unknown = this.storage.get(TOTALS_KEY);
    if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return {};
    const totals: Record<SubjectName, Cost> = {};
    for (const [subject, cost] of Object.entries(stored)) {
      if (isStoredCost(cost)) totals[subject] = cost;
    }
    return totals;
  }
}

function isStoredCost(value: unknown): value is Cost {
  if (typeof value !== "object" || value === null) return false;
  const { tokens, credits } = value as Record<string, unknown>;
  return isCount(tokens) && (credits === undefined || isCount(credits));
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
