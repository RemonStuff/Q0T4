import { describe, expect, it } from "vitest";
import { formatSubjectNote } from "../../../../src/core/format/formatSubjectNote";
import { parseConfig } from "../../../../src/core/subjects/parseConfig";
import { resolveSubject } from "../../../../src/core/subjects/resolveSubject";
import type { ResolveInput } from "../../../../src/core/subjects/resolveSubject";
import type { HistoryTurn, ResultMetadata } from "../../../../src/core/types";

const config = parseConfig({ subjects: { "org/known": { weeklyLimit: 1 } } }).config;
const repo = {
  folderName: "folder",
  remotes: [{ name: "origin", url: "https://github.com/me/mine.git" }],
};

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
const thread = (subject: string): HistoryTurn[] => [
  { kind: "request", prompt: "q" },
  { kind: "response", text: "a", metadata: meta(subject) },
];

function input(overrides: Partial<ResolveInput> = {}): ResolveInput {
  return { prompt: "hello", history: [], repo, config, seen: [], ...overrides };
}

describe("resolveSubject", () => {
  it("/use wins over the thread subject and the repo", () => {
    expect(
      resolveSubject(
        input({
          command: "use",
          prompt: "org/known what is this",
          history: thread("other/thread"),
        }),
      ),
    ).toEqual({ kind: "resolved", subject: "org/known", source: "use", prompt: "what is this" });
  });

  it("/use accepts the current repo as a known subject, with the question as the prompt", () => {
    expect(resolveSubject(input({ command: "use", prompt: "me/mine hi there" }))).toEqual({
      kind: "resolved",
      subject: "me/mine",
      source: "use",
      prompt: "hi there",
    });
  });

  it("/use with only a subject switches without a question", () => {
    expect(resolveSubject(input({ command: "use", prompt: "general" }))).toEqual({
      kind: "setOnly",
      subject: "general",
    });
  });

  it("/use with an unknown subject returns the error message and nothing else", () => {
    const result = resolveSubject(input({ command: "use", prompt: "typo/x hi" }));
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.message).toContain("typo");
  });

  it("subjects seen in the ledger are valid for /use", () => {
    expect(
      resolveSubject(input({ command: "use", prompt: "acme/seen go", seen: ["acme/seen"] })),
    ).toMatchObject({
      subject: "acme/seen",
    });
  });

  it("another slash command is not /use and falls through to the normal sources", () => {
    expect(resolveSubject(input({ command: "other", history: thread("t/s") }))).toMatchObject({
      source: "thread",
    });
  });

  it("the thread subject wins over the current repo", () => {
    expect(resolveSubject(input({ history: thread("org/known") }))).toEqual({
      kind: "resolved",
      subject: "org/known",
      source: "thread",
      prompt: "hello",
    });
  });

  it("the current repo is used when there is no /use and no thread subject", () => {
    expect(resolveSubject(input())).toEqual({
      kind: "resolved",
      subject: "me/mine",
      source: "repo",
      prompt: "hello",
    });
  });

  it("falls back to fallbackSubject when no folder is open", () => {
    expect(resolveSubject(input({ repo: undefined }))).toEqual({
      kind: "resolved",
      subject: "general",
      source: "fallback",
      prompt: "hello",
    });
  });

  it("uses the configured fallback subject", () => {
    const custom = parseConfig({ fallbackSubject: "notes" }).config;
    expect(resolveSubject(input({ repo: undefined, config: custom }))).toMatchObject({
      subject: "notes",
    });
  });

  it("falls back when the folder name is blank and there is no remote", () => {
    expect(resolveSubject(input({ repo: { folderName: " ", remotes: [] } }))).toMatchObject({
      source: "fallback",
    });
  });

  it("does not change the prompt unless /use asked a question", () => {
    expect(resolveSubject(input({ prompt: "  keep  spacing " }))).toMatchObject({
      prompt: "  keep  spacing ",
    });
  });
});

describe("formatSubjectNote", () => {
  it.each(["use", "thread", "repo", "fallback"] as const)(
    "names the subject and the source %s",
    (source) => {
      expect(formatSubjectNote("RemonStuff/Q0T4", source)).toBe(
        `Subject: RemonStuff/Q0T4 (${source})`,
      );
    },
  );
});
