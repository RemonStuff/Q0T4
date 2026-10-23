import { describe, expect, it } from "vitest";
import { subjectItems } from "../../../../src/core/subjects/subjectItems";
import { parseConfig } from "../../../../src/core/subjects/parseConfig";

const config = (raw: unknown) => parseConfig(raw).config;

describe("subjectItems", () => {
  const cfg = config({
    subjects: {
      "org/Own": { weeklyLimit: 60_000, description: "Own limit" },
      "org/plain": {},
    },
    defaultLimit: 120_000,
    fallbackSubject: "general",
  });

  it("covers the configured subjects, the fallback, the ones seen, the current repo and the thread", () => {
    const items = subjectItems({
      config: cfg,
      seen: ["org/seen"],
      currentRepo: "org/now",
      thread: "org/threaded",
    });
    expect(items.map((i) => i.subject).sort()).toEqual(
      ["general", "org/Own", "org/now", "org/plain", "org/seen", "org/threaded"].sort(),
    );
  });

  it("gives configured subjects their own limit and description, the others defaultLimit", () => {
    const items = subjectItems({ config: cfg, seen: ["org/seen"] });
    const by = Object.fromEntries(items.map((i) => [i.subject, i]));
    expect(by["org/Own"]).toMatchObject({
      limit: { tokens: 60_000 },
      limitIsDefault: false,
      description: "Own limit",
    });
    expect(by["org/seen"]).toMatchObject({ limit: { tokens: 120_000 }, limitIsDefault: true });
    expect(by["org/plain"]).toMatchObject({ limitIsDefault: true });
    expect(by["org/seen"]).not.toHaveProperty("description");
  });

  it("flags the current repo, the fallback subject and the thread subject, ignoring case", () => {
    const items = subjectItems({
      config: cfg,
      seen: [],
      currentRepo: "ORG/OWN",
      thread: "GENERAL",
    });
    const by = Object.fromEntries(items.map((i) => [i.subject, i]));
    expect(by["org/Own"]?.current).toBe(true);
    expect(by["general"]).toMatchObject({ fallback: true, thread: true, current: false });
    expect(by["org/plain"]).toMatchObject({ fallback: false, thread: false, current: false });
  });

  it("lists a thread subject that is neither configured nor seen", () => {
    const items = subjectItems({ config: cfg, seen: [], thread: "old/repo" });
    expect(items.find((i) => i.subject === "old/repo")).toMatchObject({ thread: true });
  });

  it("uses a limit override for every subject, as the test hook does", () => {
    const items = subjectItems({ config: cfg, seen: [], limitOverride: 500 });
    expect(items.every((i) => i.limit.tokens === 500 && i.limitIsDefault === false)).toBe(true);
  });

  it("ignores a blank description", () => {
    const items = subjectItems({
      config: config({ subjects: { "a/b": { description: "" } } }),
      seen: [],
    });
    expect(items.find((i) => i.subject === "a/b")).not.toHaveProperty("description");
  });
});
