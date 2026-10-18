import type { ModelPort } from "./ModelPort";

export interface ModelSelector {
  readonly vendor?: string;
  readonly family?: string;
  readonly id?: string;
}

/** Finds models by vendor/family/id. Implemented by `adapters/vscodeModelSelector` over `vscode.lm.selectChatModels` (#11). */
export interface ModelSelectorPort {
  select(selector: ModelSelector): Promise<readonly ModelPort[]>;
}
