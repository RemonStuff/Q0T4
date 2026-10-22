import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileLedger } from "../../src/adapters/fileLedger";
import { LEGACY_TOTALS_KEY, createRequestHandler, housekeeping } from "../../src/extension";
import {
  FAKE_PROVIDER_ID,
  FAKE_VENDOR,
  Q0T4_ID,
  chatRequest,
  fakeModel,
  outcomeOf,
  participantApi,
  recordingStream,
  replyText,
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
      assert.equal(replyText(markdown), "Hello!");
      assert.deepEqual(outcomeOf(result), { outcome: "completed", model: model.name });
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
      assert.deepEqual(outcomeOf(result), { outcome: "cancelled", model: model.name });
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
        outcomeOf(
          await api.test.handleRequest(
            chatRequest(await fakeModel()),
            { history: [] },
            stream,
            source.token,
          ),
        ),
        { outcome: "cancelled" },
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
        outcomeOf(
          await api.test.handleRequest(chatRequest(model), { history: [] }, stream, source.token),
        ),
        { outcome: "error", model: model.name },
      );
      assert.equal(replyText(markdown), "Q0T4 couldn't complete this request. Please try again.");
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
          outcomeOf(
            await api.test.handleRequest(
              chatRequest(await fakeModel(), "", command),
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
  }

  describe("@q0t4 budget enforcement", () => {
    type Usage = { inputTokens: number; outputTokens: number; stopped: unknown };

    const weekTokens = async () =>
      (await (await participantApi()).test.ledger.usedThisWeek("general")).tokens;

    async function request(prompt = "hi") {
      const api = await participantApi();
      const source = new vscode.CancellationTokenSource();
      const { stream, markdown } = recordingStream();
      try {
        const result = await api.test.handleRequest(
          chatRequest(await fakeModel(), prompt),
          { history: [] },
          stream,
          source.token,
        );
        return {
          api,
          markdown,
          text: markdown.join(""),
          metadata: (result as { metadata: Usage }).metadata,
        };
      } finally {
        source.dispose();
      }
    }

    before(async () => {
      await vscode.extensions.getExtension(FAKE_PROVIDER_ID)?.activate();
      await (
        await participantApi()
      ).test.ready;
    });

    beforeEach(async () => {
      await vscode.commands.executeCommand("q0t4-test.setScript", ["Hello", " world"]);
    });

    afterEach(async () => {
      (await participantApi()).test.setLimit(undefined);
    });

    it("handleRequest appends a footer with the usage this request", async () => {
      const before = await weekTokens();
      const { text, metadata } = await request();
      assert.ok(text.startsWith("Hello world\n\n<!-- q0t4:footer -->\n\n*general: "), text);
      assert.match(text, / \/ 200k this week · resets (Mon) · /);
      assert.equal(metadata.stopped, false);
      assert.ok(metadata.inputTokens > 0 && metadata.outputTokens > 0);
      assert.equal(await weekTokens(), before + metadata.inputTokens + metadata.outputTokens);
    });

    it("the footer shows the weekday of the next reset", async () => {
      const { text } = await request();
      // The default week resets on Monday.
      assert.match(text, /this week · resets Mon · /);
    });

    it("handleRequest stops a long fake reply with ⛔ when the budget is tiny", async () => {
      const api = await participantApi();
      const chunk = "x".repeat(40);
      await vscode.commands.executeCommand("q0t4-test.setScript", Array(10).fill(chunk));
      api.test.setLimit((await weekTokens()) + 15);
      const { text, metadata } = await request();
      assert.ok(text.includes("⛔ Stopped: general weekly budget reached."), text);
      assert.equal(metadata.stopped, "budget");
      assert.ok(text.split(chunk).length - 1 < 10, "the whole reply was streamed");
      assert.ok(text.includes("<!-- q0t4:footer -->"));
    });

    it("handleRequest refuses before calling the model when the total is already at the limit", async () => {
      const api = await participantApi();
      api.test.setLimit(await weekTokens());
      const { text, metadata } = await request();
      assert.ok(text.includes("This request doesn't fit the budget for general."), text);
      assert.match(text, /Resets: Mon \d{1,2} [A-Z][a-z]{2}\./);
      assert.equal(metadata.stopped, "precheck");
      assert.equal(metadata.inputTokens, 0);
      const state = await vscode.commands.executeCommand<ProviderState>("q0t4-test.getState");
      assert.deepEqual(state?.requests, []);
    });

    it("handleRequest records a usage entry in the current month's file", async () => {
      const api = await participantApi();
      const { metadata } = await request();
      const file = `${api.test.sessionId.replace(/[^A-Za-z0-9._-]/g, "_")}.jsonl`;
      const months = (await readdir(join(api.test.ledgerRoot, "ledger"))).sort();
      const month = months.at(-1) ?? "";
      assert.match(month, /^\d{4}-\d{2}$/);
      const lines = (await readFile(join(api.test.ledgerRoot, "ledger", month, file), "utf8"))
        .trim()
        .split("\n");
      const last = JSON.parse(lines.at(-1) ?? "{}") as {
        kind: string;
        subject: string;
        day: string;
        source: string;
        tokens: { input: number; output: number };
      };
      assert.equal(last.kind, "usage");
      assert.equal(last.subject, "general");
      assert.equal(last.source, "q0t4");
      assert.ok(last.day.startsWith(month));
      assert.deepEqual(last.tokens, { input: metadata.inputTokens, output: metadata.outputTokens });
    });

    it("usage persists across a deactivate/activate cycle", async () => {
      const api = await participantApi();
      const { metadata } = await request();
      // A second activation reads the same files through its own writer.
      const reactivated = createRequestHandler({
        ledgerPort: fileLedger(api.test.ledgerRoot, "after-reload"),
      });
      const total = (await reactivated.ledger.usedThisWeek("general")).tokens;
      assert.equal(total, await weekTokens());
      assert.ok(total >= metadata.inputTokens + metadata.outputTokens);
    });

    it("two windows on the same storage both see each other's usage", async () => {
      const api = await participantApi();
      const other = createRequestHandler({
        ledgerPort: fileLedger(api.test.ledgerRoot, "window-b"),
      });
      const before = await weekTokens();
      const source = new vscode.CancellationTokenSource();
      try {
        const result = (await other.handleRequest(
          chatRequest(await fakeModel(), "from window b"),
          { history: [] },
          recordingStream().stream,
          source.token,
        )) as { metadata: Usage };
        const used = result.metadata.inputTokens + result.metadata.outputTokens;
        assert.ok(used > 0);
        assert.equal(await weekTokens(), before + used);
        assert.equal((await other.ledger.usedThisWeek("general")).tokens, before + used);
      } finally {
        source.dispose();
      }
    });

    it("activation removes the iteration 2 totals key", async () => {
      const api = await participantApi();
      await api.test.storage.set(LEGACY_TOTALS_KEY, { general: { tokens: 123 } });
      assert.ok(api.test.storage.keys().includes(LEGACY_TOTALS_KEY));
      await housekeeping(api.test.ledger, api.test.storage);
      assert.ok(!api.test.storage.keys().includes(LEGACY_TOTALS_KEY));
    });

    it("activation prunes month folders older than 13 months", async () => {
      const api = await participantApi();
      const old = join(api.test.ledgerRoot, "ledger", "2020-01");
      await mkdir(old, { recursive: true });
      await writeFile(join(old, "old-window.jsonl"), "");
      await housekeeping(api.test.ledger, api.test.storage);
      const months = await readdir(join(api.test.ledgerRoot, "ledger"));
      assert.ok(!months.includes("2020-01"), months.join(", "));
      assert.ok(months.length > 0, "the current month must stay");
    });

    it("does not send the request when the ledger can't be read", async () => {
      const unreadable = createRequestHandler({
        ledgerPort: {
          append: async () => undefined,
          read: async () => {
            throw new Error("EACCES: private path");
          },
          months: async () => [],
          removeMonth: async () => undefined,
        },
      });
      const source = new vscode.CancellationTokenSource();
      const { stream, markdown } = recordingStream();
      try {
        const result = await unreadable.handleRequest(
          chatRequest(await fakeModel()),
          { history: [] },
          stream,
          source.token,
        );
        assert.deepEqual(result, { metadata: { outcome: "error" } });
        assert.equal(markdown.length, 1);
        assert.ok(markdown[0]?.includes("did not send your request"));
        assert.ok(!markdown[0]?.includes("EACCES"));
        const state = await vscode.commands.executeCommand<ProviderState>("q0t4-test.getState");
        assert.deepEqual(state?.requests, []);
      } finally {
        source.dispose();
      }
    });
  });
});
