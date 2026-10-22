import { FOOTER_SENTINEL } from "../format/footer";

/**
 * Removes the footer and warnings Q0T4 appended to a reply, so they are never
 * sent back to the model. Everything from the last sentinel on is dropped, so a
 * reply that merely quotes the sentinel keeps its earlier content.
 */
export function stripFooter(text: string): string {
  const index = text.lastIndexOf(FOOTER_SENTINEL);
  return index === -1 ? text : text.slice(0, index).trimEnd();
}
