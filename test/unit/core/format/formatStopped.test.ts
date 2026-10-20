import { describe, expect, it } from "vitest";
import { formatStopped } from "../../../../src/core/format/formatStopped";

describe("formatStopped", () => {
  it("identifies the subject and the weekly budget stop", () => {
    expect(formatStopped("org/repo")).toBe("⛔ Stopped: org/repo weekly budget reached.");
  });

  it("renders a dynamic subject as single-line literal Markdown", () => {
    expect(formatStopped("[repo](https://example.test)\r\n`*<x>")).toBe(
      "⛔ Stopped: \\[repo\\]\\(https://example\\.test\\) \\`\\*\\<x\\> weekly budget reached.",
    );
  });
});
