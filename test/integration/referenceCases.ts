import * as assert from "node:assert/strict";
import { resolve } from "node:path";
import * as vscode from "vscode";
import type { Q0T4Exports } from "../../src/extension";
import { FAKE_PROVIDER_ID, chatRequest, fakeModel, recordingStream } from "./support";
import type { ProviderState } from "./support";

export const contextUri = () =>
  vscode.Uri.file(resolve(__dirname, "../../../test/fixtures/reference-workspace/context.txt"));
export const contextText = "first line\nselected text only\nlast line\n";

export function referenceForwardingTests(getApi: () => Promise<Q0T4Exports>) {
  describe("attached reference forwarding", () => {
    before(async () => {
      await vscode.extensions.getExtension(FAKE_PROVIDER_ID)?.activate();
    });
    beforeEach(async () => {
      await vscode.commands.executeCommand("q0t4-test.setScript", ["answer"]);
    });

    async function invoke(references: vscode.ChatRequest["references"]) {
      const api = await getApi();
      const source = new vscode.CancellationTokenSource();
      const output = recordingStream();
      try {
        const result = await api.test.handleRequest(
          chatRequest(await fakeModel(), "question", undefined, references),
          {
            history: [
              {
                prompt: "old question",
                participant: "q0t4.chat",
                references: [],
                toolReferences: [],
              },
              {
                response: [new vscode.ChatResponseMarkdownPart("old answer")],
                result: {},
                participant: "q0t4.chat",
              },
            ],
          },
          output.stream,
          source.token,
        );
        const state = await vscode.commands.executeCommand<ProviderState>("q0t4-test.getState");
        assert.ok(state);
        return { result, output, state };
      } finally {
        source.dispose();
      }
    }

    it("sends actual file, selection and string content in prompt order before the prompt", async () => {
      const references: vscode.ChatRequest["references"] = Object.freeze([
        { id: "inline", value: " literal ``` text " },
        { id: "file", value: new vscode.Location(contextUri(), new vscode.Range(1, 0, 1, 8)) },
        { id: "file", value: contextUri() },
      ]);
      const { state } = await invoke(references);
      assert.deepEqual(state.requests[0]?.messages, [
        { role: "user", text: "old question" },
        { role: "assistant", text: "old answer" },
        {
          role: "user",
          text:
            `context.txt\n\`\`\`\n${contextText}\n\`\`\`\n\n` +
            "context.txt:2:1-2:9\n```\nselected\n```\n\n" +
            "inline\n````\n literal ``` text \n````",
        },
        { role: "user", text: "question" },
      ]);
      assert.equal(references[0]?.id, "inline");
    });

    it("reports multiple unsupported references once without adding a context message", async () => {
      const { state, output } = await invoke([
        { id: "image", value: new Uint8Array([137, 80, 78, 71]) },
        { id: "unknown", value: {} },
      ]);
      assert.deepEqual(output.progress, [
        "Some attached references could not be included (unsupported content).",
      ]);
      assert.equal(state.requests[0]?.messages.length, 3);
    });

    it("refuses an unreadable attached file without a provider request", async () => {
      const { state, result, output } = await invoke([
        { id: "file", value: vscode.Uri.joinPath(contextUri(), "does-not-exist.txt") },
      ]);
      assert.deepEqual(state.requests, []);
      assert.deepEqual(result, { metadata: { outcome: "error" } });
      assert.equal(
        output.markdown.join(""),
        "Q0T4 couldn't read an attached reference. Check that it is accessible and try again.",
      );
    });
  });
}
