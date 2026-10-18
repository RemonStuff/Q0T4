/** Anything that releases a subscription or resource; matches `vscode.Disposable`. */
export interface Disposable {
  dispose(): void;
}
