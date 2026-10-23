import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  parseConfig,
  hasOwnWeeklyLimit,
  subjectDescription,
  weeklyLimitFor,
} from "../../../../src/core/subjects/parseConfig";

const parse = (raw: Record<string, unknown> = {}) => parseConfig(raw);

describe("parseConfig defaults", () => {
  it("returns the default config when nothing is set", () => {
    const { config, warnings } = parse();
    expect(config).toEqual({
      budgetUnit: "tokens",
      subjects: { general: { weeklyLimit: 200_000 } },
      defaultLimit: 150_000,
      fallbackSubject: "general",
      resetDay: "monday",
      warnAtPercent: 80,
      dailyPaceWarning: 30,
      includeHistory: true,
    });
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(warnings).toEqual([]);
  });

  it("treats undefined, null and non-object input as nothing set", () => {
    for (const raw of [undefined, null, "x", 5, []]) {
      expect(parseConfig(raw)).toEqual({ config: DEFAULT_CONFIG, warnings: [] });
    }
  });

  it("includeHistory defaults to true and accepts false", () => {
    expect(parse().config.includeHistory).toBe(true);
    expect(parse({ includeHistory: false }).config.includeHistory).toBe(false);
  });

  it("never throws and never returns a shared object", () => {
    expect(() =>
      parse({ subjects: 5, defaultLimit: {}, resetDay: [], warnAtPercent: "x" }),
    ).not.toThrow();
    const a = parse().config;
    const b = parse().config;
    expect(a).not.toBe(b);
    expect(a.subjects).not.toBe(b.subjects);
  });
});

describe("weeklyLimitFor", () => {
  const { config } = parse({
    subjects: {
      "RemonStuff/Q0T4": { weeklyLimit: 50_000 },
      "org/zero": { weeklyLimit: 0 },
      plain: {},
    },
    defaultLimit: 120_000,
  });

  it("returns the configured limit for a listed repo", () => {
    expect(weeklyLimitFor(config, "RemonStuff/Q0T4")).toBe(50_000);
  });

  it('matches repo keys case-insensitively ("remonstuff/q0t4" = "RemonStuff/Q0T4")', () => {
    expect(weeklyLimitFor(config, "remonstuff/q0t4")).toBe(50_000);
    expect(weeklyLimitFor(config, "REMONSTUFF/Q0T4")).toBe(50_000);
  });

  it("returns defaultLimit for an unlisted repo and for a listed one without a limit", () => {
    expect(weeklyLimitFor(config, "acme/web-app")).toBe(120_000);
    expect(weeklyLimitFor(config, "plain")).toBe(120_000);
  });

  it("accepts weeklyLimit 0 (subject disabled)", () => {
    expect(weeklyLimitFor(config, "org/zero")).toBe(0);
  });

  it("ignores surrounding whitespace in the subject asked for", () => {
    expect(weeklyLimitFor(config, "  remonstuff/q0t4 ")).toBe(50_000);
  });

  it("the default general subject has 200k when the user lists nothing", () => {
    expect(weeklyLimitFor(parse().config, "general")).toBe(200_000);
    expect(weeklyLimitFor(parse().config, "anything/else")).toBe(150_000);
  });
});

describe("parseConfig subjects", () => {
  it("trims subject keys and keeps their original casing for display", () => {
    const { config } = parse({ subjects: { "  RemonStuff/Q0T4  ": { weeklyLimit: 1 } } });
    expect(Object.keys(config.subjects)).toEqual(["RemonStuff/Q0T4"]);
  });

  it("keeps descriptions and ignores unknown fields", () => {
    const { config } = parse({
      subjects: { "org/repo": { weeklyLimit: 5, description: "Work repo", colour: "red" } },
    });
    expect(config.subjects["org/repo"]).toEqual({ weeklyLimit: 5, description: "Work repo" });
  });

  it("rejects a negative or non-numeric weeklyLimit, warns and uses defaultLimit", () => {
    for (const bad of [-1, "100", null, Number.NaN, Number.POSITIVE_INFINITY, {}, true]) {
      const { config, warnings } = parse({ subjects: { "org/repo": { weeklyLimit: bad } } });
      expect(config.subjects["org/repo"]).toEqual({});
      expect(weeklyLimitFor(config, "org/repo")).toBe(150_000);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("org/repo");
    }
  });

  it("warns when two keys differ only by case and keeps the first", () => {
    const { config, warnings } = parse({
      subjects: { "Org/Repo": { weeklyLimit: 1 }, "org/repo": { weeklyLimit: 2 } },
    });
    expect(Object.keys(config.subjects)).toEqual(["Org/Repo"]);
    expect(weeklyLimitFor(config, "org/repo")).toBe(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/differ only by case/);
  });

  it("skips an empty key and an entry that is not an object, with a warning each", () => {
    const { config, warnings } = parse({
      subjects: { "  ": { weeklyLimit: 1 }, "org/a": 5, "org/b": null },
    });
    expect(config.subjects).toEqual({});
    expect(warnings).toHaveLength(3);
  });

  it("falls back to the default subjects when subjects is not an object", () => {
    for (const bad of [5, "x", [], null]) {
      const { config, warnings } = parse({ subjects: bad });
      expect(config.subjects).toEqual({ general: { weeklyLimit: 200_000 } });
      expect(warnings).toHaveLength(bad === null ? 0 : 1);
    }
  });

  it("an explicit empty subjects map means no overrides, not the default general", () => {
    const { config } = parse({ subjects: {} });
    expect(config.subjects).toEqual({});
    expect(weeklyLimitFor(config, "general")).toBe(150_000);
  });
});

