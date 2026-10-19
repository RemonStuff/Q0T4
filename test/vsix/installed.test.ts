// Smoke tests against the packaged .vsix, installed into a clean VS Code the
// way a user installs it (not loaded from the source folder). Replaces the
// manual install checks for each iteration (docs/manual-testing.md).
import * as assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import * as vscode from "vscode";

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

function installed(): vscode.Extension<{
  test: { handleRequest: vscode.ChatRequestHandler; requests: readonly string[] };
}> {
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

  it("the installed participant replies with the stub message", async () => {
    const api = await installed().activate();
    const markdown: string[] = [];
    const stream = {
      markdown: (value: string | vscode.MarkdownString) =>
        markdown.push(typeof value === "string" ? value : value.value),
    } as unknown as vscode.ChatResponseStream;
    await api.test.handleRequest(
      { prompt: "hi" } as vscode.ChatRequest,
      { history: [] },
      stream,
      new vscode.CancellationTokenSource().token,
    );
    assert.deepEqual(markdown, ["Q0T4 is installed. Budgeting isn't wired up yet."]);
    assert.deepEqual(api.test.requests.at(-1), "hi");
  });
});
