export interface RepoInfo {
  readonly folderName: string;
  readonly remotes: readonly { readonly name: string; readonly url: string }[];
}

/** Which repo the user is working in. Implemented by `adapters/workspaceRepo` over the built-in Git API (#30). */
export interface WorkspacePort {
  /** `undefined` when no folder is open. */
  currentRepo(): Promise<RepoInfo | undefined>;
}
