import { describe, expect, it } from "vitest";
import {
  DEFAULT_SUBJECT,
  DEFAULT_SUBJECTS,
  DEFAULT_WARN_AT_PERCENT,
  RESET_UNAVAILABLE_LABEL,
} from "../../../../src/core/subjects/defaultSubjects";

describe("default subjects", () => {
  it("sends everything to one subject, general, with a 200k weekly limit", () => {
    expect(DEFAULT_SUBJECT).toBe("general");
    expect(DEFAULT_SUBJECTS[DEFAULT_SUBJECT]).toEqual({ weeklyLimit: 200_000 });
  });

  it("warns at 80% and says honestly that no reset date exists yet", () => {
    expect(DEFAULT_WARN_AT_PERCENT).toBe(80);
    expect(RESET_UNAVAILABLE_LABEL).toBe("date unavailable");
  });
});
