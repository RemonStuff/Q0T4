import { isResultMetadata } from "../types";
import type { HistoryTurn, SubjectName } from "../types";

/**
 * The subject of the conversation so far. The chat API has no thread id, so it is
 * the subject in the metadata of the newest response turn that carries valid Q0T4
 * metadata, including refusals and `/use` turns. Any non-empty name counts: a repo
 * does not have to be configured.
 */
export function threadSubject(history: readonly HistoryTurn[]): SubjectName | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn?.kind !== "response" || !isResultMetadata(turn.metadata)) continue;
    const subject = turn.metadata.subject.trim();
    if (subject !== "") return subject;
  }
  return undefined;
}
