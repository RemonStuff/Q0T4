import { CreditCostModel } from "../cost/creditCostModel";
import type { CostModel } from "../cost/costModel";
import { TokenCostModel } from "../cost/tokenCostModel";
import { formatNoPrices, formatStalePrices } from "../format/priceNotices";
import type { ChatOutputPort } from "../../ports/ChatOutputPort";
import { COMMAND_IDS } from "../commands";
import type { PriceRefresher } from "./priceRefresher";
import type { Q0T4Config } from "../types";

export type CostSetup =
  | { readonly kind: "ready"; readonly costModel: CostModel; readonly notices: readonly string[] }
  /** Credits mode without any price table: the request must be refused, never guessed. */
  | { readonly kind: "noPrices" };

/**
 * The cost model for the active budget unit. Tokens need nothing. Credits need a price
 * table: without one there is no way to cost a request, and a stale one only adds a notice.
 */
export function costModelFor(
  settings: Pick<Q0T4Config, "budgetUnit" | "modelPrices">,
  prices: Pick<PriceRefresher, "currentTable" | "isStale"> | undefined,
): CostSetup {
  if (settings.budgetUnit === "tokens") {
    return { kind: "ready", costModel: new TokenCostModel(), notices: [] };
  }
  const table = prices?.currentTable();
  if (table === undefined || prices === undefined) return { kind: "noPrices" };
  return {
    kind: "ready",
    costModel: new CreditCostModel(table, settings.modelPrices),
    notices: prices.isStale() ? [formatStalePrices(table.fetchedAt)] : [],
  };
}

/** Answers a request that can't be costed: says why, offers the refresh button, charges nothing. */
export function refuseWithoutPrices(output: Pick<ChatOutputPort, "markdown" | "button">): {
  readonly metadata: { readonly outcome: "refused"; readonly stopped: "precheck" };
} {
  output.markdown(formatNoPrices());
  output.button(COMMAND_IDS.refreshPrices, "Refresh Model Prices");
  return { metadata: { outcome: "refused", stopped: "precheck" } };
}
