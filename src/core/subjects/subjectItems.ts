import type { SubjectListItem } from "../format/subjectList";
import type { Q0T4Config, SubjectName } from "../types";
import { knownSubjects } from "./knownSubjects";
import { hasOwnWeeklyLimit, subjectDescription, weeklyLimitFor } from "./parseConfig";

export interface SubjectItemsInput {
  readonly config: Q0T4Config;
  /** Subjects with usage in the last 12 weeks, from the ledger. */
  readonly seen: readonly SubjectName[];
  readonly currentRepo?: SubjectName | undefined;
  /** The subject of this conversation. */
  readonly thread?: SubjectName | undefined;
  /** Replaces every limit, in tokens; the integration tests use it. */
  readonly limitOverride?: number | undefined;
}

const same = (a: SubjectName, b: SubjectName | undefined) =>
  b !== undefined && a.toLowerCase() === b.toLowerCase();

/**
 * The rows of `/subjects`: the subjects `/use` accepts (see `knownSubjects`) plus the
 * conversation's own subject, each with its limit, where the limit comes from and its
 * description. Pure: the caller reads the ledger and the workspace.
 */
export function subjectItems(input: SubjectItemsInput): SubjectListItem[] {
  const { config, currentRepo, thread, limitOverride } = input;
  const seen = thread === undefined ? input.seen : [...input.seen, thread];
  return knownSubjects({ config, seen, currentRepo }).map((subject) => {
    const description = subjectDescription(config, subject);
    return {
      subject,
      limit: { tokens: limitOverride ?? weeklyLimitFor(config, subject) },
      limitIsDefault: limitOverride === undefined && !hasOwnWeeklyLimit(config, subject),
      ...(description === undefined || description.trim() === "" ? {} : { description }),
      current: same(subject, currentRepo),
      fallback: same(subject, config.fallbackSubject),
      thread: same(subject, thread),
    };
  });
}
