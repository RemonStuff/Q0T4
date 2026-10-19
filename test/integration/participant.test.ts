import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { Q0T4_ID } from "./support";

interface ParticipantContribution {
  id: string;
  name: string;
  isSticky?: boolean;
  commands?: { name: string }[];
}

function manifest(): {
  contributes?: { chatParticipants?: ParticipantContribution[] };
  extensionDependencies?: string[];
} {
  const extension = vscode.extensions.getExtension(Q0T4_ID);
  assert.ok(extension, `${Q0T4_ID} is not loaded`);
  return extension.packageJSON;
}

function participant(): ParticipantContribution {
  const found = manifest().contributes?.chatParticipants?.find((p) => p.id === "q0t4.chat");
  assert.ok(found, "no q0t4.chat participant contributed");
  return found;
}

/** A ChatResponseStream that records markdown; other parts aren't used by the stub. */
function recordingStream(): { stream: vscode.ChatResponseStream; markdown: string[] } {
  const markdown: string[] = [];
  const stream = {
    markdown: (value: string | vscode.MarkdownString) =>
      markdown.push(typeof value === "string" ? value : value.value),
  } as unknown as vscode.ChatResponseStream;
  return { stream, markdown };
}

describe("@q0t4 participant", () => {
  it("package.json contributes chat participant q0t4 with isSticky true", () => {
    const p = participant();
    assert.equal(p.name, "q0t4");
    assert.equal(p.isSticky, true);
  });

  it("participant declares commands status, subjects and use", () => {
    assert.deepEqual((participant().commands ?? []).map((c) => c.name).sort(), [
      "status",
      "subjects",
      "use",
    ]);
  });

  it("package.json declares no extensionDependencies", () => {
    assert.deepEqual(manifest().extensionDependencies ?? [], []);
  });

  it("Q0T4 activates without Copilot Chat present", async () => {
    assert.equal(vscode.extensions.getExtension("github.copilot-chat"), undefined);
    const extension = vscode.extensions.getExtension(Q0T4_ID);
    await extension?.activate();
    assert.equal(extension?.isActive, true);
  });

  it("handleRequest writes the stub message to the response stream", async () => {
    const exports = (await vscode.extensions.getExtension(Q0T4_ID)?.activate()) as {
      test: { handleRequest: vscode.ChatRequestHandler };
    };
    const { stream, markdown } = recordingStream();
    const token = new vscode.CancellationTokenSource().token;
    await exports.test.handleRequest(
      { prompt: "hi" } as vscode.ChatRequest,
      { history: [] },
      stream,
      token,
    );
    assert.deepEqual(markdown, ["Q0T4 is installed. Budgeting isn't wired up yet."]);
  });
});
