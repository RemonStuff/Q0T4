import type { ResetDay, SubjectConfig, SubjectName } from "../types";

/**
 * Iteration 2 sends every prompt to one subject with a fixed limit and warning
 * level. Settings (#26) and repo subjects (#27-#33) replace these.
 */
export const DEFAULT_SUBJECT: SubjectName = "general";

export const DEFAULT_SUBJECTS: Readonly<Record<SubjectName, SubjectConfig>> = {
  general: { weeklyLimit: 200_000 },
};

export const DEFAULT_WARN_AT_PERCENT = 80;

export const DEFAULT_DAILY_PACE_WARNING = 30;

export const DEFAULT_RESET_DAY: ResetDay = "monday";
