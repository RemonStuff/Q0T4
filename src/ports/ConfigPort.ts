import type { Q0T4Config } from "../core/types";
import type { Disposable } from "./Disposable";

/** Validated `q0t4.*` settings. Implemented by `adapters/vscodeConfig` (#26). */
export interface ConfigPort {
  get(): Q0T4Config;
  onDidChange(listener: () => void): Disposable;
}
