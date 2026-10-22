import type { LedgerEntry } from "../../src/core/types";
import type { UsageSink } from "../../src/ports/UsageSink";

/** Keeps every recorded entry; `fail` makes the next writes reject or throw. */
export class InMemoryUsageSink implements UsageSink {
  readonly entries: LedgerEntry[] = [];
  fail: "none" | "reject" | "throw" = "none";

  record(entry: LedgerEntry): Promise<void> | void {
    if (this.fail === "throw") throw new Error("injected sink failure");
    if (this.fail === "reject") return Promise.reject(new Error("injected sink failure"));
    this.entries.push(entry);
    return Promise.resolve();
  }
}
