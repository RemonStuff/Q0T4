import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import {
  FAKE_PROVIDER_ID,
  FAKE_VENDOR,
  Q0T4_ID,
  chatRequest,
  fakeModel,
  participantApi,
  recordingStream,
  withDeadline,
} from "./support";
import type { ProviderState } from "./support";

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

describe("@q0t4 participant", () => {
  before(async () => {
    await vscode.extensions.getExtension(FAKE_PROVIDER_ID)?.activate();
  });

  beforeEach(async () => {
    await vscode.commands.executeCommand("q0t4-test.setScript", ["Hel", "lo", "!"]);
  });

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

  it("handleRequest streams the selected fake model reply to the response stream", async () => {
    const api = await participantApi();
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
      assert.equal(markdown.join(""), "Hello!");
      assert.deepEqual(result, { metadata: { outcome: "completed", model: model.name } });
      assert.equal(api.test.requests.at(-1), "hi");
    } finally {
      source.dispose();
    }
  });

  it("uses each request's selected model without retaining the previous model", async () => {
    const api = await participantApi();
    const models = await vscode.lm.selectChatModels({ vendor: FAKE_VENDOR });
    assert.equal(models.length, 2);
    const source = new vscode.CancellationTokenSource();
    try {
      for (const model of models) {
        const { stream } = recordingStream();
        const result = await api.test.handleRequest(
          chatRequest(model),
          { history: [] },
          stream,
          source.token,
        );
        assert.deepEqual(result, { metadata: { outcome: "completed", model: model.name } });
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

  it("forwards history through the actual model API without changing markdown text", async () => {
    const api = await participantApi();
    const history: vscode.ChatContext["history"] = [
      { prompt: "question", participant: "q0t4.chat", references: [], toolReferences: [] },
      {
        response: [
          new vscode.ChatResponseMarkdownPart("first"),
          new vscode.ChatResponseMarkdownPart("\nsecond"),
        ],
        result: { metadata: { outcome: "completed" } },
        participant: "q0t4.chat",
      },
    ];
    const source = new vscode.CancellationTokenSource();
    try {
      await api.test.handleRequest(
        chatRequest(await fakeModel(), "next"),
        { history },
        recordingStream().stream,
        source.token,
      );
      const state = await vscode.commands.executeCommand<ProviderState>("q0t4-test.getState");
      assert.deepEqual(state?.requests[0]?.messages, [
        { role: "user", text: "question" },
        { role: "assistant", text: "first\nsecond" },
        { role: "user", text: "next" },
      ]);
    } finally {
      source.dispose();
    }
  });

  it("cancels the actual provider mid-answer and does not emit later chunks", async () => {
    const api = await participantApi();
    const model = await fakeModel();
    await vscode.commands.executeCommand("q0t4-test.hold");
    const source = new vscode.CancellationTokenSource();
    const { stream, markdown } = recordingStream(() => source.cancel());
    try {
      const result = await withDeadline(
        api.test.handleRequest(chatRequest(model), { history: [] }, stream, source.token),
      );
      assert.deepEqual(markdown, ["Hel"]);
      assert.deepEqual(result, { metadata: { outcome: "cancelled", model: model.name } });
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

  it("does not call the provider for an already-cancelled request", async () => {
    const api = await participantApi();
    const source = new vscode.CancellationTokenSource();
    source.cancel();
    const { stream, markdown } = recordingStream();
    try {
      assert.deepEqual(
        await api.test.handleRequest(
          chatRequest(await fakeModel()),
          { history: [] },
          stream,
          source.token,
        ),
        { metadata: { outcome: "cancelled" } },
      );
      assert.deepEqual(markdown, []);
      const state = await vscode.commands.executeCommand<ProviderState>("q0t4-test.getState");
      assert.deepEqual(state?.requests, []);
    } finally {
      source.dispose();
    }
  });

  it("propagates an output failure unchanged and cancels the active provider", async () => {
    const api = await participantApi();
    const model = await fakeModel();
    await vscode.commands.executeCommand("q0t4-test.hold");
    const failure = new Error("output unavailable");
    const { stream, markdown } = recordingStream(() => {
      throw failure;
    });
    const source = new vscode.CancellationTokenSource();
    try {
      await assert.rejects(
        withDeadline(
          api.test.handleRequest(chatRequest(model), { history: [] }, stream, source.token),
        ),
        (error: unknown) => error === failure,
      );
      assert.deepEqual(markdown, ["Hel"]);
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

  it("shows a safe model error instead of the stub or private provider details", async () => {
    const api = await participantApi();
    const model = await fakeModel();
    await vscode.commands.executeCommand("q0t4-test.setError", "Blocked");
    const source = new vscode.CancellationTokenSource();
    const { stream, markdown } = recordingStream();
    try {
      assert.deepEqual(
        await api.test.handleRequest(chatRequest(model), { history: [] }, stream, source.token),
        { metadata: { outcome: "error", model: model.name } },
      );
      assert.deepEqual(markdown, ["Q0T4 couldn't complete this request. Please try again."]);
    } finally {
      source.dispose();
    }
  });

  for (const command of ["status", "subjects", "use"]) {
    it(`does not send the unimplemented /${command} command to a model`, async () => {
      const api = await participantApi();
      const source = new vscode.CancellationTokenSource();
      const { stream, markdown } = recordingStream();
      try {
        assert.deepEqual(
          await api.test.handleRequest(
            chatRequest(await fakeModel(), "", command),
            { history: [] },
            stream,
            source.token,
          ),
          { metadata: { outcome: "error" } },
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
  }
});
