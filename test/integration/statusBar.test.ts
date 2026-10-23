import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { removeTempDirs, workspaceWithOrigin } from "./gitFixtures";
import {
  FAKE_PROVIDER_ID,
  chatRequest,
  fakeModel,
  participantApi,
  recordingStream,
} from "./support";

const origin = (name: string) => `https://github.com/test-owner/${name}.git`;

/** Polls until the condition holds; the item refreshes after the reply, not before it. */
async function until<T>(read: () => T, ok: (value: T) => boolean, what: string): Promise<T> {
  const end = Date.now() + 10_000;
  let value = read();
  while (!ok(value)) {
    if (Date.now() > end)
      assert.fail(`Timed out waiting for ${what}; last value: ${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    value = read();
  }
  return value;
}

async function chat(prompt = "hi"): Promise<void> {
  const api = await participantApi();
  const source = new vscode.CancellationTokenSource();
  const { stream } = recordingStream();
  try {
    await api.test.handleRequest(
      chatRequest(await fakeModel(), prompt),
      { history: [] },
      stream,
      source.token,
    );
  } finally {
    source.dispose();
  }
}

describe("status bar item", () => {
  const settings = () => vscode.workspace.getConfiguration("q0t4");

  before(async () => {
    await vscode.extensions.getExtension(FAKE_PROVIDER_ID)?.activate();
    await vscode.commands.executeCommand("q0t4-test.setScript", ["Hel", "lo", "!"]);
    await (
      await participantApi()
    ).test.ready;
  });

  afterEach(async () => {
    const api = await participantApi();
    api.test.setWorkspace(undefined);
    api.test.setLimit(undefined);
    await settings().update("defaultLimit", undefined, vscode.ConfigurationTarget.Global);
  });

  after(removeTempDirs);

  it("is created and shows text and a tooltip after activation", async () => {
    const api = await participantApi();
    const state = await until(
      () => api.test.statusBar.state(),
      (s) => s !== undefined,
      "the first status bar state",
    );
    assert.ok(state?.text.startsWith("$(pulse) "), state?.text);
    assert.ok(state?.tooltip.startsWith("Q0T4 usage this week\n"), state?.tooltip);
    assert.match(state?.tooltip ?? "", /\nResets [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}$/);
  });

  it("shows the open folder's repo and updates right after a chat", async () => {
    const api = await participantApi();
    api.test.setWorkspace(await workspaceWithOrigin(origin("bar-repo")));
    await api.test.statusBar.refresh();
    assert.match(
      api.test.statusBar.state()?.text ?? "",
      /^\$\(pulse\) test-owner\/bar-repo 0\/150k$/,
    );

    await chat();
    const state = await until(
      () => api.test.statusBar.state(),
      (s) => /bar-repo [1-9]\d*k?\/150k$/.test(s?.text ?? ""),
      "the status bar to show the usage",
    );
    assert.equal(state?.level, "normal");
  });

  it("remembers the last subject under q0t4.ui.lastSubject", async () => {
    const api = await participantApi();
    api.test.setWorkspace(await workspaceWithOrigin(origin("remembered")));
    await chat();
    await until(
      () => api.test.storage.get<string>("q0t4.ui.lastSubject"),
      (s) => s === "test-owner/remembered",
      "the stored last subject",
    );
  });

  it("refreshes after a refusal and turns red when the budget is exhausted", async () => {
    const api = await participantApi();
    api.test.setWorkspace(await workspaceWithOrigin(origin("refused")));
    api.test.setLimit(1);
    await chat("this does not fit in a budget of one token");
    const state = await until(
      () => api.test.statusBar.state(),
      (s) => /refused 0\/1$/.test(s?.text ?? ""),
      "the status bar to show the refusal",
    );
    assert.equal(state?.level, "error");
  });

  it("refreshes when a setting changes", async () => {
    const api = await participantApi();
    api.test.setWorkspace(await workspaceWithOrigin(origin("settings-change")));
    await api.test.statusBar.refresh();
    await settings().update("defaultLimit", 100_000, vscode.ConfigurationTarget.Global);
    await until(
      () => api.test.statusBar.state(),
      (s) => /settings-change \d+k?\/100k$/.test(s?.text ?? ""),
      "the status bar to follow defaultLimit",
    );
  });
});
