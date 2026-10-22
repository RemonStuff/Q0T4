import { describe, expect, it } from "vitest";
import {
  DEFAULT_SUBJECT,
  DEFAULT_SUBJECTS,
  DEFAULT_WARN_AT_PERCENT,
  DEFAULT_DAILY_PACE_WARNING,
  DEFAULT_RESET_DAY,
} from "../../../../src/core/subjects/defaultSubjects";

describe("default subjects", () => {
  it("sends everything to one subject, general, with a 200k weekly limit", () => {
    expect(DEFAULT_SUBJECT).toBe("general");
    expect(DEFAULT_SUBJECTS[DEFAULT_SUBJECT]).toEqual({ weeklyLimit: 200_000 });
  });

  it("warns at 80% of the week and 30% in one day, and the week resets on Monday", () => {
    expect(DEFAULT_WARN_AT_PERCENT).toBe(80);
    expect(DEFAULT_DAILY_PACE_WARNING).toBe(30);
    expect(DEFAULT_RESET_DAY).toBe("monday");
  });
});
