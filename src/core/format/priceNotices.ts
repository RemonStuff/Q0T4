import { markdownLiteral } from "./markdownLiteral";

/** Shown after the footer when the price list is older than `q0t4.priceMaxAgeHours`. */
export function formatStalePrices(fetchedAt: string): string {
  return `⚠️ Prices may be out of date (fetched ${fetchedAt.slice(0, 10)}).`;
}

/**
 * Shown after the footer when a model has no price. The request was costed at the highest
 * rate, so the number is an upper bound, and the user can fix it.
 */
export function formatUnknownPrice(modelName: string, auto: boolean): string {
  if (auto) {
    return "⚠️ Auto hides which model answered, so this request is costed at the highest rate. Pick a specific model for an exact cost.";
  }
  return `⚠️ No price for ${markdownLiteral(modelName)}; costed at the highest rate. Add it to \`q0t4.modelPrices\` or run **Q0T4: Refresh Model Prices**.`;
}

/** Shown, with a Refresh Model Prices button, when credits mode has no price table at all. */
export function formatNoPrices(): string {
  return "Q0T4 has no model prices yet, so it can't cost this request in credits, and it never guesses. Refresh the prices (this needs a network connection), or set `q0t4.budgetUnit` back to `tokens`.";
}
