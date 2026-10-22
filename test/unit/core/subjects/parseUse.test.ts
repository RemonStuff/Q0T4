import { describe, expect, it } from "vitest";
import { formatUseConfirmation } from "../../../../src/core/format/formatUse";
import { markdownLiteral } from "../../../../src/core/format/markdownLiteral";
import { knownSubjects } from "../../../../src/core/subjects/knownSubjects";
import { parseUse } from "../../../../src/core/subjects/parseUse";
import { parseConfig } from "../../../../src/core/subjects/parseConfig";

const known = ["general", "RemonStuff/Q0T4", "acme/web-app"];

describe("parseUse", () => {
  it("parses 'general how do I center a div' as subject general plus the question", () => {
    expect(parseUse("general how do I center a div", known)).toEqual({
      kind: "ask",
      subject: "general",
      question: "how do I center a div",
    });
  });

  it("parses an owner/repo subject", () => {
    expect(parseUse("acme/web-app why is the build slow", known)).toEqual({
      kind: "ask",
      subject: "acme/web-app",
      question: "why is the build slow",
    });
  });

  it("matches case-insensitively and returns the canonical casing", () => {
    expect(parseUse("remonstuff/q0t4 hi", known)).toEqual({
      kind: "ask",
      subject: "RemonStuff/Q0T4",
      question: "hi",
    });
    expect(parseUse("GENERAL hi", known)).toMatchObject({ subject: "general" });
  });

  it("preserves the question's whitespace and newlines after the subject", () => {
    const question = "line one\n\n    indented  line\ttab\n";
    expect(parseUse(`general   ${question}`, known)).toEqual({
      kind: "ask",
      subject: "general",
      question,
    });
    expect(parseUse(`general\n${question}`, known)).toEqual({
      kind: "ask",
      subject: "general",
      question,
    });
  });

  it("ignores whitespace before the subject", () => {
    expect(parseUse("  \n general hi", known)).toMatchObject({
      kind: "ask",
      subject: "general",
      question: "hi",
    });
  });

  it("'general' with no question returns setOnly", () => {
    expect(parseUse("general", known)).toEqual({ kind: "setOnly", subject: "general" });
    expect(parseUse("general   \n ", known)).toEqual({ kind: "setOnly", subject: "general" });
  });

  it("accepts a subject that contains spaces, using the longest known match", () => {
    const list = ["org/a", "org/a b", "org/My Project/repo"];
    expect(parseUse("org/My Project/repo what now", list)).toEqual({
      kind: "ask",
      subject: "org/My Project/repo",
      question: "what now",
    });
    expect(parseUse("org/a b question", list)).toMatchObject({
      subject: "org/a b",
      question: "question",
    });
    expect(parseUse("org/a question", list)).toMatchObject({
      subject: "org/a",
      question: "question",
    });
  });

  it("does not match a known subject that is only the start of a longer word", () => {
    const result = parseUse("general2 hi", known);
    expect(result.kind).toBe("error");
  });

  it("an unknown subject returns an error listing the known subjects", () => {
    const result = parseUse("typo/repo hello", known);
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.message).toContain("typo/repo");
    for (const subject of known) expect(result.message).toContain(markdownLiteral(subject));
  });

  it("an empty /use returns usage help listing the known subjects", () => {
    for (const prompt of ["", "   ", "\n"]) {
      const result = parseUse(prompt, known);
      expect(result.kind).toBe("error");
      if (result.kind !== "error") continue;
      expect(result.message).toContain("/use <subject> <question>");
      expect(result.message).toContain("RemonStuff/Q0T4");
    }
  });

  it("copes with no known subjects at all", () => {
    const result = parseUse("anything hi", []);
    expect(result.kind).toBe("error");
    expect(parseUse("", []).kind).toBe("error");
  });

  it("lists at most 20 subjects and says how many more there are", () => {
    const many = Array.from({ length: 25 }, (_, i) => `org/repo-${i}`);
    const result = parseUse("nope hi", many);
    if (result.kind !== "error") throw new Error("expected an error");
    expect(result.message).toContain("org/repo\\-19");
    expect(result.message).not.toContain("org/repo\\-20");
    expect(result.message).toContain("and 5 more");
  });

  it("renders subjects as literal Markdown in messages", () => {
    const result = parseUse("zzz hi", ["a_b*c/[x](y)"]);
    if (result.kind !== "error") throw new Error("expected an error");
    expect(result.message).toContain("a\\_b\\*c/\\[x\\]\\(y\\)");
  });
});

describe("formatUseConfirmation", () => {
  it("confirms the subject and says the next messages use it, without calling a model", () => {
    const text = formatUseConfirmation("RemonStuff/Q0T4");
    expect(text).toContain("RemonStuff/Q0T4");
    expect(text).toMatch(/next messages/i);
  });

  it("renders the subject as literal Markdown", () => {
    expect(formatUseConfirmation("a_b")).toContain("a\\_b");
  });
});

describe("knownSubjects", () => {
  const config = parseConfig({
    subjects: { "RemonStuff/Q0T4": { weeklyLimit: 1 }, "org/other": {} },
    fallbackSubject: "notes",
  }).config;

  it("is configured keys, the fallback, subjects seen in the ledger and the current repo", () => {
    expect(knownSubjects({ config, seen: ["acme/web-app"], currentRepo: "me/current" })).toEqual([
      "RemonStuff/Q0T4",
      "org/other",
      "notes",
      "acme/web-app",
      "me/current",
    ]);
  });

  it("accepts the current repo even when it has never been used", () => {
    expect(knownSubjects({ config, seen: [], currentRepo: "brand/new" })).toContain("brand/new");
  });

  it("works without a current repo", () => {
    expect(knownSubjects({ config, seen: [] })).toEqual(["RemonStuff/Q0T4", "org/other", "notes"]);
  });

  it("lists a subject once, keeping the first spelling", () => {
    expect(
      knownSubjects({
        config,
        seen: ["remonstuff/q0t4", "NOTES", "Acme/Web"],
        currentRepo: "acme/web",
      }),
    ).toEqual(["RemonStuff/Q0T4", "org/other", "notes", "Acme/Web"]);
  });

  it("ignores blank names", () => {
    expect(knownSubjects({ config, seen: ["  ", ""], currentRepo: "  " })).toEqual([
      "RemonStuff/Q0T4",
      "org/other",
      "notes",
    ]);
  });
});
