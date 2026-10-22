export interface FolderRef {
  /** The folder's URI as a string, e.g. `file:///work/a`. */
  readonly uri: string;
  readonly name: string;
}

const withSlash = (uri: string) => (uri.endsWith("/") ? uri : `${uri}/`);

/**
 * The workspace folder the user is working in: the one that contains the active
 * editor's file (the deepest, if folders are nested), otherwise the first folder,
 * otherwise `undefined`.
 */
export function pickFolder<T extends FolderRef>(
  folders: readonly T[],
  activeUri: string | undefined,
): T | undefined {
  if (activeUri !== undefined) {
    let best: T | undefined;
    for (const folder of folders) {
      const root = withSlash(folder.uri);
      const inside = withSlash(activeUri).startsWith(root);
      if (inside && (best === undefined || root.length > withSlash(best.uri).length)) best = folder;
    }
    if (best !== undefined) return best;
  }
  return folders[0];
}
