import * as vscode from "vscode";
import { parseConfig } from "../core/subjects/parseConfig";
import type { Q0T4Config } from "../core/types";
import type { ConfigPort } from "../ports/ConfigPort";
import type { Disposable } from "../ports/Disposable";

const KEYS = [
  "subjects",
  "defaultLimit",
  "fallbackSubject",
  "resetDay",
  "warnAtPercent",
  "dailyPaceWarning",
  "includeHistory",
] as const;

/**
 * `ConfigPort` over the `q0t4.*` settings. Values are validated by `parseConfig`,
 * which never throws. Whenever the settings change, new warnings go to `onWarnings`
 * once, so a broken value is reported when it is set and not on every request.
 */
export function vscodeConfig(onWarnings?: (warnings: readonly string[]) => void): ConfigPort {
  let reported = "";

  function read() {
    const section = vscode.workspace.getConfiguration("q0t4");
    return parseConfig(Object.fromEntries(KEYS.map((key) => [key, section.get(key)])));
  }

  function report(): void {
    const { warnings } = read();
    const key = JSON.stringify(warnings);
    if (key === reported) return;
    reported = key;
    if (warnings.length > 0) onWarnings?.(warnings);
  }

  report();
  return {
    get(): Q0T4Config {
      return read().config;
    },
    onDidChange(listener: () => void): Disposable {
      return vscode.workspace.onDidChangeConfiguration((event) => {
        if (!event.affectsConfiguration("q0t4")) return;
        report();
        listener();
      });
    },
  };
}
