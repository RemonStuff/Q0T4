/** Shown when `/status` can't read the usage ledger. */
export function formatStatusError(): string {
  return "Q0T4 couldn't read its usage record, so it can't show the status. Check that the extension's storage folder is readable and try again.";
}
