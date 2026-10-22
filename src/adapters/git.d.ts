// The subset of VS Code's built-in Git extension API that Q0T4 uses
// (https://github.com/microsoft/vscode/blob/main/extensions/git/src/api/git.d.ts).
// Copied as types only: no runtime dependency is added.
import type { Event, Uri } from "vscode";

export interface Remote {
  readonly name: string;
  readonly fetchUrl?: string;
  readonly pushUrl?: string;
}

export interface Repository {
  readonly rootUri: Uri;
  readonly state: { readonly remotes: readonly Remote[] };
}

export interface API {
  readonly state: "uninitialized" | "initialized";
  readonly onDidChangeState: Event<"uninitialized" | "initialized">;
  getRepository(uri: Uri): Repository | null;
  openRepository(root: Uri): Promise<Repository | null>;
}

export interface GitExtension {
  getAPI(version: 1): API;
}
