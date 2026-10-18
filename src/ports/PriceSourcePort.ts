import type { PriceTable } from "../core/pricing/priceTable";

export type PriceFetchResult =
  | { readonly status: "ok"; readonly table: PriceTable; readonly etag?: string }
  | { readonly status: "unchanged" }
  | { readonly status: "failed"; readonly reasons: readonly string[] };

/**
 * Fetches the current model price table (docs/PLAN.md §9.1). Implemented by
 * `adapters/githubDocsPriceSource` (#50).
 */
export interface PriceSourcePort {
  fetch(previous?: { readonly etag?: string }): Promise<PriceFetchResult>;
}

/** Persists the last good price table. Implemented by `adapters/priceTableFile` (#50). */
export interface PriceTableStorePort {
  load(): Promise<PriceTable | undefined>;
  save(table: PriceTable): Promise<void>;
}
