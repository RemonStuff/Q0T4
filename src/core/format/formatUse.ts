import type { SubjectName } from "../types";
import { markdownLiteral } from "./markdownLiteral";

const LIST_LIMIT = 20;

function list(known: readonly SubjectName[]): string {
  if (known.length === 0) return "none yet";
  const shown = known.slice(0, LIST_LIMIT).map((subject) => `\`${markdownLiteral(subject)}\``);
  const more = known.length - shown.length;
  return `${shown.join(", ")}${more > 0 ? ` and ${more} more` : ""}`;
}

export function formatUseHelp(known: readonly SubjectName[]): string {
  return (
    "Use `/use <subject> <question>` to charge a question to a subject, or `/use <subject>` " +
    "to switch this conversation to it.\n\n" +
    `Known subjects: ${list(known)}.`
  );
}

export function formatUnknownSubject(typed: string, known: readonly SubjectName[]): string {
  return (
    `Q0T4 doesn't know the subject \`${markdownLiteral(typed)}\`, so nothing was sent.\n\n` +
    `Known subjects: ${list(known)}.`
  );
}

export function formatUseConfirmation(subject: SubjectName): string {
  return `Subject set to \`${markdownLiteral(subject)}\`. Your next messages in this conversation are charged to it.`;
}
