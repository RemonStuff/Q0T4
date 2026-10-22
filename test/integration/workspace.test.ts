import * as assert from "node:assert/strict";
import { basename, join } from "node:path";
import * as vscode from "vscode";
import { workspaceRepo } from "../../src/adapters/workspaceRepo";
import { env, folderOf, gitRepo, removeTempDirs, tempDir } from "./gitFixtures";

describe("workspaceRepo adapter", () => {
  after(removeTempDirs);

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

  it("falls back to `git remote -v` when the Git API is unavailable", async () => {
    const dir = await gitRepo("https://github.com/test-owner/test-repo.git");
    const repo = await workspaceRepo(
      env([folderOf(dir)], undefined, async () => undefined),
    ).currentRepo();
    assert.deepEqual(repo, {
      folderName: basename(dir),
      remotes: [{ name: "origin", url: "https://github.com/test-owner/test-repo.git" }],
    });
  });

  it("falls back to `git remote -v` when the Git API fails, without throwing", async () => {
    const dir = await gitRepo("https://github.com/test-owner/test-repo.git");
    const failing = async () => {
      throw new Error("git extension crashed");
    };
    const repo = await workspaceRepo(env([folderOf(dir)], undefined, failing)).currentRepo();
    assert.equal(repo?.remotes[0]?.url, "https://github.com/test-owner/test-repo.git");
  });

  it("returns no remotes when neither the Git API nor git can read the folder", async () => {
    const dir = await tempDir();
    const repo = await workspaceRepo(
      env([folderOf(dir)], undefined, async () => undefined),
    ).currentRepo();
    assert.deepEqual(repo, { folderName: basename(dir), remotes: [] });
  });

  it("reads the workspace folders and the active editor of the real window by default", async () => {
    const repo = await workspaceRepo().currentRepo();
    assert.ok(repo === undefined || repo.folderName.length > 0);
    assert.equal(repo?.folderName, vscode.workspace.workspaceFolders?.[0]?.name);
  });
});
