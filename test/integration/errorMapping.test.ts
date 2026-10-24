import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { mapModelError } from "../../src/adapters/errorMapping";
import { ModelError } from "../../src/core/errors/modelErrors";
import {
  FAKE_PROVIDER_ID,
  chatRequest,
  fakeModel,
  outcomeOf,
  participantApi,
  recordingStream,
  replyText,
} from "./support";

const CASES = [
  [
    "NoPermissions",
    "noPermissions",
    "Q0T4 needs permission to use Copilot models. Accept the prompt and try again.",
  ],
  ["Blocked", "blocked", "Copilot reports a quota or rate limit. Try again later."],
] as const;

async function ask(): Promise<{ outcome?: string; model?: string; text: string }> {
  const api = await participantApi();
  const source = new vscode.CancellationTokenSource();
  const { stream, markdown } = recordingStream();
  try {
    const result = await api.test.handleRequest(
      chatRequest(await fakeModel()),
      { history: [] },
      stream,
      source.token,
    );
    return { ...outcomeOf(result), text: replyText(markdown) };
  } finally {
    source.dispose();
  }
}

describe("errorMapping", () => {
  before(async () => {
    await vscode.extensions.getExtension(FAKE_PROVIDER_ID)?.activate();
    await (
      await participantApi()
    ).test.ready;
  });

  afterEach(async () => {
    await vscode.commands.executeCommand("q0t4-test.setScript", ["Hel", "lo", "!"]);
  });

  it("maps each LanguageModelError code to a core kind", () => {
    const factories: Record<string, (message: string) => vscode.LanguageModelError> = {
      NoPermissions: vscode.LanguageModelError.NoPermissions,
      Blocked: vscode.LanguageModelError.Blocked,
      NotFound: vscode.LanguageModelError.NotFound,
    };
    const expected: Record<string, string> = {
      NoPermissions: "noPermissions",
      Blocked: "blocked",
      NotFound: "notFound",
    };
    for (const [code, make] of Object.entries(factories)) {
      const mapped = mapModelError(make(`scripted ${code}`));
      assert.ok(mapped instanceof ModelError, code);
      assert.equal((mapped as ModelError).kind, expected[code], code);
      assert.equal((mapped as ModelError).message, `scripted ${code}`);
    }
  });

  it("maps other errors to unknown and keeps a ModelError as it is", () => {
    assert.equal((mapModelError(new Error("boom")) as ModelError).kind, "unknown");
    assert.equal((mapModelError("text") as ModelError).message, "text");
    const own = new ModelError("blocked", "already mapped");
    const cancelled = new vscode.CancellationError();
    assert.equal(mapModelError(cancelled), cancelled);
    assert.equal(mapModelError(own), own);
  });

  for (const [code, , message] of CASES) {
    it(`${code} from the provider shows its message through the participant`, async () => {
      await vscode.commands.executeCommand("q0t4-test.setError", code);
      const reply = await ask();
      assert.equal(reply.text, message);
      assert.equal(reply.outcome, "error");
    });
  }

  it("NotFound from the provider finds no Copilot fallback and shows the no-model message", async () => {
    await vscode.commands.executeCommand("q0t4-test.setError", "NotFound");
    const reply = await ask();
    assert.equal(reply.outcome, "noModel");
    assert.match(reply.text, /^No Copilot chat model is available\./);
  });
});
