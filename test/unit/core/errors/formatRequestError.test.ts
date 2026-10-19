import { describe, expect, it } from "vitest";
import { formatRequestError } from "../../../../src/core/errors/formatRequestError";

describe("formatRequestError", () => {
  it("returns a short generic retry message without including internal error details", () => {
    expect(formatRequestError()).toBe("Q0T4 couldn't complete this request. Please try again.");
  });
});
