import * as vscode from "vscode";

export const Q0T4_ID = "RemonStuff.q0t4";
export const FAKE_PROVIDER_ID = "q0t4-test.fake-lm-provider";
/** The only model vendor integration tests may use; never real Copilot. */
export const FAKE_VENDOR = "q0t4-test";

export async function fakeModel(): Promise<vscode.LanguageModelChat> {
  const [model] = await vscode.lm.selectChatModels({ vendor: FAKE_VENDOR });
  if (!model) throw new Error(`no ${FAKE_VENDOR} model available`);
  return model;
}
