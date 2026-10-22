import { describe, expect, it, vi } from "vitest";
import { routeRequest } from "../../../../src/core/subjects/routeRequest";
import type { RouteInput } from "../../../../src/core/subjects/routeRequest";
import { isResultMetadata } from "../../../../src/core/types";
import type { HistoryTurn, ResultMetadata } from "../../../../src/core/types";
import { FakeConfig, FakeWorkspace } from "../../../fakes";

const repo = {
  folderName: "folder",
  remotes: [{ name: "origin", url: "https://github.com/test-owner/test-repo.git" }],
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

function input(overrides: Partial<RouteInput> = {}): RouteInput {
  return {
    prompt: "hello",
    history: [],
    workspace: new FakeWorkspace(repo),
    config: new FakeConfig(),
    recentSubjects: async () => [],
    ...overrides,
  };
}

describe("routeRequest", () => {
  it("charges a prompt in a repo to the repo subject, with a note naming the source", async () => {
    expect(await routeRequest(input())).toEqual({
      kind: "send",
      subject: "test-owner/test-repo",
      note: "Subject: test-owner/test-repo (repo)",
      prompt: "hello",
    });
  });

  it("a follow-up stays on the thread subject, even when the repo is different", async () => {
    const history: HistoryTurn[] = [
      { kind: "request", prompt: "q" },
      { kind: "response", text: "a", metadata: meta("general") },
    ];
    expect(await routeRequest(input({ history }))).toMatchObject({
      subject: "general",
      note: "Subject: general (thread)",
    });
  });

  it("uses the fallback subject when no folder is open", async () => {
    const result = await routeRequest(input({ workspace: new FakeWorkspace(undefined) }));
    expect(result).toMatchObject({
      kind: "send",
      subject: "general",
      note: "Subject: general (fallback)",
    });
  });

  it("/use <subject> <question> sends the question charged to that subject", async () => {
    const result = await routeRequest(input({ command: "use", prompt: "general explain this" }));
    expect(result).toEqual({
      kind: "send",
      subject: "general",
      note: "Subject: general (use)",
      prompt: "explain this",
    });
  });

  it("/use general alone replies with a confirmation and metadata so the thread keeps general", async () => {
    const result = await routeRequest(input({ command: "use", prompt: "general" }));
    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") return;
    expect(result.text).toContain("general");
    expect(isResultMetadata(result.metadata)).toBe(true);
    expect(result.metadata).toEqual({
      v: 1,
      subject: "general",
      unit: "tokens",
      inputTokens: 0,
      outputTokens: 0,
      cost: { tokens: 0 },
      stopped: false,
    });
  });

  it("the set-only metadata has zero credits too when the unit is credits", async () => {
    const result = await routeRequest(
      input({
        command: "use",
        prompt: "general",
        config: new FakeConfig({ budgetUnit: "credits" }),
      }),
    );
    if (result.kind !== "reply") throw new Error("expected a reply");
    expect(result.metadata).toMatchObject({ unit: "credits", cost: { tokens: 0, credits: 0 } });
  });

  it("an unknown /use subject replies with the error and no Q0T4 metadata, so the thread subject stays", async () => {
    const result = await routeRequest(input({ command: "use", prompt: "typo/x hi" }));
    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") return;
    expect(result.text).toContain("typo");
    expect(isResultMetadata(result.metadata)).toBe(false);
  });

  it("only asks for recent subjects on /use", async () => {
    const recentSubjects = vi.fn(async () => ["acme/seen"]);
    await routeRequest(input({ recentSubjects }));
    expect(recentSubjects).not.toHaveBeenCalled();
    const result = await routeRequest(
      input({ command: "use", prompt: "acme/seen go", recentSubjects }),
    );
    expect(recentSubjects).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ kind: "send", subject: "acme/seen" });
  });

  it("treats an unreadable ledger as no recent subjects", async () => {
    const recentSubjects = async () => {
      throw new Error("disk");
    };
    const result = await routeRequest(
      input({ command: "use", prompt: "general hi", recentSubjects }),
    );
    expect(result).toMatchObject({ kind: "send", subject: "general" });
  });

  it("treats a workspace failure as no folder open", async () => {
    const workspace = { currentRepo: async () => Promise.reject(new Error("git")) };
    expect(await routeRequest(input({ workspace }))).toMatchObject({
      subject: "general",
      note: "Subject: general (fallback)",
    });
  });

  it("another slash command goes through with the normal subject", async () => {
    expect(await routeRequest(input({ command: "status" }))).toMatchObject({
      kind: "send",
      subject: "test-owner/test-repo",
    });
  });

  it("reads the config at request time", async () => {
    const config = new FakeConfig({ fallbackSubject: "one" });
    const workspace = new FakeWorkspace(undefined);
    expect(await routeRequest(input({ config, workspace }))).toMatchObject({ subject: "one" });
    config.update({ fallbackSubject: "two" });
    expect(await routeRequest(input({ config, workspace }))).toMatchObject({ subject: "two" });
  });
});
