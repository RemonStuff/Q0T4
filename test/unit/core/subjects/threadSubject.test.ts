import { describe, expect, it } from "vitest";
import { threadSubject } from "../../../../src/core/subjects/threadSubject";
import type { HistoryTurn, ResultMetadata } from "../../../../src/core/types";
import { isResultMetadata } from "../../../../src/core/types";

function metadata(subject: string, overrides: Partial<ResultMetadata> = {}): ResultMetadata {
  return {
    v: 1,
    subject,
    unit: "tokens",
    inputTokens: 1,
    outputTokens: 1,
    cost: { tokens: 2 },
    stopped: false,
    ...overrides,
  };
}

const request = (prompt = "q"): HistoryTurn => ({ kind: "request", prompt });
const response = (meta?: unknown, text = "a"): HistoryTurn => ({
  kind: "response",
  text,
  ...(meta === undefined ? {} : { metadata: meta }),
});

describe("threadSubject", () => {
  it("returns the subject from the newest response turn's metadata", () => {
    expect(
      threadSubject([
        request(),
        response(metadata("org/old")),
        request(),
        response(metadata("org/new")),
      ]),
    ).toBe("org/new");
  });

  it("returns undefined for an empty history", () => {
    expect(threadSubject([])).toBeUndefined();
  });

  it("returns undefined when only requests are in the history", () => {
    expect(threadSubject([request(), request()])).toBeUndefined();
  });

  it("skips response turns without metadata", () => {
    expect(threadSubject([request(), response(metadata("org/repo")), request(), response()])).toBe(
      "org/repo",
    );
  });

  it("skips metadata that fails isResultMetadata", () => {
    const bad = { ...metadata("org/bad"), v: 2 };
    expect(isResultMetadata(bad)).toBe(false);
    expect(
      threadSubject([
        request(),
        response(metadata("org/good")),
        request(),
        response(bad),
        request(),
        response("a string"),
        request(),
        response({ outcome: "completed", model: "GPT-5" }),
        request(),
        response(null),
      ]),
    ).toBe("org/good");
  });

  it("accepts any non-empty subject name, since repos don't need to be configured", () => {
    expect(threadSubject([response(metadata("never/configured"))])).toBe("never/configured");
    expect(threadSubject([response(metadata("general"))])).toBe("general");
  });

  it("ignores an empty or whitespace-only subject", () => {
    expect(
      threadSubject([
        response(metadata("org/repo")),
        response(metadata("   ")),
        response(metadata("")),
      ]),
    ).toBe("org/repo");
    expect(threadSubject([response(metadata("  "))])).toBeUndefined();
  });

  it("trims the subject", () => {
    expect(threadSubject([response(metadata("  org/repo  "))])).toBe("org/repo");
  });

  it("a /use turn later in history overrides an earlier subject, because it is newer", () => {
    expect(
      threadSubject([
        request("first"),
        response(metadata("org/repo")),
        { kind: "request", prompt: "general explain", command: "use" },
        response(metadata("general")),
      ]),
    ).toBe("general");
  });

  it("refused turns still carry the subject, so the thread keeps it", () => {
    const refused = metadata("org/repo", {
      stopped: "precheck",
      inputTokens: 0,
      outputTokens: 0,
      cost: { tokens: 0 },
    });
    expect(threadSubject([request(), response(refused)])).toBe("org/repo");
  });

  it("does not modify the history", () => {
    const history = [request(), response(metadata("org/repo"))];
    const copy = structuredClone(history);
    threadSubject(history);
    expect(history).toEqual(copy);
  });
});
