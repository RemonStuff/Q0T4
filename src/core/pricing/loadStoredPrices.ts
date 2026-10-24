import type { Diagnostics } from "../diagnostics/diagnostics";
import type { PriceTableStorePort } from "../../ports/PriceSourcePort";
import type { PriceTable } from "./priceTable";

/** The last good price table, or `undefined` when there is none or the file can't be read. */
export async function loadStoredPrices(
  store: PriceTableStorePort,
  diagnostics: Diagnostics,
): Promise<PriceTable | undefined> {
  try {
    return await store.load();
  } catch (error) {
    diagnostics.error("Couldn't read the stored price table.", error);
    diagnostics.warnOnce(
      "price-table",
      "Q0T4 couldn't read its stored price table and is treating it as missing. See the Q0T4 output channel.",
    );
    return undefined;
  }
}
