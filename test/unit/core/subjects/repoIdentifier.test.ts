import { describe, expect, it } from "vitest";
import { normaliseRemote, repoSubject } from "../../../../src/core/subjects/repoIdentifier";

describe("normaliseRemote", () => {
  it.each([
    ["https://github.com/RemonStuff/Q0T4.git", "RemonStuff/Q0T4"],
    ["https://github.com/RemonStuff/Q0T4", "RemonStuff/Q0T4"],
    ["http://github.com/RemonStuff/Q0T4.git", "RemonStuff/Q0T4"],
    ["git@github.com:RemonStuff/Q0T4.git", "RemonStuff/Q0T4"],
    ["git@github.com:RemonStuff/Q0T4", "RemonStuff/Q0T4"],
    ["ssh://git@github.com/RemonStuff/Q0T4", "RemonStuff/Q0T4"],
    ["ssh://git@github.com:22/RemonStuff/Q0T4.git", "RemonStuff/Q0T4"],
    ["git://github.com/RemonStuff/Q0T4.git", "RemonStuff/Q0T4"],
    ["https://user:token@github.com/o/r.git", "o/r"],
    ["https://x-access-token:ghp_secret@github.com/o/r", "o/r"],
    ["https://gitlab.com/group/sub/repo.git", "group/sub/repo"],
    ["git@gitlab.com:group/sub/deeper/repo.git", "group/sub/deeper/repo"],
    ["https://dev.azure.com/org/project/_git/repo", "org/project/repo"],
    ["https://org@dev.azure.com/org/project/_git/repo", "org/project/repo"],
    ["https://dev.azure.com/org/My%20Project/_git/repo", "org/My Project/repo"],
    ["https://org.visualstudio.com/project/_git/repo", "org/project/repo"],
    ["git@ssh.dev.azure.com:v3/org/project/repo", "org/project/repo"],
    ["org@vs-ssh.visualstudio.com:v3/org/project/repo", "org/project/repo"],
    ["ssh://git@ssh.dev.azure.com/v3/org/project/repo", "org/project/repo"],
    ["  https://github.com/o/r.git  ", "o/r"],
    ["https://github.com/o/r.git/", "o/r"],
    ["https://github.com/o/r//", "o/r"],
    ["https://github.com/o/r.git.git", "o/r.git"],
    ["https://GitHub.com/Owner/Repo.GIT", "Owner/Repo"],
  ])("normalises %s to %s", (url, expected) => {
    expect(normaliseRemote(url)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "not a url",
    "/home/me/repo.git",
    "../repo",
    "file:///srv/git/repo.git",
    "https://github.com/onlyone",
    "https://github.com/",
    "git@github.com:repo.git",
    "https://dev.azure.com/org/project",
    "https://vs-ssh.visualstudio.com/project/_git/repo",
  ])("cannot normalise %j", (url) => {
    expect(normaliseRemote(url)).toBeUndefined();
  });

  it("returns undefined for a URL the parser rejects, and keeps a path with broken percent-encoding as is", () => {
    expect(normaliseRemote("https://[broken/o/r.git")).toBeUndefined();
    expect(normaliseRemote("https://github.com/o/100%/r.git")).toBe("o/100%/r");
    expect(normaliseRemote("git@github.com:o/50%.git")).toBe("o/50%");
  });

  it("never includes the host name, so the same repo on two machines matches", () => {
    const hosts = [
      "https://github.com/o/r.git",
      "git@github.com:o/r.git",
      "https://github.example.com/o/r",
      "ssh://git@internal-mirror:2222/o/r.git",
    ];
    for (const url of hosts) {
      const subject = normaliseRemote(url);
      expect(subject).toBe("o/r");
      expect(subject).not.toMatch(/github|mirror|\./);
    }
  });
});

describe("repoSubject", () => {
  const remote = (name: string, url: string) => ({ name, url });

  it("prefers origin over other remotes", () => {
    expect(
      repoSubject({
        folderName: "folder",
        remotes: [
          remote("upstream", "https://github.com/up/stream.git"),
          remote("origin", "https://github.com/me/mine.git"),
        ],
      }),
    ).toBe("me/mine");
  });

  it("uses the first remote when there is no origin", () => {
    expect(
      repoSubject({
        folderName: "folder",
        remotes: [
          remote("fork", "git@github.com:a/b.git"),
          remote("upstream", "https://github.com/c/d"),
        ],
      }),
    ).toBe("a/b");
  });

  it("uses the folder name when there are no remotes", () => {
    expect(repoSubject({ folderName: "my-notes", remotes: [] })).toBe("my-notes");
  });

  it("returns undefined when no folder is open", () => {
    expect(repoSubject(undefined)).toBeUndefined();
  });

  it("an unparseable URL falls back to the folder name", () => {
    expect(repoSubject({ folderName: "scratch", remotes: [remote("origin", "not a url")] })).toBe(
      "scratch",
    );
    expect(
      repoSubject({ folderName: "scratch", remotes: [remote("origin", "/srv/git/x.git")] }),
    ).toBe("scratch");
  });

  it("falls through an unparseable origin to a later remote that parses", () => {
    expect(
      repoSubject({
        folderName: "scratch",
        remotes: [remote("origin", "nonsense"), remote("backup", "https://github.com/o/r.git")],
      }),
    ).toBe("o/r");
  });

  it("trims the folder name and returns undefined for an empty one", () => {
    expect(repoSubject({ folderName: "  spaced  ", remotes: [] })).toBe("spaced");
    expect(repoSubject({ folderName: "   ", remotes: [] })).toBeUndefined();
  });

  it("does not modify its input", () => {
    const info = { folderName: "f", remotes: [remote("origin", "https://github.com/o/r.git")] };
    const copy = structuredClone(info);
    repoSubject(info);
    expect(info).toEqual(copy);
  });
});
