import type * as vscode from "vscode";
import type { StoragePort } from "../ports/StoragePort";

/** `StoragePort` over `ExtensionContext.globalState`. No logic: covered by an integration test. */
export function globalStateStorage(
  memento: Pick<vscode.Memento, "get" | "update" | "keys">,
): StoragePort {
  return {
    get: <T>(key: string) => memento.get<T>(key),
    set: async (key, value) => {
      await memento.update(key, value);
    },
    keys: () => memento.keys(),
  };
}
