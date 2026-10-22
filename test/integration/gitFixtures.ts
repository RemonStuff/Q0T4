import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import * as vscode from "vscode";
import { loadGitApi, workspaceRepo } from "../../src/adapters/workspaceRepo";
import type { WorkspaceEnv } from "../../src/adapters/workspaceRepo";
import type { WorkspacePort } from "../../src/ports/WorkspacePort";

const created: string[] = [];

export async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "q0t4-ws-"));
  created.push(dir);
  return dir;
}

/** A real git repository in a temporary folder, optionally with an `origin` remote. */
export async function gitRepo(origin?: string): Promise<string> {
  const dir = await tempDir();
  execFileSync("git", ["init", "-q", dir]);
  if (origin !== undefined) execFileSync("git", ["-C", dir, "remote", "add", "origin", origin]);
  return dir;
}

export const folderOf = (path: string, index = 0): vscode.WorkspaceFolder => ({
  uri: vscode.Uri.file(path),
  name: basename(path),
  index,
});

export function env(
  folders: readonly vscode.WorkspaceFolder[],
  activeUri?: vscode.Uri,
  git: WorkspaceEnv["git"] = () => loadGitApi(),
): WorkspaceEnv {
  return { folders: () => folders, activeUri: () => activeUri, git };
}

/** A workspace whose only folder is a new git repo with the given origin. */
export async function workspaceWithOrigin(origin: string): Promise<WorkspacePort> {
  const dir = await gitRepo(origin);
  return workspaceRepo(env([folderOf(dir)]));
}

export async function removeTempDirs(): Promise<void> {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
}