describe("parseConfig scalar settings", () => {
  it("rejects a negative defaultLimit and uses 150k", () => {
    for (const bad of [-5, "x", Number.NaN, null]) {
      const { config, warnings } = parse({ defaultLimit: bad });
      expect(config.defaultLimit).toBe(150_000);
      expect(warnings).toHaveLength(bad === null ? 0 : 1);
    }
    expect(parse({ defaultLimit: 0 }).config.defaultLimit).toBe(0);
    expect(parse({ defaultLimit: 75_000 }).config.defaultLimit).toBe(75_000);
  });

  it("clamps warnAtPercent and dailyPaceWarning to 1-100, with a warning", () => {
    for (const key of ["warnAtPercent", "dailyPaceWarning"] as const) {
      expect(parse({ [key]: 0 }).config[key]).toBe(1);
      expect(parse({ [key]: -20 }).config[key]).toBe(1);
      expect(parse({ [key]: 250 }).config[key]).toBe(100);
      expect(parse({ [key]: 0 }).warnings).toHaveLength(1);
      expect(parse({ [key]: 55 })).toMatchObject({ warnings: [], config: { [key]: 55 } });
    }
    expect(parse({ warnAtPercent: "x" }).config.warnAtPercent).toBe(80);
    expect(parse({ dailyPaceWarning: Number.NaN }).config.dailyPaceWarning).toBe(30);
  });

  it("rejects an unknown resetDay and uses monday; accepts any weekday, case-insensitively", () => {
    const bad = parse({ resetDay: "someday" });
    expect(bad.config.resetDay).toBe("monday");
    expect(bad.warnings).toHaveLength(1);
    expect(parse({ resetDay: 3 }).config.resetDay).toBe("monday");
    expect(parse({ resetDay: "Sunday" })).toMatchObject({
      config: { resetDay: "sunday" },
      warnings: [],
    });
    expect(parse({ resetDay: "wednesday" }).config.resetDay).toBe("wednesday");
  });

  it("trims fallbackSubject and rejects an empty one", () => {
    expect(parse({ fallbackSubject: "  notes " }).config.fallbackSubject).toBe("notes");
    const empty = parse({ fallbackSubject: "   " });
    expect(empty.config.fallbackSubject).toBe("general");
    expect(empty.warnings).toHaveLength(1);
    expect(parse({ fallbackSubject: 5 }).config.fallbackSubject).toBe("general");
  });

  it("rejects a non-boolean includeHistory and keeps true", () => {
    const { config, warnings } = parse({ includeHistory: "yes" });
    expect(config.includeHistory).toBe(true);
    expect(warnings).toHaveLength(1);
  });

  it("accepts budgetUnit tokens or credits and rejects anything else", () => {
    expect(parse({ budgetUnit: "credits" }).config.budgetUnit).toBe("credits");
    const bad = parse({ budgetUnit: "dollars" });
    expect(bad.config.budgetUnit).toBe("tokens");
    expect(bad.warnings).toHaveLength(1);
  });

  it("collects one warning per problem, none for valid input", () => {
    const { warnings } = parse({ defaultLimit: -1, resetDay: "x", includeHistory: 1 });
    expect(warnings).toHaveLength(3);
    expect(parse({ defaultLimit: 1, resetDay: "friday", includeHistory: true }).warnings).toEqual(
      [],
    );
  });
});

describe("hasOwnWeeklyLimit", () => {
  const { config } = parse({
    subjects: {
      "RemonStuff/Q0T4": { weeklyLimit: 50_000 },
      "org/zero": { weeklyLimit: 0 },
      plain: {},
    },
  });

  it("is true for a listed subject with a limit, also 0 and in any case", () => {
    expect(hasOwnWeeklyLimit(config, "RemonStuff/Q0T4")).toBe(true);
    expect(hasOwnWeeklyLimit(config, "remonstuff/q0t4")).toBe(true);
    expect(hasOwnWeeklyLimit(config, "org/zero")).toBe(true);
  });

  it("is false for an unlisted subject and for a listed one without a limit", () => {
    expect(hasOwnWeeklyLimit(config, "acme/web-app")).toBe(false);
    expect(hasOwnWeeklyLimit(config, "plain")).toBe(false);
  });
});

describe("subjectDescription", () => {
  const { config } = parse({
    subjects: { "Org/Repo": { description: "Main repo" }, plain: {} },
  });

  it("returns the description of a configured subject, in any case", () => {
    expect(subjectDescription(config, "Org/Repo")).toBe("Main repo");
    expect(subjectDescription(config, "org/repo")).toBe("Main repo");
  });

  it("is undefined without a description or for an unlisted subject", () => {
    expect(subjectDescription(config, "plain")).toBeUndefined();
    expect(subjectDescription(config, "other/x")).toBeUndefined();
  });
});
