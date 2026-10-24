import * as vscode from "vscode";
import type { Disposable } from "../ports/Disposable";
import type { StatusBarState, UiPort } from "../ports/UiPort";

export interface VscodeUiOptions {
  /** Command the status bar item runs when clicked. */
  readonly statusBarCommand?: string;
}

export interface VscodeUi extends UiPort, Disposable {
  /** What the item shows now, for the integration tests: VS Code can't read it back. */
  lastStatusBar(): StatusBarState | undefined;
}

const BACKGROUND = {
  warning: "statusBarItem.warningBackground",
  error: "statusBarItem.errorBackground",
} as const;

/** `UiPort` over the VS Code window. No logic: covered by integration tests. */
export function vscodeUi({ statusBarCommand }: VscodeUiOptions = {}): VscodeUi {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.name = "Q0T4";
  if (statusBarCommand !== undefined) item.command = statusBarCommand;
  let last: StatusBarState | undefined;
  return {
    setStatusBar(state) {
      last = state;
      item.text = state.text;
      item.tooltip = state.tooltip;
      item.backgroundColor =
        state.level === "normal" ? undefined : new vscode.ThemeColor(BACKGROUND[state.level]);
      item.show();
    },
    async confirm(message) {
      return (await vscode.window.showWarningMessage(message, { modal: true }, "OK")) === "OK";
    },
    async openSettings(query) {
      await vscode.commands.executeCommand("workbench.action.openSettings", query);
    },
    showInfo(text) {
      void vscode.window.showInformationMessage(text);
    },
    showWarning(text) {
      void vscode.window.showWarningMessage(text);
    },
    async showDocument(markdown) {
      const document = await vscode.workspace.openTextDocument({
        language: "markdown",
        content: markdown,
      });
      await vscode.window.showTextDocument(document, { preview: true });
    },
    lastStatusBar: () => last,
    dispose: () => item.dispose(),
  };
}
