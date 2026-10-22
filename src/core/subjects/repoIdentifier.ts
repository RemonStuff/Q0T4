import type { RepoInfo } from "../../ports/WorkspacePort";
import type { SubjectName } from "../types";

/**
 * Turns a git remote URL into `owner/repo`, the same on every machine and clone: the
 * host name is never part of it. Handles HTTPS, SSH (`git@host:owner/repo.git` and
 * `ssh://`), a trailing `.git` or slash, credentials in the URL, GitLab subgroups
 * and Azure DevOps (`org/project/repo`). Returns `undefined` for anything else,
 * such as a local path.
 */
export function normaliseRemote(url: string): string | undefined {
  const text = url.trim();
  const parsed = splitRemote(text);
  if (parsed === undefined) return undefined;

  const host = parsed.host.toLowerCase();
  let segments = parsed.path.split("/").filter((segment) => segment !== "");
  if (host.endsWith("dev.azure.com") || host.endsWith("visualstudio.com")) {
    segments = azureSegments(host, segments);
    return segments.length === 3 ? segments.join("/") : undefined;
  }

  const last = segments.pop();
  if (last === undefined) return undefined;
  segments.push(last.replace(/\.git$/i, ""));
  return segments.length >= 2 && segments.every((segment) => segment !== "")
    ? segments.join("/")
    : undefined;
}

function splitRemote(text: string): { host: string; path: string } | undefined {
  if (text === "") return undefined;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      if (url.protocol === "file:" || url.hostname === "") return undefined;
      return { host: url.hostname, path: decode(url.pathname) };
    } catch {
      return undefined;
    }
  }
  // scp-like: [user@]host:path. A one-letter host is a Windows drive, not a host.
  const scp = /^(?:[^@/\s]+@)?([^:/\s]{2,}):(?!\/\/)(.+)$/.exec(text);
  return scp === null ? undefined : { host: scp[1] as string, path: decode(scp[2] as string) };
}

/** `org/project/_git/repo`, `v3/org/project/repo` or (visualstudio.com) `project/_git/repo`. */
function azureSegments(host: string, segments: string[]): string[] {
  const clean = (list: string[]) =>
    list.map((s, i) => (i === list.length - 1 ? s.replace(/\.git$/i, "") : s));
  if (segments[0] === "v3") return clean(segments.slice(1));
  const withoutGit = segments.filter((segment) => segment !== "_git");
  if (host.endsWith("visualstudio.com")) {
    const org = host.split(".")[0];
    return org === undefined || org === "vs-ssh" ? [] : clean([org, ...withoutGit]);
  }
  return clean(withoutGit);
}

function decode(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * The subject for the repo a workspace folder is in: the `origin` remote, else the
 * first remote that can be read, else the folder name. `undefined` when no folder is
 * open, so the caller uses the fallback subject.
 */
export function repoSubject(info: RepoInfo | undefined): SubjectName | undefined {
  if (info === undefined) return undefined;
  const origin = info.remotes.filter((remote) => remote.name === "origin");
  const others = info.remotes.filter((remote) => remote.name !== "origin");
  for (const remote of [...origin, ...others]) {
    const subject = normaliseRemote(remote.url);
    if (subject !== undefined) return subject;
  }
  const folder = info.folderName.trim();
  return folder === "" ? undefined : folder;
}
