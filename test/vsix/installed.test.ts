// Smoke tests against the packaged .vsix, installed into a clean VS Code the
// way a user installs it (not loaded from the source folder). Replaces the
// manual install checks for each iteration (docs/manual-testing.md).
import * as assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import * as vscode from "vscode";
import type { Q0T4Exports } from "../../src/extension";
import {
  FAKE_PROVIDER_ID,
  FAKE_VENDOR,
  chatRequest,
  fakeModel,
  outcomeOf,
  recordingStream,
  replyText,
  withDeadline,
} from "../integration/support";
import type { ProviderState } from "../integration/support";

const Q0T4_ID = "RemonStuff.q0t4";
const repoRoot = resolve(__dirname, "../../..");

interface Command {
  name: string;
  description?: string;
}
interface Participant {
  id: string;
  name: string;
  description?: string;
  isSticky?: boolean;
  commands?: Command[];
}

function installed(): vscode.Extension<Q0T4Exports> {
  const extension = vscode.extensions.getExtension(Q0T4_ID);
  assert.ok(extension, `${Q0T4_ID} is not installed`);
  return extension;
}

function participant(): Participant {
  const contributes = installed().packageJSON.contributes as { chatParticipants?: Participant[] };
  const found = contributes.chatParticipants?.find((p) => p.id === "q0t4.chat");
  assert.ok(found, "no q0t4.chat participant in the installed manifest");
  return found;
}

describe("installed .vsix", () => {
  before(async () => {
    await vscode.extensions.getExtension(FAKE_PROVIDER_ID)?.activate();
  });

  beforeEach(async () => {
    await vscode.commands.executeCommand("q0t4-test.setScript", ["Installed ", "model reply"]);
  });
  it("is installed from the package, not loaded from the source folder", () => {
    const path = resolve(installed().extensionPath);
    assert.notEqual(path, repoRoot);
    assert.match(path.replaceAll("\\", "/"), /\/\.vscode-test\/extensions\/remonstuff\.q0t4-/i);
  });

  it("ships the bundle and readme but no sources, tests or node_modules", () => {
    const root = installed().extensionPath;
    assert.ok(existsSync(join(root, "dist", "extension.js")), "dist/extension.js missing");
    const entries = readdirSync(root).map((e) => e.toLowerCase());
    for (const forbidden of ["src", "test", "node_modules", "docs", "coverage"]) {
      assert.ok(!entries.includes(forbidden), `${forbidden}/ should not be packaged`);
    }
  });

  it("activates without Copilot Chat present", async () => {
    const extension = installed();
    await extension.activate();
    assert.equal(extension.isActive, true);
  });

  it("contributes the sticky q0t4 participant with a description", () => {
    const p = participant();
    assert.equal(p.name, "q0t4");
    assert.equal(p.isSticky, true);
    assert.ok(p.description, "participant has no description");
  });

  it("contributes the status, subjects and use commands, each with a description", () => {
    const commands = participant().commands ?? [];
    assert.deepEqual(commands.map((c) => c.name).sort(), ["status", "subjects", "use"]);
    for (const command of commands)
      assert.ok(command.description, `/${command.name} has no description`);
  });

  it("the installed participant streams the selected fake model reply", async () => {
    const api = await installed().activate();
    const model = await fakeModel();
    const { stream, markdown } = recordingStream();
    const source = new vscode.CancellationTokenSource();
    try {
      const result = await api.test.handleRequest(
        chatRequest(model),
        { history: [] },
        stream,
        source.token,
      );
      assert.deepEqual(replyText(markdown), "Installed model reply");
      assert.deepEqual(outcomeOf(result), { outcome: "completed", model: model.name });
      assert.deepEqual(api.test.requests.at(-1), "hi");
    } finally {
      source.dispose();
    }
  });

  it("the installed participant appends the usage footer and records the usage", async () => {
    const api = await installed().activate();
    const before = api.test.store.get("general").tokens;
    const { stream, markdown } = recordingStream();
    const source = new vscode.CancellationTokenSource();
    try {
      const result = await api.test.handleRequest(
        chatRequest(await fakeModel()),
        { history: [] },
        stream,
        source.token,
      );
      const text = markdown.join("");
      assert.ok(text.includes("<!-- q0t4:footer -->"), "no footer sentinel");
      assert.match(text, /\*general: [^/]+ \/ 200k this week · resets date unavailable · /);
      const metadata = (result as { metadata: { inputTokens: number; outputTokens: number } })
        .metadata;
      assert.ok(metadata.inputTokens > 0 && metadata.outputTokens > 0);
      assert.equal(
        api.test.store.get("general").tokens,
        before + metadata.inputTokens + metadata.outputTokens,
      );
    } finally {
      source.dispose();
    }
  });

  it("the installed participant uses the newly selected model on each request", async () => {
    const api = await installed().activate();
    const models = await vscode.lm.selectChatModels({ vendor: FAKE_VENDOR });
    assert.equal(models.length, 2);
    const source = new vscode.CancellationTokenSource();
    try {
      for (const model of models) {
        const result = await api.test.handleRequest(
          chatRequest(model),
          { history: [] },
          recordingStream().stream,
          source.token,
        );
        assert.deepEqual(outcomeOf(result), { outcome: "completed", model: model.name });
      }
      const state = await vscode.commands.executeCommand<ProviderState>("q0t4-test.getState");
      assert.deepEqual(
        state?.requests.map((request) => request.model),
        models.map((model) => model.name),
      );
    } finally {
      source.dispose();
    }
  });

  it("the installed participant cancels the provider and stops streaming", async () => {
    const api = await installed().activate();
    const model = await fakeModel();
    await vscode.commands.executeCommand("q0t4-test.hold");
    const source = new vscode.CancellationTokenSource();
    const { stream, markdown } = recordingStream(() => source.cancel());
    try {
      assert.deepEqual(
        outcomeOf(
          await withDeadline(
            api.test.handleRequest(chatRequest(model), { history: [] }, stream, source.token),
          ),
        ),
        { outcome: "cancelled", model: model.name },
      );
      assert.deepEqual(markdown, ["Installed "]);
      assert.equal(
        await withDeadline(vscode.commands.executeCommand("q0t4-test.waitForCancellation")),
        true,
      );
    } finally {
      source.cancel();
      await vscode.commands.executeCommand("q0t4-test.release");
      source.dispose();
    }
  });

  it("the installed participant does not send unimplemented commands to a model", async () => {
    const api = await installed().activate();
    const source = new vscode.CancellationTokenSource();
    const { stream, markdown } = recordingStream();
    try {
      assert.deepEqual(
        outcomeOf(
          await api.test.handleRequest(
            chatRequest(await fakeModel(), "", "status"),
            { history: [] },
            stream,
            source.token,
          ),
        ),
        { outcome: "error" },
      );
      assert.deepEqual(markdown, [
        "Slash commands aren't available yet. Send a normal message to talk to the selected model.",
      ]);
      const state = await vscode.commands.executeCommand<ProviderState>("q0t4-test.getState");
      assert.deepEqual(state?.requests, []);
    } finally {
      source.dispose();
    }
  });
});
