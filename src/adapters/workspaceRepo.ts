import { execFile } from "node:child_process";
import * as vscode from "vscode";
import { pickFolder } from "../core/subjects/pickFolder";
import type { RepoInfo, WorkspacePort } from "../ports/WorkspacePort";
import type { API, GitExtension } from "./git";

const GIT_READY_TIMEOUT_MS = 3000;

export interface WorkspaceEnv {
  folders(): readonly vscode.WorkspaceFolder[];
  activeUri(): vscode.Uri | undefined;
  /** The Git API, or `undefined` when the Git extension is missing, disabled or fails. */
  git(): Promise<API | undefined>;
}

const defaultEnv: WorkspaceEnv = {
  folders: () => vscode.workspace.workspaceFolders ?? [],
  activeUri: () => vscode.window.activeTextEditor?.document.uri,
  git: () => loadGitApi(),
};

/**
 * `WorkspacePort` over the workspace folders and VS Code's built-in Git extension.
 * Picks the folder of the active editor, else the first folder. Without a usable Git
 * extension, or outside a git repo, it still returns the folder, with no remotes.
 */
export function workspaceRepo(env: WorkspaceEnv = defaultEnv): WorkspacePort {
  return {
    async currentRepo(): Promise<RepoInfo | undefined> {
      const folders = env.folders().map((folder) => ({
        uri: folder.uri.toString(),
        name: folder.name,
        folder,
      }));
      const picked = pickFolder(folders, env.activeUri()?.toString());
      if (picked === undefined) return undefined;
      return { folderName: picked.name, remotes: await remotesOf(env, picked.folder.uri) };
    },
  };
}

async function remotesOf(env: WorkspaceEnv, folder: vscode.Uri): Promise<RepoInfo["remotes"]> {
  const fromApi = await remotesFromApi(env, folder);
  return fromApi.length > 0 || folder.scheme !== "file" ? fromApi : remotesFromCli(folder.fsPath);
}

async function remotesFromApi(env: WorkspaceEnv, folder: vscode.Uri): Promise<RepoInfo["remotes"]> {
  try {
    const api = await env.git();
    if (api === undefined) return [];
    const repository = api.getRepository(folder) ?? (await api.openRepository(folder));
    if (repository === null) return [];
    return repository.state.remotes.flatMap((remote) => {
      const url = remote.fetchUrl ?? remote.pushUrl;
      return url === undefined ? [] : [{ name: remote.name, url }];
    });
  } catch {
    return [];
  }
}

/** Fallback when the Git extension is off or has not found the repo: ask git itself. */
function remotesFromCli(cwd: string): Promise<RepoInfo["remotes"]> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["remote", "-v"],
      { cwd, timeout: 3000, windowsHide: true },
      (error, stdout) => {
        if (error) return resolve([]);
        const seen = new Map<string, string>();
        for (const line of stdout.split(/\r?\n/)) {
          const match = /^(\S+)\s+(\S+)\s+\(fetch\)$/.exec(line);
          if (match && !seen.has(match[1] as string))
            seen.set(match[1] as string, match[2] as string);
        }
        resolve([...seen].map(([name, url]) => ({ name, url })));
      },
    );
  });
}

export async function loadGitApi(): Promise<API | undefined> {
  const extension = vscode.extensions.getExtension<GitExtension>("vscode.git");
  if (extension === undefined) return undefined;
  const exports = extension.isActive ? extension.exports : await extension.activate();
  const api = exports.getAPI(1);
  if (api.state === "initialized") return api;
  // The repositories are still being discovered: wait a little, then use what there is.
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, GIT_READY_TIMEOUT_MS);
    const subscription = api.onDidChangeState(done);
    function done(): void {
      clearTimeout(timer);
      subscription.dispose();
      resolve();
    }
  });
  return api;
}
