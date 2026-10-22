import { isResultMetadata } from "../types";
import type { HistoryTurn, SubjectName } from "../types";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Keeps only the request/response pairs charged to `subject`, in order. A request
 * goes with the response that follows it; the response's Q0T4 metadata says the
 * subject. Pairs from other subjects, without metadata, or without a partner are dropped.
 */
export function filterHistoryBySubject(
  history: readonly HistoryTurn[],
  subject: SubjectName,
): HistoryTurn[] {
  const kept: HistoryTurn[] = [];
  let pending: HistoryTurn | undefined;
  for (const turn of history) {
    if (turn.kind === "request") {
      pending = turn;
      continue;
    }
    if (
      pending !== undefined &&
      isResultMetadata(turn.metadata) &&
      same(turn.metadata.subject, subject)
    ) {
      kept.push(pending, turn);
    }
    pending = undefined;
  }
  return kept;
}
