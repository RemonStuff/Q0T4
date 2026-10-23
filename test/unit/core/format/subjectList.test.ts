import { describe, expect, it } from "vitest";
import { formatSubjectList } from "../../../../src/core/format/subjectList";
import type { SubjectListInput, SubjectListItem } from "../../../../src/core/format/subjectList";

function item(subject: string, overrides: Partial<SubjectListItem> = {}): SubjectListItem {
  return {
    subject,
    limit: { tokens: 50_000 },
    limitIsDefault: false,
    current: false,
    fallback: false,
    thread: false,
    ...overrides,
  };
}

function input(
  subjects: SubjectListItem[],
  overrides: Partial<SubjectListInput> = {},
): SubjectListInput {
  return { unit: "tokens", subjects, defaultLimit: { tokens: 150_000 }, ...overrides };
}

/** The list lines, one per subject. */
const lines = (text: string) => text.split("\n").filter((l) => l.startsWith("- "));

describe("formatSubjectList", () => {
  it("starts with a heading", () => {
    expect(formatSubjectList(input([item("org/a")])).startsWith("**Known subjects**\n\n")).toBe(
      true,
    );
  });

  it("lists every known subject with its limit and description", () => {
    const text = formatSubjectList(
      input([
        item("org/a", { limit: { tokens: 60_000 }, description: "The main service" }),
        item("org/b", { limit: { tokens: 1_250_000 } }),
      ]),
    );
    expect(lines(text)).toEqual([
      "- **org/a**: 60k a week — The main service",
      "- **org/b**: 1.25M a week",
    ]);
  });

  it('marks limits from defaultLimit as "(default)"', () => {
    const text = formatSubjectList(
      input([item("org/own"), item("org/fallback", { limitIsDefault: true })]),
    );
    expect(lines(text)).toEqual([
      "- **org/fallback**: 50k (default) a week",
      "- **org/own**: 50k a week",
    ]);
  });

  it("marks the current repo, lists it first", () => {
    const text = formatSubjectList(input([item("a/first"), item("z/mine", { current: true })]));
    expect(lines(text)).toEqual([
      "- **z/mine**: 50k a week · current repo",
      "- **a/first**: 50k a week",
    ]);
  });

  it("puts the current repo first wherever it was listed", () => {
    const mine = item("z/mine", { current: true });
    const others = [item("a/one"), item("b/two")];
    for (const subjects of [
      [mine, ...others],
      [...others, mine],
      [others[0]!, mine, others[1]!],
    ]) {
      expect(lines(formatSubjectList(input(subjects)))[0]).toContain("z/mine");
    }
  });

  it("marks the fallback subject", () => {
    const text = formatSubjectList(input([item("general", { fallback: true })]));
    expect(lines(text)).toEqual(["- **general**: 50k a week · fallback subject"]);
  });

  it("marks the current thread subject when there is one", () => {
    const text = formatSubjectList(input([item("org/a", { thread: true }), item("org/b")]));
    expect(lines(text)).toEqual([
      "- **org/a**: 50k a week · this conversation",
      "- **org/b**: 50k a week",
    ]);
  });

  it("combines marks in a fixed order, then the description", () => {
    const text = formatSubjectList(
      input([item("org/a", { current: true, fallback: true, thread: true, description: "Main" })]),
    );
    expect(lines(text)).toEqual([
      "- **org/a**: 50k a week · current repo · fallback subject · this conversation — Main",
    ]);
  });

  it("sorts the other subjects by name, ignoring case", () => {
    const text = formatSubjectList(input([item("b/x"), item("A/x"), item("c/x")]));
    expect(lines(text).map((l) => l.slice(4, 7))).toEqual(["A/x", "b/x", "c/x"]);
  });

  it("shows the default limit that applies to any new repo", () => {
    expect(formatSubjectList(input([item("org/a")]))).toContain(
      "Any other repo gets the default limit of 150k a week.",
    );
  });

  it("shows limits and the default in credits", () => {
    const text = formatSubjectList({
      unit: "credits",
      subjects: [item("org/a", { limit: { tokens: 0, credits: 3390 } })],
      defaultLimit: { tokens: 0, credits: 2100 },
    });
    expect(lines(text)).toEqual(["- **org/a**: 3,390 credits a week"]);
    expect(text).toContain("default limit of 2,100 credits a week.");
  });

  it("ends with /use and settings hints", () => {
    const text = formatSubjectList(input([item("org/a")]));
    expect(
      text.endsWith(
        "Use `/use <subject> <question>` to charge a question to a subject, or `/use <subject>` to switch this conversation. Set a repo's limit in the `q0t4.subjects` setting.",
      ),
    ).toBe(true);
  });

  it("escapes markdown in subject names and descriptions", () => {
    const text = formatSubjectList(input([item("a_b*c", { description: "x|y\nz" })]));
    expect(lines(text)).toEqual(["- **a\\_b\\*c**: 50k a week — x\\|y z"]);
  });
});
