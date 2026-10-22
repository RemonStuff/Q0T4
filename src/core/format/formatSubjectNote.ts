import type { SubjectName } from "../types";

export type SubjectSource = "use" | "thread" | "repo" | "fallback";

/** The short progress note that shows which subject a request is charged to, and why. */
export function formatSubjectNote(subject: SubjectName, source: SubjectSource): string {
  return `Subject: ${subject} (${source})`;
}
