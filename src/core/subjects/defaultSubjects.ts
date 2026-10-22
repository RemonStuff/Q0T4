import type { SubjectConfig, SubjectName } from "../types";

/**
 * Iteration 2 sends every prompt to one subject with a fixed limit and warning
 * level. Settings (#26) and repo subjects (#27-#33) replace these.
 */
export const DEFAULT_SUBJECT: SubjectName = "general";

export const DEFAULT_SUBJECTS: Readonly<Record<SubjectName, SubjectConfig>> = {
  general: { weeklyLimit: 200_000 },
};

export const DEFAULT_WARN_AT_PERCENT = 80;

/** Shown where the footer says when the budget resets, until weekly resets exist (#20, #21). */
export const RESET_UNAVAILABLE_LABEL = "date unavailable";
