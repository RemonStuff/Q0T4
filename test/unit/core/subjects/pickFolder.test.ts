import { describe, expect, it } from "vitest";
import { pickFolder } from "../../../../src/core/subjects/pickFolder";

const a = { uri: "file:///work/a", name: "a" };
const b = { uri: "file:///work/b", name: "b" };
const nested = { uri: "file:///work/a/nested", name: "nested" };

describe("pickFolder", () => {
  it("returns undefined when no folder is open", () => {
    expect(pickFolder([], undefined)).toBeUndefined();
    expect(pickFolder([], "file:///work/a/x.ts")).toBeUndefined();
  });

  it("picks the folder of the active editor in a multi-root workspace", () => {
    expect(pickFolder([a, b], "file:///work/b/src/x.ts")).toBe(b);
    expect(pickFolder([a, b], "file:///work/a/x.ts")).toBe(a);
  });

  it("picks the first folder when there is no active editor", () => {
    expect(pickFolder([a, b], undefined)).toBe(a);
  });

  it("picks the first folder when the active file is outside every folder", () => {
    expect(pickFolder([a, b], "file:///elsewhere/x.ts")).toBe(a);
    expect(pickFolder([a, b], "untitled:Untitled-1")).toBe(a);
  });

  it("picks the deepest folder when folders are nested", () => {
    expect(pickFolder([a, nested], "file:///work/a/nested/x.ts")).toBe(nested);
    expect(pickFolder([nested, a], "file:///work/a/nested/x.ts")).toBe(nested);
    expect(pickFolder([a, nested], "file:///work/a/other.ts")).toBe(a);
  });

  it("does not match a folder that merely shares a name prefix", () => {
    const ab = { uri: "file:///work/ab", name: "ab" };
    expect(pickFolder([ab, a], "file:///work/a/x.ts")).toBe(a);
    expect(pickFolder([a, ab], "file:///work/ab/x.ts")).toBe(ab);
  });

  it("matches the folder itself, with or without a trailing slash", () => {
    expect(pickFolder([a, b], "file:///work/b")).toBe(b);
    expect(
      pickFolder([{ uri: "file:///work/b/", name: "b" }, a], "file:///work/b/x"),
    ).toMatchObject({ name: "b" });
  });
});
