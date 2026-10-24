import { limitCost } from "./cost/limitCost";
import type { StatusRow } from "./format/statusTable";
import { knownSubjects } from "./subjects/knownSubjects";
import { hasOwnWeeklyLimit, weeklyLimitFor } from "./subjects/parseConfig";
import type { Cost, DayKey, Q0T4Config, SubjectName } from "./types";

/** What the status views read from the ledger; `Ledger` implements it. */
export interface StatusLedger {
  subjectsSeen(since?: DayKey): Promise<readonly SubjectName[]>;
  weekUsage(subject: SubjectName): Promise<{ readonly used: Cost; readonly requests: number }>;
  usedToday(subject: SubjectName): Promise<Cost>;
}

export interface StatusRowsInput {
  readonly config: Q0T4Config;
  readonly ledger: StatusLedger;
  /** First day of the current budget week. */
  readonly weekStart: DayKey;
  /** The repo of the open folder. */
  readonly currentRepo: SubjectName | undefined;
  /** Subjects to include even without usage or settings, e.g. the one the status bar shows. */
  readonly extra?: readonly SubjectName[];
  /** Replaces every limit, in tokens; the integration tests use it. */
  readonly limitOverride?: number | undefined;
}

/**
 * One row per known subject: configured, used this week, the current repo and `extra`.
 * Throws when the ledger can't be read, so the caller decides what to show.
 */
export async function buildStatusRows(input: StatusRowsInput): Promise<StatusRow[]> {
  const { config, ledger, currentRepo, limitOverride } = input;
  const seen = [...(await ledger.subjectsSeen(input.weekStart)), ...(input.extra ?? [])];
  const subjects = knownSubjects({ config, seen, currentRepo });
  // A week of token-only entries has no credits yet: in credits mode that is 0, not missing.
  const inUnit = (cost: Cost): Cost =>
    config.budgetUnit === "credits" ? { ...cost, credits: cost.credits ?? 0 } : cost;
  return Promise.all(
    subjects.map(async (subject) => {
      const [{ used, requests }, today] = await Promise.all([
        ledger.weekUsage(subject),
        ledger.usedToday(subject),
      ]);
      const limit = limitOverride ?? weeklyLimitFor(config, subject);
      return {
        subject,
        used: inUnit(used),
        today: inUnit(today),
        requests,
        budget: limitCost(config.budgetUnit, limit),
        limitIsDefault: limitOverride === undefined && !hasOwnWeeklyLimit(config, subject),
        current: currentRepo !== undefined && currentRepo.toLowerCase() === subject.toLowerCase(),
      };
    }),
  );
}
