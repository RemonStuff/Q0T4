import { BUDGET_UNITS } from "../types";
import type { BudgetUnit, Q0T4Config, ResetDay, SubjectConfig, SubjectName } from "../types";

const RESET_DAYS: readonly ResetDay[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/** The settings when nothing is set (docs/PLAN.md §3). package.json declares the same defaults. */
export const DEFAULT_CONFIG: Q0T4Config = {
  budgetUnit: "tokens",
  subjects: { general: { weeklyLimit: 200_000 } },
  defaultLimit: 150_000,
  fallbackSubject: "general",
  resetDay: "monday",
  warnAtPercent: 80,
  dailyPaceWarning: 30,
  includeHistory: true,
};

export interface ParsedConfig {
  readonly config: Q0T4Config;
  /** One message per broken setting, for the user to fix. */
  readonly warnings: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isAmount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

/**
 * Validates the raw `q0t4.*` values. It never throws: a broken value falls back to
 * its default and adds a warning. `null` and `undefined` mean "not set".
 */
export function parseConfig(raw: unknown): ParsedConfig {
  const input = isRecord(raw) ? raw : {};
  const warnings: string[] = [];
  const warn = (message: string) => warnings.push(message);
  const unset = (value: unknown) => value === undefined || value === null;

  const defaultLimit = unset(input["defaultLimit"])
    ? DEFAULT_CONFIG.defaultLimit
    : isAmount(input["defaultLimit"])
      ? input["defaultLimit"]
      : (warn(
          `q0t4.defaultLimit must be a number of 0 or more; using ${DEFAULT_CONFIG.defaultLimit}.`,
        ),
        DEFAULT_CONFIG.defaultLimit);

  const fallback = input["fallbackSubject"];
  let fallbackSubject = DEFAULT_CONFIG.fallbackSubject;
  if (!unset(fallback)) {
    if (typeof fallback === "string" && fallback.trim() !== "") fallbackSubject = fallback.trim();
    else warn(`q0t4.fallbackSubject must be a non-empty name; using "${fallbackSubject}".`);
  }

  const day = input["resetDay"];
  let resetDay = DEFAULT_CONFIG.resetDay;
  if (!unset(day)) {
    const match = RESET_DAYS.find((d) => typeof day === "string" && d === day.trim().toLowerCase());
    if (match !== undefined) resetDay = match;
    else warn(`q0t4.resetDay must be a weekday from monday to sunday; using ${resetDay}.`);
  }

  const unitRaw = input["budgetUnit"];
  let budgetUnit: BudgetUnit = DEFAULT_CONFIG.budgetUnit;
  if (!unset(unitRaw)) {
    const match = BUDGET_UNITS.find((u) => u === unitRaw);
    if (match !== undefined) budgetUnit = match;
    else warn(`q0t4.budgetUnit must be "tokens" or "credits"; using ${budgetUnit}.`);
  }

  let includeHistory = DEFAULT_CONFIG.includeHistory;
  if (!unset(input["includeHistory"])) {
    if (typeof input["includeHistory"] === "boolean") includeHistory = input["includeHistory"];
    else warn("q0t4.includeHistory must be true or false; using true.");
  }

  const percent = (key: "warnAtPercent" | "dailyPaceWarning"): number => {
    const value = input[key];
    const fallbackValue = DEFAULT_CONFIG[key];
    if (unset(value)) return fallbackValue;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      warn(`q0t4.${key} must be a number from 1 to 100; using ${fallbackValue}.`);
      return fallbackValue;
    }
    const clamped = Math.min(100, Math.max(1, value));
    if (clamped !== value) warn(`q0t4.${key} must be from 1 to 100; using ${clamped}.`);
    return clamped;
  };

  return {
    config: {
      budgetUnit,
      subjects: parseSubjects(input["subjects"], defaultLimit, warn),
      defaultLimit,
      fallbackSubject,
      resetDay,
      warnAtPercent: percent("warnAtPercent"),
      dailyPaceWarning: percent("dailyPaceWarning"),
      includeHistory,
    },
    warnings,
  };
}

function parseSubjects(
  raw: unknown,
  defaultLimit: number,
  warn: (message: string) => void,
): Readonly<Record<SubjectName, SubjectConfig>> {
  if (raw === undefined || raw === null) return structuredClone(DEFAULT_CONFIG.subjects);
  if (!isRecord(raw)) {
    warn("q0t4.subjects must be an object of repo names; using the defaults.");
    return structuredClone(DEFAULT_CONFIG.subjects);
  }
  const subjects: Record<SubjectName, SubjectConfig> = {};
  const seen = new Set<string>();
  for (const [rawKey, value] of Object.entries(raw)) {
    const key = rawKey.trim();
    if (key === "") {
      warn("q0t4.subjects has an entry with an empty name; it is ignored.");
      continue;
    }
    if (seen.has(key.toLowerCase())) {
      warn(`q0t4.subjects has "${key}" twice (names differ only by case); the first one is used.`);
      continue;
    }
    seen.add(key.toLowerCase());
    if (!isRecord(value)) {
      warn(
        `q0t4.subjects["${key}"] must be an object like { "weeklyLimit": 50000 }; it is ignored.`,
      );
      seen.delete(key.toLowerCase());
      continue;
    }
    const subject: { weeklyLimit?: number; description?: string } = {};
    if (value["weeklyLimit"] !== undefined) {
      if (isAmount(value["weeklyLimit"])) subject.weeklyLimit = value["weeklyLimit"];
      else {
        warn(
          `q0t4.subjects["${key}"].weeklyLimit must be a number of 0 or more; using the default limit of ${defaultLimit}.`,
        );
      }
    }
    if (typeof value["description"] === "string") subject.description = value["description"];
    subjects[key] = subject;
  }
  return subjects;
}

/** The weekly limit of a subject: its own, else `defaultLimit`. Names match case-insensitively. */
export function weeklyLimitFor(config: Q0T4Config, subject: SubjectName): number {
  const wanted = subject.trim().toLowerCase();
  const key = Object.keys(config.subjects).find((k) => k.toLowerCase() === wanted);
  return (key === undefined ? undefined : config.subjects[key]?.weeklyLimit) ?? config.defaultLimit;
}
