import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { chatStreamOutput } from "../../src/adapters/chatStreamOutput";
import { historyAdapter } from "../../src/adapters/historyAdapter";
import { vscodeModel } from "../../src/adapters/vscodeModel";
import { vscodeModelSelector } from "../../src/adapters/vscodeModelSelector";
import type { ChatMessage } from "../../src/core/types";
import { FakeCancellation } from "../fakes/FakeCancellation";
import {
  FAKE_PROVIDER_ID,
  FAKE_VENDOR,
  fakeModel,
  participantApi,
  recordingStream,
  withDeadline,
} from "./support";

class TrackedSignal extends FakeCancellation {
  active = 0;
  disposals = 0;

  override onCancellationRequested(listener: () => void) {
    this.active++;
    const subscription = super.onCancellationRequested(listener);
    return {
      dispose: () => {
        this.active--;
        this.disposals++;
        subscription.dispose();
      },
    };
  }
}

async function* reply() {
  yield "first";
  yield "\nsecond";
}

function modelFixture(text: AsyncIterable<string> = reply()) {
  const sends: {
    messages: vscode.LanguageModelChatMessage[];
    token: vscode.CancellationToken | undefined;
  }[] = [];
  const counts: {
    input: string | vscode.LanguageModelChatMessage;
    token: vscode.CancellationToken | undefined;
  }[] = [];
  const model: vscode.LanguageModelChat = {
    name: "Adapter fake",
    id: "adapter-fake",
    family: "adapter-family",
    vendor: FAKE_VENDOR,
    version: "1",
    maxInputTokens: 100,
    async sendRequest(messages, _options, token) {
      sends.push({ messages, token });
      return {
        text,
        stream: {
          [Symbol.asyncIterator]() {
            throw new Error("Use response.text, not the raw parts stream");
          },
        },
      };
    },
    async countTokens(input, token) {
      counts.push({ input, token });
      return 7;
    },
  };
  return { model, sends, counts };
}

function messageText(message: vscode.LanguageModelChatMessage): string {
  return message.content
    .map((part) => {
      assert.ok(part instanceof vscode.LanguageModelTextPart);
      return part.value;
    })
    .join("");
}

async function collect(text: AsyncIterable<string>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of text) chunks.push(chunk);
  return chunks;
}

