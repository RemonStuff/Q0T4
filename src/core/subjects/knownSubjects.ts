import type { Q0T4Config, SubjectName } from "../types";

export interface KnownSubjectsInput {
  readonly config: Q0T4Config;
  /** Subjects with usage in the last 12 weeks, from the ledger. */
  readonly seen: readonly SubjectName[];
  readonly currentRepo?: SubjectName | undefined;
}

/**
 * The subjects `/use` accepts: configured keys, the fallback subject, subjects with
 * recent usage and the current repo. This stops a typo from silently creating a new
 * budget. A subject is listed once; the first spelling wins.
 */
export function knownSubjects({ config, seen, currentRepo }: KnownSubjectsInput): SubjectName[] {
  const known: SubjectName[] = [];
  const have = new Set<string>();
  const candidates = [
    ...Object.keys(config.subjects),
    config.fallbackSubject,
    ...seen,
    ...(currentRepo === undefined ? [] : [currentRepo]),
  ];
  for (const candidate of candidates) {
    const name = candidate.trim();
    if (name === "" || have.has(name.toLowerCase())) continue;
    have.add(name.toLowerCase());
    known.push(name);
  }
  return known;
}
