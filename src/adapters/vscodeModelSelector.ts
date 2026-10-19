import * as vscode from "vscode";
import type { ModelSelectorPort } from "../ports/ModelSelectorPort";
import { vscodeModel } from "./vscodeModel";

export const vscodeModelSelector: ModelSelectorPort = {
  async select(selector) {
    return (await vscode.lm.selectChatModels(selector)).map(vscodeModel);
  },
};
