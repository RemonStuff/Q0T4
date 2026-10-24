import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { markdownLiteral } from "../../src/core/format/markdownLiteral";
import { removeTempDirs, workspaceWithOrigin } from "./gitFixtures";
import {
  FAKE_PROVIDER_ID,
  Q0T4_ID,
  chatRequest,
  fakeModel,
  participantApi,
  recordingStream,
} from "./support";

const origin = (name: string) => `https://github.com/test-owner/${name}.git`;
const COMMANDS = ["q0t4.showUsage", "q0t4.resetWeek", "q0t4.editSubjects", "q0t4.refreshPrices"];

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

/** Every line of this window's ledger files, parsed. */
function ledgerLines(root: string, sessionId: string): Record<string, unknown>[] {
  const base = path.join(root, "ledger");
  return fs
    .readdirSync(base)
    .map((month) => path.join(base, month, `${sessionId}.jsonl`))
    .filter((file) => fs.existsSync(file))
    .flatMap((file) => fs.readFileSync(file, "utf8").split("\n").filter(Boolean))
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("palette commands", () => {
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
    api.test.setConfirm(undefined);
  });

  after(removeTempDirs);

  it("are registered and declared in package.json with the Q0T4 category", async () => {
    const registered = await vscode.commands.getCommands(true);
    for (const id of COMMANDS) assert.ok(registered.includes(id), `${id} is registered`);
    const manifest = vscode.extensions.getExtension(Q0T4_ID)?.packageJSON as {
      contributes: { commands: { command: string; title: string; category: string }[] };
    };
    assert.deepEqual(
      manifest.contributes.commands.map((c) => [c.command, c.category]),
      COMMANDS.map((id) => [id, "Q0T4"]),
    );
  });

  it("Show Usage opens the /status table in an editor tab", async () => {
    const api = await participantApi();
    api.test.setWorkspace(await workspaceWithOrigin(origin("usage-doc")));
    await chat();
    await vscode.commands.executeCommand("q0t4.showUsage");
    const editor = vscode.window.activeTextEditor;
    assert.equal(editor?.document.languageId, "markdown");
    const text = editor?.document.getText() ?? "";
    assert.ok(text.startsWith("| Subject | Used | Weekly budget | % | Today | Requests |"), text);
    assert.ok(text.includes(`| ${markdownLiteral("test-owner/usage-doc")} |`), text);
    assert.match(text, /Weekly budgets reset on /);
  });

  it("Reset This Week with a stubbed confirm writes reset markers to the ledger file", async () => {
    const api = await participantApi();
    const subject = "test-owner/reset-me";
    api.test.setWorkspace(await workspaceWithOrigin(origin("reset-me")));
    await chat();
    assert.ok((await api.test.ledger.usedThisWeek(subject)).tokens > 0);

    const asked: string[] = [];
    api.test.setConfirm(async (message) => {
      asked.push(message);
      return true;
    });
    await vscode.commands.executeCommand("q0t4.resetWeek");

    assert.equal(asked.length, 1);
    assert.match(
      asked[0] ?? "",
      /Reset this week's usage for \d+ subjects? \(\w{3} \d+ \w{3} to \w{3} \d+ \w{3}\)\?/,
    );
    assert.equal((await api.test.ledger.usedThisWeek(subject)).tokens, 0);
    const markers = ledgerLines(api.test.ledgerRoot, api.test.sessionId).filter(
      (line) => line["kind"] === "reset" && line["subject"] === subject,
    );
    assert.equal(markers.length, 1);
    await api.test.statusBar.refresh();
    assert.match(api.test.statusBar.state()?.text ?? "", /reset-me 0\//);
  });

  it("Reset This Week keeps the usage when the confirmation is cancelled", async () => {
    const api = await participantApi();
    const subject = "test-owner/keep-me";
    api.test.setWorkspace(await workspaceWithOrigin(origin("keep-me")));
    await chat();
    const before = (await api.test.ledger.usedThisWeek(subject)).tokens;
    assert.ok(before > 0);
    api.test.setConfirm(async () => false);
    await vscode.commands.executeCommand("q0t4.resetWeek");
    assert.equal((await api.test.ledger.usedThisWeek(subject)).tokens, before);
    assert.equal(
      ledgerLines(api.test.ledgerRoot, api.test.sessionId).filter(
        (line) => line["kind"] === "reset" && line["subject"] === subject,
      ).length,
      0,
    );
  });
});
