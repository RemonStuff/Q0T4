import * as assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import * as vscode from "vscode";
import { loadGitApi, workspaceRepo } from "../../src/adapters/workspaceRepo";
import type { WorkspaceEnv } from "../../src/adapters/workspaceRepo";

const created: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "q0t4-ws-"));
  created.push(dir);
  return dir;
}

async function gitRepo(origin?: string): Promise<string> {
  const dir = await tempDir();
  execFileSync("git", ["init", "-q", dir]);
  if (origin !== undefined) execFileSync("git", ["-C", dir, "remote", "add", "origin", origin]);
  return dir;
}

const folderOf = (path: string, index = 0): vscode.WorkspaceFolder => ({
  uri: vscode.Uri.file(path),
  name: basename(path),
  index,
});

const realGit = (): Promise<Awaited<ReturnType<typeof loadGitApi>>> => loadGitApi();

function env(
  folders: readonly vscode.WorkspaceFolder[],
  activeUri?: vscode.Uri,
  git: WorkspaceEnv["git"] = realGit,
): WorkspaceEnv {
  return { folders: () => folders, activeUri: () => activeUri, git };
}

describe("workspaceRepo adapter", () => {
  after(async () => {
    await Promise.all(created.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("returns undefined when no folder is open", async () => {
    assert.equal(await workspaceRepo(env([])).currentRepo(), undefined);
  });

  it("returns the folder name and origin remote for a git repo with a remote", async () => {
    const dir = await gitRepo("https://github.com/test-owner/test-repo.git");
    const repo = await workspaceRepo(env([folderOf(dir)])).currentRepo();
    assert.equal(repo?.folderName, basename(dir));
    assert.deepEqual(repo?.remotes, [
      { name: "origin", url: "https://github.com/test-owner/test-repo.git" },
    ]);
  });

  it("returns the folder name and no remotes for a git repo without remotes", async () => {
    const dir = await gitRepo();
    assert.deepEqual(await workspaceRepo(env([folderOf(dir)])).currentRepo(), {
      folderName: basename(dir),
      remotes: [],
    });
  });

  it("returns the folder name and no remotes for a folder that is not a git repo", async () => {
    const dir = await tempDir();
    assert.deepEqual(await workspaceRepo(env([folderOf(dir)])).currentRepo(), {
      folderName: basename(dir),
      remotes: [],
    });
  });

  it("in a multi-root workspace, picks the folder of the active editor", async () => {
    const first = await gitRepo("https://github.com/test-owner/first.git");
    const second = await gitRepo("https://github.com/test-owner/second.git");
    const folders = [folderOf(first, 0), folderOf(second, 1)];
    const active = vscode.Uri.file(join(second, "src", "index.ts"));
    const repo = await workspaceRepo(env(folders, active)).currentRepo();
    assert.equal(repo?.folderName, basename(second));
    assert.equal(repo?.remotes[0]?.url, "https://github.com/test-owner/second.git");
    // Without an active editor the first folder is used.
    const fallback = await workspaceRepo(env(folders)).currentRepo();
    assert.equal(fallback?.folderName, basename(first));
  });

  it("returns no remotes, without throwing, when the Git API is unavailable", async () => {
    const dir = await gitRepo("https://github.com/test-owner/test-repo.git");
    const repo = await workspaceRepo(
      env([folderOf(dir)], undefined, async () => undefined),
    ).currentRepo();
    assert.deepEqual(repo, { folderName: basename(dir), remotes: [] });
  });

  it("returns no remotes, without throwing, when the Git API fails", async () => {
    const dir = await gitRepo("https://github.com/test-owner/test-repo.git");
    const failing = async () => {
      throw new Error("git extension crashed");
    };
    const repo = await workspaceRepo(env([folderOf(dir)], undefined, failing)).currentRepo();
    assert.deepEqual(repo, { folderName: basename(dir), remotes: [] });
  });

  it("reads the workspace folders and the active editor of the real window by default", async () => {
    const repo = await workspaceRepo().currentRepo();
    assert.ok(repo === undefined || repo.folderName.length > 0);
    assert.equal(repo?.folderName, vscode.workspace.workspaceFolders?.[0]?.name);
  });
});
