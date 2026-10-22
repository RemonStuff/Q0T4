/** Shown when the usage ledger can't be read: the request is not sent, because the budget is unknown. */
export function formatLedgerError(): string {
  return "Q0T4 couldn't read its usage record, so it did not send your request. Try again, and check that the extension's storage folder is readable.";
}
