import { isLedgerEntry } from "../../src/core/types";
import type { DayKey, LedgerEntry } from "../../src/core/types";
import type { PriceTable } from "../../src/core/pricing/priceTable";
import type { LedgerPort, LedgerReadResult } from "../../src/ports/LedgerPort";
import type { PriceTableStorePort } from "../../src/ports/PriceSourcePort";
import type { StoragePort } from "../../src/ports/StoragePort";

/** Key/value storage backed by a Map; values are copied in and out like globalState. */
export class InMemoryStorage implements StoragePort {
  failWrites = false;
  private readonly values = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    const value = this.values.get(key);
    return value === undefined ? undefined : (structuredClone(value) as T);
  }

  async set(key: string, value: unknown): Promise<void> {
    if (this.failWrites) throw new Error("injected write failure");
    this.values.set(key, structuredClone(value));
  }

  keys(): readonly string[] {
    return [...this.values.keys()];
  }
}

/**
 * The append-only ledger, kept as JSON lines per writer like the real files
 * (one per window). `writer(id)` returns another writer on the same ledger.
 */
export class InMemoryLedger implements LedgerPort {
  failAppends = false;

  constructor(
    private readonly writerId = "writer-1",
    private readonly files = new Map<string, string[]>(),
  ) {}

  writer(writerId: string): InMemoryLedger {
    return new InMemoryLedger(writerId, this.files);
  }

  linesOf(writerId: string): readonly string[] {
    return this.files.get(writerId) ?? [];
  }

  injectCorruptLine(line: string, writerId = this.writerId): void {
    this.lines(writerId).push(line);
  }

  async append(entry: LedgerEntry): Promise<void> {
    if (this.failAppends) throw new Error("injected append failure");
    this.lines(this.writerId).push(JSON.stringify(entry));
  }

  async read(range: { readonly from: DayKey; readonly to: DayKey }): Promise<LedgerReadResult> {
    const entries: LedgerEntry[] = [];
    let corrupt = 0;
    for (const line of [...this.files.values()].flat()) {
      const parsed = parse(line);
      if (!isLedgerEntry(parsed)) {
        corrupt++;
      } else if (parsed.day >= range.from && parsed.day < range.to) {
        entries.push(parsed);
      }
    }
    entries.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
    return { entries, corrupt };
  }

  private lines(writerId: string): string[] {
    let lines = this.files.get(writerId);
    if (!lines) this.files.set(writerId, (lines = []));
    return lines;
  }
}

function parse(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

/** Holds the last saved price table, copied in and out. */
export class InMemoryPriceTableStore implements PriceTableStorePort {
  private table: PriceTable | undefined;

  async load(): Promise<PriceTable | undefined> {
    return this.table && structuredClone(this.table);
  }

  async save(table: PriceTable): Promise<void> {
    this.table = structuredClone(table);
  }
}
