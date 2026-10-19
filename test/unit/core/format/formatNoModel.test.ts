import { describe, expect, it } from "vitest";
import { formatNoModel } from "../../../../src/core/format/formatNoModel";

describe("formatNoModel", () => {
  it("explains that no Copilot chat model is available and asks the user to check sign-in", () => {
    expect(formatNoModel()).toBe(
      "No Copilot chat model is available. Check that GitHub Copilot is signed in.",
    );
  });
});
