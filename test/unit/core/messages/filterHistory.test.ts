import { describe, expect, it } from "vitest";
import { buildMessages } from "../../../../src/core/messages/buildMessages";
import { filterHistoryBySubject } from "../../../../src/core/messages/filterHistory";
import type { HistoryTurn, ResultMetadata } from "../../../../src/core/types";

function meta(subject: string): ResultMetadata {
  return {
    v: 1,
    subject,
    unit: "tokens",
    inputTokens: 1,
    outputTokens: 1,
    cost: { tokens: 2 },
    stopped: false,
  };
}
const pair = (n: number, subject: string | undefined): HistoryTurn[] => [
  { kind: "request", prompt: `q${n}` },
  {
    kind: "response",
    text: `a${n}`,
    ...(subject === undefined ? {} : { metadata: meta(subject) }),
  },
];
const prompts = (turns: readonly HistoryTurn[]) =>
  turns.map((t) => (t.kind === "request" ? t.prompt : t.text));

describe("filterHistoryBySubject", () => {
  it("keeps request/response pairs whose response metadata matches the current subject", () => {
    const history = [...pair(1, "org/a"), ...pair(2, "org/a")];
    expect(filterHistoryBySubject(history, "org/a")).toEqual(history);
  });

  it("drops pairs from other subjects", () => {
    const history = [...pair(1, "org/a"), ...pair(2, "org/b"), ...pair(3, "org/a")];
    expect(prompts(filterHistoryBySubject(history, "org/a"))).toEqual(["q1", "a1", "q3", "a3"]);
  });

  it("drops pairs whose response has no Q0T4 metadata", () => {
    const history = [...pair(1, undefined), ...pair(2, "org/a")];
    expect(prompts(filterHistoryBySubject(history, "org/a"))).toEqual(["q2", "a2"]);
    const wrong: HistoryTurn[] = [
      { kind: "request", prompt: "q" },
      { kind: "response", text: "a", metadata: { outcome: "completed" } },
    ];
    expect(filterHistoryBySubject(wrong, "org/a")).toEqual([]);
  });

  it("keeps chronological order after filtering", () => {
    const history = [
      ...pair(1, "x"),
      ...pair(2, "y"),
      ...pair(3, "x"),
      ...pair(4, "y"),
      ...pair(5, "x"),
    ];
    expect(prompts(filterHistoryBySubject(history, "x"))).toEqual([
      "q1",
      "a1",
      "q3",
      "a3",
      "q5",
      "a5",
    ]);
  });

  it("matches subjects case-insensitively and ignores surrounding whitespace", () => {
    const history = pair(1, "RemonStuff/Q0T4");
    expect(filterHistoryBySubject(history, " remonstuff/q0t4 ")).toEqual(history);
  });

  it("drops a request with no response after it, and a response with no request before it", () => {
    const lone: HistoryTurn[] = [
      { kind: "response", text: "orphan", metadata: meta("x") },
      ...pair(1, "x"),
      { kind: "request", prompt: "unanswered" },
    ];
    expect(prompts(filterHistoryBySubject(lone, "x"))).toEqual(["q1", "a1"]);
  });

  it("uses the latest request before a response when two requests come in a row", () => {
    const history: HistoryTurn[] = [
      { kind: "request", prompt: "first" },
      { kind: "request", prompt: "second" },
      { kind: "response", text: "a", metadata: meta("x") },
    ];
    expect(prompts(filterHistoryBySubject(history, "x"))).toEqual(["second", "a"]);
  });

  it("does not modify the history, and handles an empty one", () => {
    const history = [...pair(1, "x"), ...pair(2, "y")];
    const copy = structuredClone(history);
    filterHistoryBySubject(history, "x");
    expect(history).toEqual(copy);
    expect(filterHistoryBySubject([], "x")).toEqual([]);
  });
});

describe("buildMessages with a subject and includeHistory", () => {
  const history = [...pair(1, "org/a"), ...pair(2, "org/b")];

  it("sends only same-subject history when a subject is given", () => {
    expect(buildMessages("now", history, [], { subject: "org/a" }).map((m) => m.text)).toEqual([
      "q1",
      "a1",
      "now",
    ]);
  });

  it("sends no history when includeHistory is false", () => {
    expect(buildMessages("now", history, [], { subject: "org/a", includeHistory: false })).toEqual([
      { role: "user", text: "now" },
    ]);
  });

  it("still includes references and the prompt when history is disabled", () => {
    const refs = [{ label: "file.ts", text: "code" }];
    const messages = buildMessages("now", history, refs, { includeHistory: false });
    expect(messages).toHaveLength(2);
    expect(messages[0]?.text).toContain("file.ts");
    expect(messages[1]).toEqual({ role: "user", text: "now" });
  });

  it("without options keeps all history, as before", () => {
    expect(buildMessages("now", history).map((m) => m.text)).toEqual([
      "q1",
      "a1",
      "q2",
      "a2",
      "now",
    ]);
  });

  it("includeHistory true with a subject behaves like the subject filter", () => {
    expect(
      buildMessages("now", history, [], { subject: "org/b", includeHistory: true }).map(
        (m) => m.text,
      ),
    ).toEqual(["q2", "a2", "now"]);
  });
});
