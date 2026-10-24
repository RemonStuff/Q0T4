/** Shown when the references and the prompt alone do not fit the model's context window. */
export function formatContextTooLong(): string {
  return "This request is too large for the model's context window, even without the earlier messages. Attach less or shorten the prompt.";
}
