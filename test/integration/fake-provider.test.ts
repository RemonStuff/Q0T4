import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { FAKE_PROVIDER_ID, FAKE_VENDOR, fakeModel } from "./support";

async function collect(response: vscode.LanguageModelChatResponse): Promise<string> {
  let text = "";
  for await (const part of response.text) text += part;
  return text;
}

describe("fake language-model provider", () => {
  before(async () => {
    await vscode.extensions.getExtension(FAKE_PROVIDER_ID)?.activate();
  });

  it('fake provider is visible via vscode.lm.selectChatModels({ vendor: "q0t4-test" })', async () => {
    const models = await vscode.lm.selectChatModels({ vendor: FAKE_VENDOR });
    assert.ok(models.length > 0, "no q0t4-test models");
  });

  it("fake model streams the scripted reply", async () => {
    await vscode.commands.executeCommand("q0t4-test.setScript", ["Hel", "lo", "!"]);
    const model = await fakeModel();
    const response = await model.sendRequest([vscode.LanguageModelChatMessage.User("hi")], {});
    assert.equal(await collect(response), "Hello!");
  });

  it("fake model countTokens returns ceil(chars / 4)", async () => {
    const model = await fakeModel();
    assert.equal(await model.countTokens("abcde"), 2);
    assert.equal(await model.countTokens(vscode.LanguageModelChatMessage.User("abcdefgh")), 2);
  });

  it("fake model rejects with the scripted LanguageModelError code", async () => {
    await vscode.commands.executeCommand("q0t4-test.setError", "Blocked");
    const model = await fakeModel();
    try {
      await assert.rejects(
        async () =>
          collect(await model.sendRequest([vscode.LanguageModelChatMessage.User("hi")], {})),
        (error: unknown) => error instanceof vscode.LanguageModelError && error.code === "Blocked",
      );
    } finally {
      await vscode.commands.executeCommand("q0t4-test.setScript", ["ok"]);
    }
  });
});
