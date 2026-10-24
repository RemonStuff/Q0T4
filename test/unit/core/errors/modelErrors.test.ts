import { describe, expect, it } from "vitest";
import {
  ModelError,
  formatModelError,
  modelErrorKind,
} from "../../../../src/core/errors/modelErrors";

describe("modelErrorKind", () => {
  it("reads the kind of a ModelError", () => {
    expect(modelErrorKind(new ModelError("blocked", "slow down"))).toBe("blocked");
    expect(modelErrorKind(new ModelError("noPermissions", "no"))).toBe("noPermissions");
    expect(modelErrorKind(new ModelError("notFound", "gone"))).toBe("notFound");
  });

  it.each([new Error("plain"), "text", undefined, null, { kind: "blocked" }])(
    "treats anything else as unknown (%s)",
    (error) => {
      expect(modelErrorKind(error)).toBe("unknown");
    },
  );
});

describe("ModelError", () => {
  it("is an Error that keeps its message and cause", () => {
    const cause = new Error("original");
    const error = new ModelError("unknown", "message", cause);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("message");
    expect(error.cause).toBe(cause);
    expect(error.name).toBe("ModelError");
  });
});

describe("formatModelError", () => {
  it("asks for permission when the user has not accepted the Copilot prompt", () => {
    expect(formatModelError(new ModelError("noPermissions", "x"))).toBe(
      "Q0T4 needs permission to use Copilot models. Accept the prompt and try again.",
    );
  });

  it("names the quota or rate limit for a blocked request", () => {
    expect(formatModelError(new ModelError("blocked", "x"))).toBe(
      "Copilot reports a quota or rate limit. Try again later.",
    );
  });

  it("gives the generic message plus the original message for an unknown error", () => {
    expect(formatModelError(new ModelError("unknown", "socket hang up"))).toBe(
      "Q0T4 couldn't complete this request. Please try again.\n\nDetails: socket hang up",
    );
  });

  it("uses the generic message for a notFound that reaches the user mid-stream", () => {
    expect(formatModelError(new ModelError("notFound", "model gone"))).toBe(
      "Q0T4 couldn't complete this request. Please try again.\n\nDetails: model gone",
    );
  });

  it("keeps only the first line and at most 200 characters of the details", () => {
    const text = formatModelError(
      new ModelError("unknown", `first line\nsecond ${"x".repeat(50)}`),
    );
    expect(text.endsWith("Details: first line")).toBe(true);
    const long = formatModelError(new ModelError("unknown", "y".repeat(500)));
    expect(long.split("Details: ")[1]).toBe(`${"y".repeat(199)}\u2026`);
  });

  it.each([
    new Error("internal detail"),
    "not an error",
    undefined,
    new ModelError("unknown", ""),
    new ModelError("unknown", "   "),
  ])("leaves out the details when there are none or the error is internal (%s)", (error) => {
    expect(formatModelError(error)).toBe("Q0T4 couldn't complete this request. Please try again.");
  });
});
