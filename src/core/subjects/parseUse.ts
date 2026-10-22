import { formatUnknownSubject, formatUseHelp } from "../format/formatUse";
import type { SubjectName } from "../types";

export type UseCommand =
  | { readonly kind: "ask"; readonly subject: SubjectName; readonly question: string }
  | { readonly kind: "setOnly"; readonly subject: SubjectName }
  | { readonly kind: "error"; readonly message: string };

/**
 * Parses what follows `/use`: `<subject> <question>`. The subject must be a known
 * one (matched case-insensitively, returned with its canonical spelling). A subject
 * may contain spaces, so the longest known subject at the start of the text wins,
 * as long as a space or the end follows it. The question keeps its whitespace and
 * newlines exactly.
 */
export function parseUse(prompt: string, known: readonly SubjectName[]): UseCommand {
  const text = prompt.trimStart();
  if (text === "") return { kind: "error", message: formatUseHelp(known) };

  const lower = text.toLowerCase();
  let best: SubjectName | undefined;
  for (const subject of known) {
    const name = subject.toLowerCase();
    const next = text[name.length];
    const endsThere = next === undefined || /\s/.test(next);
    if (
      lower.startsWith(name) &&
      endsThere &&
      (best === undefined || subject.length > best.length)
    ) {
      best = subject;
    }
  }

  if (best === undefined) {
    const typed = text.split(/\s/, 1)[0] as string;
    return { kind: "error", message: formatUnknownSubject(typed, known) };
  }
  const rest = text.slice(best.length).replace(/^\s+/, "");
  return rest.trim() === ""
    ? { kind: "setOnly", subject: best }
    : { kind: "ask", subject: best, question: rest };
}
