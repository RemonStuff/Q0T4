export interface StatusBarState {
  readonly text: string;
  readonly tooltip: string;
  readonly level: "normal" | "warning" | "error";
}

/** Editor UI outside the chat. Implemented by `adapters/vscodeUi` (#33, #36, #37). */
export interface UiPort {
  setStatusBar(state: StatusBarState): void;
  /** Modal confirmation; resolves `false` when dismissed. */
  confirm(message: string): Promise<boolean>;
  openSettings(query: string): Promise<void>;
  showInfo(text: string): void;
}