describe("VS Code adapters", () => {
  before(async () => {
    await vscode.extensions.getExtension(FAKE_PROVIDER_ID)?.activate();
  });

  it("vscodeModel exposes the selected model's metadata", () => {
    const { model } = modelFixture();
    const port = vscodeModel(model);
    for (const key of ["name", "id", "family", "vendor", "maxInputTokens"] as const) {
      assert.equal(port[key], model[key]);
    }
  });

  it("maps immutable user/assistant messages and streams only response.text", async () => {
    const { model, sends } = modelFixture();
    const signal = new TrackedSignal();
    const messages: readonly ChatMessage[] = Object.freeze([
      Object.freeze({ role: "user", text: " exact\nuser " }),
      Object.freeze({ role: "assistant", text: "reply" }),
    ]);
    assert.deepEqual(await collect(await vscodeModel(model).sendRequest(messages, signal)), [
      "first",
      "\nsecond",
    ]);
    assert.deepEqual(
      sends[0]?.messages.map((message) => [message.role, messageText(message)]),
      [
        [vscode.LanguageModelChatMessageRole.User, " exact\nuser "],
        [vscode.LanguageModelChatMessageRole.Assistant, "reply"],
      ],
    );
    assert.equal(signal.active, 0);
    assert.equal(signal.disposals, 1);
  });

  it("countTokens delegates strings and both message roles with a linked token", async () => {
    const { model, counts } = modelFixture();
    const port = vscodeModel(model);
    const signal = new TrackedSignal();
    assert.equal(await port.countTokens(" exact text ", signal), 7);
    assert.equal(await port.countTokens({ role: "user", text: "user" }, signal), 7);
    assert.equal(await port.countTokens({ role: "assistant", text: "answer" }, signal), 7);
    assert.equal(counts[0]?.input, " exact text ");
    for (const [index, role] of [
      [1, vscode.LanguageModelChatMessageRole.User],
      [2, vscode.LanguageModelChatMessageRole.Assistant],
    ] as const) {
      const input = counts[index]?.input;
      assert.ok(input instanceof vscode.LanguageModelChatMessage);
      assert.equal(input.role, role);
      assert.equal(messageText(input), index === 1 ? "user" : "answer");
    }
    assert.ok(counts.every((call) => call.token !== undefined));
    assert.equal(signal.active, 0);
    assert.equal(signal.disposals, 3);
    signal.cancel();
    assert.ok(counts.every((call) => !call.token?.isCancellationRequested));
  });

  it("countTokens also works without a cancellation signal", async () => {
    assert.equal(await vscodeModel(modelFixture().model).countTokens("text"), 7);
  });

  it("delegates token counting through the actual fake provider", async () => {
    const port = vscodeModel(await fakeModel());
    assert.equal(await port.countTokens("abcde"), 2);
    assert.equal(await port.countTokens({ role: "assistant", text: "abcdefgh" }), 2);
  });

  it("cancels the underlying request when the core signal fires", async () => {
    const { model, sends } = modelFixture();
    const signal = new TrackedSignal();
    const stream = await vscodeModel(model).sendRequest([], signal);
    const token = sends[0]?.token;
    assert.ok(token);
    assert.equal(token.isCancellationRequested, false);
    signal.cancel();
    assert.equal(token.isCancellationRequested, true);
    await stream[Symbol.asyncIterator]().return?.();
    assert.equal(signal.active, 0);
  });

  it("passes an already-cancelled signal to the underlying model as a cancelled token", async () => {
    const { model, sends } = modelFixture();
    const signal = new TrackedSignal();
    signal.cancel();
    const stream = await vscodeModel(model).sendRequest([], signal);
    assert.equal(sends[0]?.token?.isCancellationRequested, true);
    await stream[Symbol.asyncIterator]().return?.();
    assert.equal(signal.active, 0);
  });

  it("closes and unlinks a stream before its first next(), exactly once", async () => {
    let reads = 0;
    let closes = 0;
    const { model, sends } = modelFixture({
      [Symbol.asyncIterator]() {
        return {
          async next() {
            reads++;
            return { done: false, value: "unused" };
          },
          async return() {
            closes++;
            return { done: true, value: undefined };
          },
        };
      },
    });
    const signal = new TrackedSignal();
    const iterator = (await vscodeModel(model).sendRequest([], signal))[Symbol.asyncIterator]();
    await iterator.return?.();
    await iterator.return?.();
    assert.equal(reads, 0);
    assert.equal(closes, 1);
    assert.equal(sends[0]?.token?.isCancellationRequested, true);
    assert.equal(signal.active, 0);
    assert.equal(signal.disposals, 1);
    assert.equal((await iterator.next()).done, true);
  });

  it("cancels and unlinks when a consumer breaks out of the stream", async () => {
    const { model, sends } = modelFixture();
    const signal = new TrackedSignal();
    for await (const chunk of await vscodeModel(model).sendRequest([], signal)) {
      assert.equal(chunk, "first");
      break;
    }
    assert.equal(sends[0]?.token?.isCancellationRequested, true);
    assert.equal(signal.active, 0);
    assert.equal(signal.disposals, 1);
  });

  it("does not cancel the caller or retain its listener after normal completion", async () => {
    const { model, sends } = modelFixture();
    const signal = new TrackedSignal();
    await collect(await vscodeModel(model).sendRequest([], signal));
    assert.equal(signal.isCancellationRequested, false);
    signal.cancel();
    assert.equal(sends[0]?.token?.isCancellationRequested, false);
    assert.equal(signal.active, 0);
    assert.equal(signal.disposals, 1);
  });

  it("does not close or cancel an already completed response again", async () => {
    let closes = 0;
    const { model, sends } = modelFixture({
      [Symbol.asyncIterator]() {
        return {
          async next() {
            return { done: true, value: undefined };
          },
          async return() {
            closes++;
            return { done: true, value: undefined };
          },
        };
      },
    });
    const signal = new TrackedSignal();
    const iterator = (await vscodeModel(model).sendRequest([], signal))[Symbol.asyncIterator]();
    assert.equal((await iterator.next()).done, true);
    await iterator.return?.();
    assert.equal(closes, 0);
    assert.equal(sends[0]?.token?.isCancellationRequested, false);
    assert.equal(signal.active, 0);
    assert.equal(signal.disposals, 1);
  });

  it("cancels and unlinks an unfinished response that has no return method", async () => {
    const { model, sends } = modelFixture({
      [Symbol.asyncIterator]() {
        return {
          async next() {
            return { done: false, value: "text" };
          },
        };
      },
    });
    const signal = new TrackedSignal();
    const iterator = (await vscodeModel(model).sendRequest([], signal))[Symbol.asyncIterator]();
    await iterator.return?.();
    assert.equal(sends[0]?.token?.isCancellationRequested, true);
    assert.equal(signal.active, 0);
    assert.equal(signal.disposals, 1);
  });

  it("keeps concurrent sends on the same adapter independently cancellable", async () => {
    const { model, sends } = modelFixture();
    const port = vscodeModel(model);
    const first = new TrackedSignal();
    const second = new TrackedSignal();
    const stream1 = await port.sendRequest([], first);
    const stream2 = await port.sendRequest([], second);
    first.cancel();
    assert.equal(sends[0]?.token?.isCancellationRequested, true);
    assert.equal(sends[1]?.token?.isCancellationRequested, false);
    await stream1[Symbol.asyncIterator]().return?.();
    await stream2[Symbol.asyncIterator]().return?.();
    assert.equal(first.active + second.active, 0);
  });

  for (const failure of [new Error("private send failure"), "non-Error send failure"]) {
    it(`preserves send rejection and releases its cancellation listener (${String(failure)})`, async () => {
      const { model } = modelFixture();
      model.sendRequest = async () => {
        throw failure;
      };
      const signal = new TrackedSignal();
      await assert.rejects(
        vscodeModel(model).sendRequest([], signal),
        (error: unknown) => error === failure,
      );
      assert.equal(signal.active, 0);
      assert.equal(signal.disposals, 1);
    });
  }

  it("cancels a request while sendRequest is still pending", async () => {
    const { model } = modelFixture();
    const failure = new vscode.CancellationError();
    model.sendRequest = (_messages, _options, token) =>
      new Promise((_resolve, reject) => {
        assert.ok(token);
        const subscription = token.onCancellationRequested(() => {
          subscription.dispose();
          reject(failure);
        });
      });
    const signal = new TrackedSignal();
    const pending = vscodeModel(model).sendRequest([], signal);
    signal.cancel();
    await assert.rejects(withDeadline(pending), (error: unknown) => error === failure);
    assert.equal(signal.active, 0);
  });

  it("releases cancellation resources when acquiring the response iterator throws", async () => {
    const failure = new Error("iterator setup failed");
    const { model } = modelFixture({
      [Symbol.asyncIterator]() {
        throw failure;
      },
    });
    const signal = new TrackedSignal();
    await assert.rejects(
      vscodeModel(model).sendRequest([], signal),
      (error: unknown) => error === failure,
    );
    assert.equal(signal.active, 0);
    assert.equal(signal.disposals, 1);
  });

  it("preserves a stream failure and releases its listener", async () => {
    const failure = new Error("private stream failure");
    const { model, sends } = modelFixture({
      async *[Symbol.asyncIterator]() {
        yield "partial";
        throw failure;
      },
    });
    const signal = new TrackedSignal();
    const iterator = (await vscodeModel(model).sendRequest([], signal))[Symbol.asyncIterator]();
    assert.equal((await iterator.next()).value, "partial");
    await assert.rejects(iterator.next(), (error: unknown) => error === failure);
    await iterator.return?.();
    assert.equal(sends[0]?.token?.isCancellationRequested, true);
    assert.equal(signal.active, 0);
    assert.equal(signal.disposals, 1);
  });

  it("releases its listener even when closing the response iterator rejects", async () => {
    const failure = new Error("close failed");
    const { model } = modelFixture({
      [Symbol.asyncIterator]() {
        return {
          async next() {
            return { done: false, value: "text" };
          },
          async return() {
            throw failure;
          },
        };
      },
    });
    const signal = new TrackedSignal();
    const iterator = (await vscodeModel(model).sendRequest([], signal))[Symbol.asyncIterator]();
    assert.ok(iterator.return);
    await assert.rejects(iterator.return(), (error: unknown) => error === failure);
    assert.equal(signal.active, 0);
    assert.equal(signal.disposals, 1);
  });

  it("releases token-counting resources when counting rejects", async () => {
    const failure = new Error("count failed");
    const { model } = modelFixture();
    model.countTokens = async () => {
      throw failure;
    };
    const signal = new TrackedSignal();
    await assert.rejects(
      vscodeModel(model).countTokens("text", signal),
      (error: unknown) => error === failure,
    );
    assert.equal(signal.active, 0);
    assert.equal(signal.disposals, 1);
  });

  it("links cancellation while token counting is pending", async () => {
    const failure = new vscode.CancellationError();
    const { model } = modelFixture();
    model.countTokens = (_input, token) =>
      new Promise((_resolve, reject) => {
        assert.ok(token);
        const subscription = token.onCancellationRequested(() => {
          subscription.dispose();
          reject(failure);
        });
      });
    const signal = new TrackedSignal();
    const pending = vscodeModel(model).countTokens("text", signal);
    signal.cancel();
    await assert.rejects(withDeadline(pending), (error: unknown) => error === failure);
    assert.equal(signal.active, 0);
  });

  it("vscodeModelSelector delegates vendor/family/id filtering and wraps the selected model", async () => {
    const model = await fakeModel();
    const selected = await vscodeModelSelector.select({
      vendor: FAKE_VENDOR,
      family: model.family,
      id: model.id,
    });
    assert.equal(selected.length, 1);
    assert.equal(selected[0]?.name, model.name);
    assert.equal(selected[0]?.id, model.id);
    assert.equal(await selected[0]?.countTokens("abcde"), 2);
    assert.deepEqual(
      await vscodeModelSelector.select({ vendor: FAKE_VENDOR, id: "missing-model" }),
      [],
    );
  });

  it("chatStreamOutput forwards markdown and progress without modifying text", () => {
    const { stream, calls } = recordingStream();
    const output = chatStreamOutput(stream);
    output.markdown(" **exact**\n");
    output.progress("working");
    assert.deepEqual(calls, [
      { kind: "markdown", text: " **exact**\n" },
      { kind: "progress", text: "working" },
    ]);
  });

  it("historyAdapter maps commands, metadata and markdown parts in order without separators", () => {
    const metadata = Object.freeze({ outcome: "completed", model: "old model" });
    const history: vscode.ChatContext["history"] = Object.freeze([
      Object.freeze({
        prompt: " exact request ",
        command: "use",
        participant: "q0t4.chat",
        references: [],
        toolReferences: [],
      }),
      Object.freeze({
        response: Object.freeze([
          new vscode.ChatResponseMarkdownPart("first"),
          new vscode.ChatResponseAnchorPart(vscode.Uri.file("/ignored")),
          new vscode.ChatResponseMarkdownPart(new vscode.MarkdownString("\n**second** ")),
          new vscode.ChatResponseCommandButtonPart({ title: "ignored", command: "ignored" }),
        ]),
        result: Object.freeze({ metadata }),
        participant: "q0t4.chat",
      }),
    ]);
    const turns = historyAdapter(history);
    assert.deepEqual(turns, [
      { kind: "request", prompt: " exact request ", command: "use" },
      { kind: "response", text: "first\n**second** ", metadata },
    ]);
    assert.equal(turns[1]?.kind === "response" && turns[1].metadata, metadata);
    assert.equal(history.length, 2);
  });

  it("maps empty history and absent optional values without manufacturing text or metadata", () => {
    assert.deepEqual(historyAdapter([]), []);
    assert.deepEqual(
      historyAdapter([
        { prompt: "", participant: "q0t4.chat", references: [], toolReferences: [] },
        {
          response: [new vscode.ChatResponseFileTreePart([], vscode.Uri.file("/ignored"))],
          result: {},
          participant: "q0t4.chat",
        },
      ]),
      [
        { kind: "request", prompt: "" },
        { kind: "response", text: "" },
      ],
    );
  });
});

describe("globalStateStorage adapter", () => {
  it("get/set/keys round-trip through ExtensionContext.globalState", async () => {
    const { storage } = (await participantApi()).test;
    const key = "q0t4.test.roundtrip";
    try {
      assert.equal(storage.get(key), undefined);
      await storage.set(key, { total: 5, nested: { ok: true } });
      assert.deepEqual(storage.get(key), { total: 5, nested: { ok: true } });
      assert.ok(storage.keys().includes(key));
    } finally {
      await storage.set(key, undefined);
    }
    assert.equal(storage.get(key), undefined);
    assert.ok(!storage.keys().includes(key));
  });
});
